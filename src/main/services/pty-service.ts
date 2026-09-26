import { spawn as spawnProcess, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { homedir } from 'node:os';
import type {
  ShellDescriptor,
  TerminalCreateOptions,
  TerminalExitEvent,
  TerminalSession
} from '@shared/types';
import { TerminalError } from '@shared/errors';
import { createLogger } from '@shared/logger';
import { createId } from '@shared/utils';
import { detectShells } from './shell-detector';

const log = createLogger('pty');

/** Minimal surface of node-pty that this service relies on. */
interface PtyProcess {
  pid: number;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
  onData(listener: (data: string) => void): void;
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): void;
}

interface PtyModule {
  spawn(
    file: string,
    args: string[],
    options: { name: string; cols: number; rows: number; cwd: string; env: NodeJS.ProcessEnv }
  ): PtyProcess;
}

interface ManagedTerminal {
  session: TerminalSession;
  pty: PtyProcess | null;
  child: ChildProcessWithoutNullStreams | null;
}

/**
 * Owns every terminal process of the application.
 *
 * node-pty is a native module. When it cannot be loaded (missing prebuild for
 * the current Electron ABI, or a locked-down build machine) the service falls
 * back to a plain piped child process. The fallback has no pseudo terminal, so
 * interactive full-screen programs will not render, but running commands and
 * reading their output keeps working. `TerminalSession.hasPty` tells the
 * renderer which mode is active so it can warn the user instead of silently
 * misbehaving.
 */
export class PtyService {
  #terminals = new Map<string, ManagedTerminal>();
  #ptyModule: PtyModule | null = null;
  #ptyLoadAttempted = false;
  #shells: ShellDescriptor[] | null = null;

  constructor(
    private readonly onData: (id: string, data: string) => void,
    private readonly onExit: (event: TerminalExitEvent) => void
  ) {}

  listShells(): ShellDescriptor[] {
    this.#shells ??= detectShells();
    return this.#shells;
  }

  async create(options: TerminalCreateOptions): Promise<TerminalSession> {
    const shells = this.listShells();
    const shell = options.shellId ? shells.find((entry) => entry.id === options.shellId) : shells[0];

    if (!shell) {
      throw new TerminalError({
        code: 'TERM_NO_SHELL',
        message: 'No shell is available to start a terminal',
        cause: 'causeway could not find a supported shell executable on this system.',
        solution:
          process.platform === 'win32'
            ? 'Install PowerShell 7, or make sure cmd.exe is present in the Windows System32 folder.'
            : 'Install bash or zsh, or set the SHELL environment variable to your preferred shell.'
      });
    }

    const id = createId('term');
    const cwd = options.cwd ?? homedir();
    const env = this.#buildEnv(options.env);
    const ptyModule = await this.#loadPty();

    if (ptyModule) {
      return this.#createWithPty(ptyModule, id, shell, cwd, env, options);
    }
    return this.#createWithPipe(id, shell, cwd, env);
  }

  write(id: string, data: string): void {
    const terminal = this.#requireTerminal(id);
    if (terminal.pty) {
      terminal.pty.write(data);
      return;
    }
    terminal.child?.stdin.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const terminal = this.#terminals.get(id);
    // A resize for a terminal that already exited is a harmless race.
    if (!terminal?.pty) return;
    terminal.pty.resize(Math.max(cols, 1), Math.max(rows, 1));
  }

  dispose(id: string): void {
    const terminal = this.#terminals.get(id);
    if (!terminal) return;
    try {
      terminal.pty?.kill();
      terminal.child?.kill();
    } catch (error) {
      log.warn(`Could not kill terminal ${id}: ${String(error)}`);
    }
    this.#terminals.delete(id);
  }

  disposeAll(): void {
    for (const id of [...this.#terminals.keys()]) this.dispose(id);
  }

  get count(): number {
    return this.#terminals.size;
  }

  #requireTerminal(id: string): ManagedTerminal {
    const terminal = this.#terminals.get(id);
    if (!terminal) {
      throw new TerminalError({
        code: 'TERM_NOT_FOUND',
        message: `Terminal ${id} does not exist`,
        cause: 'The terminal was closed or its process exited before this request arrived.',
        solution: 'Open a new terminal from the Terminal menu and run the command again.'
      });
    }
    return terminal;
  }

  #buildEnv(extra?: Record<string, string>): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';
    env.TERM_PROGRAM = 'causeway';
    // Electron injects these into child processes and they confuse tooling
    // that expects a plain Node environment.
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_NO_ATTACH_CONSOLE;
    return env;
  }

  async #loadPty(): Promise<PtyModule | null> {
    if (this.#ptyLoadAttempted) return this.#ptyModule;
    this.#ptyLoadAttempted = true;
    try {
      const imported = (await import('node-pty')) as unknown as PtyModule & { default?: PtyModule };
      this.#ptyModule = imported.default ?? imported;
      log.info('node-pty loaded, terminals run with a real pseudo terminal');
    } catch (error) {
      this.#ptyModule = null;
      log.warn(
        'node-pty unavailable, terminals fall back to piped child processes. ' +
          'Rebuild native modules with "npx electron-rebuild" to enable full terminal support. ' +
          String(error)
      );
    }
    return this.#ptyModule;
  }

  #createWithPty(
    ptyModule: PtyModule,
    id: string,
    shell: ShellDescriptor,
    cwd: string,
    env: NodeJS.ProcessEnv,
    options: TerminalCreateOptions
  ): TerminalSession {
    let pty: PtyProcess;
    try {
      pty = ptyModule.spawn(shell.executable, shell.args, {
        name: 'xterm-256color',
        cols: Math.max(options.cols, 1),
        rows: Math.max(options.rows, 1),
        cwd,
        env
      });
    } catch (error) {
      throw new TerminalError({
        code: 'TERM_SPAWN_FAILED',
        message: `Could not start ${shell.label}`,
        cause: `Spawning ${shell.executable} failed: ${String(error)}`,
        solution: 'Verify the shell path in Settings under terminal.defaultShell, then try again.',
        original: error
      });
    }

    const session: TerminalSession = {
      id,
      pid: pty.pid,
      shellLabel: shell.label,
      cwd,
      hasPty: true
    };

    pty.onData((data) => this.onData(id, data));
    pty.onExit(({ exitCode, signal }) => {
      this.#terminals.delete(id);
      this.onExit({ id, exitCode, signal });
    });

    this.#terminals.set(id, { session, pty, child: null });
    log.info(`Terminal ${id} started: ${shell.label} (pid ${pty.pid})`);
    return session;
  }

  #createWithPipe(id: string, shell: ShellDescriptor, cwd: string, env: NodeJS.ProcessEnv): TerminalSession {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawnProcess(shell.executable, shell.args, { cwd, env, windowsHide: true });
    } catch (error) {
      throw new TerminalError({
        code: 'TERM_SPAWN_FAILED',
        message: `Could not start ${shell.label}`,
        cause: `Spawning ${shell.executable} failed: ${String(error)}`,
        solution: 'Verify the shell path in Settings under terminal.defaultShell, then try again.',
        original: error
      });
    }

    const session: TerminalSession = {
      id,
      pid: child.pid ?? -1,
      shellLabel: `${shell.label} (no pty)`,
      cwd,
      hasPty: false
    };

    child.stdout.on('data', (chunk: Buffer) => this.onData(id, chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => this.onData(id, chunk.toString('utf8')));
    child.on('exit', (exitCode, signal) => {
      this.#terminals.delete(id);
      this.onExit({ id, exitCode: exitCode ?? 0, signal: signal ? 1 : undefined });
    });

    this.#terminals.set(id, { session, pty: null, child });
    log.info(`Terminal ${id} started in fallback mode: ${shell.label} (pid ${session.pid})`);
    return session;
  }
}
