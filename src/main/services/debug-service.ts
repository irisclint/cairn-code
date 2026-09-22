import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { CairnError } from '@shared/errors';
import { createLogger } from '@shared/logger';
import { DapClient, type DapEvent } from './dap-client';
import type {
  DebugConfiguration,
  DebugScope,
  DebugSessionState,
  DebugStackFrame,
  DebugVariable,
  SourceBreakpoint
} from '@shared/types';

const log = createLogger('debug');

/**
 * Runs a debug session.
 *
 * cairn-code implements the client side of the Debug Adapter Protocol and runs
 * whichever adapter the workspace configures. Adapters are large, versioned
 * with the language they debug, and already installed by anyone who debugs
 * that language, so bundling one would pick a winner and add more to the
 * installer than the editor itself.
 *
 * Launch configurations are read from .vscode/launch.json, because that is the
 * file projects already have. Reusing it means an existing repository debugs
 * here with no new configuration at all.
 */
export class DebugService extends EventEmitter {
  #process: ChildProcessWithoutNullStreams | null = null;
  #client: DapClient | null = null;
  #state: DebugSessionState = { status: 'inactive', threadId: null, configurationName: null };
  /** Breakpoints per absolute file path, as the renderer last set them. */
  #breakpoints = new Map<string, SourceBreakpoint[]>();
  #capabilities: Record<string, unknown> = {};

  get state(): DebugSessionState {
    return this.#state;
  }

  /* ------------------------------------------------------------------ */
  /* Configuration                                                       */
  /* ------------------------------------------------------------------ */

  /**
   * Reads the launch configurations a workspace defines.
   *
   * launch.json allows comments and trailing commas, which JSON.parse does
   * not, so they are stripped first. A file that still fails to parse is
   * reported rather than silently treated as empty: an unreadable
   * configuration is exactly the kind of thing a person needs told.
   */
  async listConfigurations(cwd: string): Promise<DebugConfiguration[]> {
    const path = join(cwd, '.vscode', 'launch.json');

    let text: string;
    try {
      text = await readFile(path, 'utf8');
    } catch {
      return [];
    }

    try {
      const parsed = JSON.parse(stripJsonComments(text)) as { configurations?: DebugConfiguration[] };
      return Array.isArray(parsed.configurations) ? parsed.configurations : [];
    } catch (error) {
      throw new CairnError({
        code: 'DEBUG_BAD_CONFIG',
        message: 'launch.json could not be read',
        cause: `${path} is not valid JSON, even allowing for comments and trailing commas: ${String(error)}`,
        solution: 'Open the file and look for a missing comma or bracket; the position in the message above is where the parser gave up.'
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Session lifecycle                                                   */
  /* ------------------------------------------------------------------ */

  /** Starts a session for one configuration. */
  async start(cwd: string, configuration: DebugConfiguration): Promise<void> {
    if (this.#state.status !== 'inactive') {
      throw new CairnError({
        code: 'DEBUG_ALREADY_RUNNING',
        message: 'A debug session is already running',
        cause: `The session for ${this.#state.configurationName ?? 'the current configuration'} has not ended.`,
        solution: 'Stop the running session before starting another one.'
      });
    }

    const adapter = resolveAdapter(configuration);
    this.#setState({ status: 'starting', threadId: null, configurationName: configuration.name });

    const child = spawn(adapter.command, adapter.args, { cwd, windowsHide: true });

    /*
     * A command that does not exist does not make spawn throw. Node reports it
     * asynchronously on the error event, so catching around the call would only
     * ever see the rarer synchronous failures, and a missing adapter would
     * surface as "the session ended" with no hint at what to install.
     */
    const spawnFailed = new Promise<never>((_resolve, reject) => {
      child.once('error', (error) => {
        reject(this.#adapterMissing(adapter.command, configuration.type, error));
      });
    });

    /*
     * Every handler checks that this child is still the one the service owns.
     * A previous adapter can exit long after its session was replaced, and
     * without the guard its exit tears down whichever session is running now.
     */
    const isCurrent = (): boolean => this.#process === child;

    child.stderr.on('data', (chunk: Buffer) => {
      if (isCurrent()) this.emit('output', { category: 'stderr', text: chunk.toString('utf8') });
    });

    child.on('exit', (code) => {
      if (!isCurrent()) return;
      if (code !== 0 && code !== null) {
        this.emit('output', {
          category: 'stderr',
          text: `The debug adapter exited with code ${code}.\n`
        });
      }
      this.#teardown();
    });

    const client = new DapClient(child.stdin, child.stdout);
    this.#process = child;
    this.#client = client;

    client.on('event', (event: DapEvent) => {
      if (this.#client === client) this.#onEvent(event);
    });
    client.on('closed', () => {
      if (this.#client === client) this.#teardown();
    });

    const handshake = this.#handshake(cwd, configuration);

    // Whichever promise loses the race still settles, and a rejection nobody
    // is listening to is reported by Node as unhandled. Both get an observer
    // so that losing the race is not itself an error.
    void handshake.catch(() => undefined);
    void spawnFailed.catch(() => undefined);

    try {
      await Promise.race([handshake, spawnFailed]);
    } catch (error) {
      this.#teardown();
      throw error;
    }
  }

  /**
   * initialize, then launch or attach, then the breakpoints, then
   * configurationDone.
   *
   * The order matters: the adapter only accepts breakpoints after it has
   * reported `initialized`, and only starts running after configurationDone.
   */
  async #handshake(cwd: string, configuration: DebugConfiguration): Promise<void> {
    const client = this.#client;
    if (!client) return;

    const initialized = new Promise<void>((resolve) => {
      const onEvent = (event: DapEvent): void => {
        if (event.event === 'initialized') {
          client.off('event', onEvent);
          resolve();
        }
      };
      client.on('event', onEvent);
    });

    this.#capabilities = ((await client.send('initialize', {
      clientID: 'cairn-code',
      clientName: 'cairn-code',
      adapterID: configuration.type,
      locale: 'en',
      linesStartAt1: true,
      columnsStartAt1: true,
      pathFormat: 'path',
      supportsRunInTerminalRequest: false
    })) ?? {}) as Record<string, unknown>;

    const request = configuration.request === 'attach' ? 'attach' : 'launch';
    const launched = client.send(request, { cwd, ...configuration });

    // A launch that fails answers straight away, well before the initialized
    // event this waits on next. Attaching the observer now rather than at the
    // await below keeps that rejection from being reported as unhandled.
    void launched.catch(() => undefined);

    await initialized;
    await this.#sendAllBreakpoints();

    if (this.#capabilities['supportsConfigurationDoneRequest']) {
      await client.send('configurationDone');
    }

    await launched;

    // Only if nothing has happened since. An adapter is allowed to stop at a
    // breakpoint before it answers configurationDone, and overwriting that
    // with "running" would leave the session stopped while the interface
    // claimed otherwise, with the step buttons disabled.
    if (this.#state.status === 'starting') {
      this.#setState({ ...this.#state, status: 'running' });
    }
  }

  /** Ends the session, politely first and then by force. */
  async stop(): Promise<void> {
    const client = this.#client;
    if (client && !client.closed) {
      // A disconnect that fails still has to end the session, so the result is
      // deliberately ignored.
      await client.send('disconnect', { terminateDebuggee: true }).catch(() => undefined);
    }
    this.#teardown();
  }

  /* ------------------------------------------------------------------ */
  /* Breakpoints                                                         */
  /* ------------------------------------------------------------------ */

  /**
   * Replaces the breakpoints for one file.
   *
   * They are remembered whether or not a session is running, so that setting
   * them before pressing Run works, which is how people actually use a
   * debugger.
   */
  async setBreakpoints(filePath: string, breakpoints: SourceBreakpoint[]): Promise<void> {
    if (breakpoints.length === 0) this.#breakpoints.delete(filePath);
    else this.#breakpoints.set(filePath, breakpoints);

    if (!this.#client || this.#client.closed) return;
    await this.#sendFileBreakpoints(filePath);
  }

  /** Every breakpoint currently known, for the renderer to render. */
  allBreakpoints(): Record<string, SourceBreakpoint[]> {
    return Object.fromEntries(this.#breakpoints);
  }

  async #sendAllBreakpoints(): Promise<void> {
    for (const path of this.#breakpoints.keys()) await this.#sendFileBreakpoints(path);
  }

  async #sendFileBreakpoints(filePath: string): Promise<void> {
    const client = this.#client;
    if (!client || client.closed) return;

    const lines = this.#breakpoints.get(filePath) ?? [];
    await client
      .send('setBreakpoints', {
        source: { path: filePath },
        breakpoints: lines.map((point) => ({ line: point.line, condition: point.condition }))
      })
      .catch((error: unknown) => {
        // A file the adapter cannot map is common and harmless: a breakpoint
        // in a file the program never loads simply never binds.
        log.debug(`setBreakpoints failed for ${filePath}: ${String(error)}`);
      });
  }

  /* ------------------------------------------------------------------ */
  /* Execution                                                           */
  /* ------------------------------------------------------------------ */

  async continue(): Promise<void> {
    await this.#execute('continue', { threadId: this.#state.threadId });
    this.#setState({ ...this.#state, status: 'running' });
  }

  async next(): Promise<void> {
    await this.#execute('next', { threadId: this.#state.threadId });
  }

  async stepIn(): Promise<void> {
    await this.#execute('stepIn', { threadId: this.#state.threadId });
  }

  async stepOut(): Promise<void> {
    await this.#execute('stepOut', { threadId: this.#state.threadId });
  }

  async pause(): Promise<void> {
    await this.#execute('pause', { threadId: this.#state.threadId });
  }

  async #execute(command: string, args: unknown): Promise<void> {
    const client = this.#requireClient(command);
    await client.send(command, args);
  }

  /* ------------------------------------------------------------------ */
  /* Inspection                                                          */
  /* ------------------------------------------------------------------ */

  async stackTrace(): Promise<DebugStackFrame[]> {
    const client = this.#requireClient('stackTrace');
    const body = (await client.send('stackTrace', {
      threadId: this.#state.threadId,
      startFrame: 0,
      levels: 50
    })) as { stackFrames?: Array<Record<string, unknown>> } | undefined;

    return (body?.stackFrames ?? []).map((frame) => ({
      id: Number(frame['id'] ?? 0),
      name: String(frame['name'] ?? ''),
      line: Number(frame['line'] ?? 0),
      column: Number(frame['column'] ?? 0),
      source: typeof frame['source'] === 'object' && frame['source']
        ? String((frame['source'] as Record<string, unknown>)['path'] ?? '')
        : null
    }));
  }

  async scopes(frameId: number): Promise<DebugScope[]> {
    const client = this.#requireClient('scopes');
    const body = (await client.send('scopes', { frameId })) as
      | { scopes?: Array<Record<string, unknown>> }
      | undefined;

    return (body?.scopes ?? []).map((scope) => ({
      name: String(scope['name'] ?? ''),
      variablesReference: Number(scope['variablesReference'] ?? 0),
      expensive: Boolean(scope['expensive'])
    }));
  }

  async variables(reference: number): Promise<DebugVariable[]> {
    const client = this.#requireClient('variables');
    const body = (await client.send('variables', { variablesReference: reference })) as
      | { variables?: Array<Record<string, unknown>> }
      | undefined;

    return (body?.variables ?? []).map((variable) => ({
      name: String(variable['name'] ?? ''),
      value: String(variable['value'] ?? ''),
      type: variable['type'] === undefined ? null : String(variable['type']),
      variablesReference: Number(variable['variablesReference'] ?? 0)
    }));
  }

  /** Evaluates an expression in the selected frame, for the watch box. */
  async evaluate(expression: string, frameId: number | null): Promise<string> {
    const client = this.#requireClient('evaluate');
    const body = (await client.send('evaluate', {
      expression,
      frameId: frameId ?? undefined,
      context: 'repl'
    })) as { result?: unknown } | undefined;

    return String(body?.result ?? '');
  }

  /* ------------------------------------------------------------------ */
  /* Internals                                                           */
  /* ------------------------------------------------------------------ */

  #requireClient(command: string): DapClient {
    if (this.#client && !this.#client.closed) return this.#client;

    throw new CairnError({
      code: 'DEBUG_NOT_RUNNING',
      message: 'No debug session is running',
      cause: `${command} needs a running adapter, and the session has ended or was never started.`,
      solution: 'Start a session from the Run and Debug panel first.'
    });
  }

  #onEvent(event: DapEvent): void {
    const body = (event.body ?? {}) as Record<string, unknown>;

    switch (event.event) {
      case 'stopped':
        this.#setState({
          status: 'stopped',
          threadId: body['threadId'] === undefined ? this.#state.threadId : Number(body['threadId']),
          configurationName: this.#state.configurationName,
          stoppedReason: body['reason'] === undefined ? undefined : String(body['reason'])
        });
        break;

      case 'continued':
        this.#setState({ ...this.#state, status: 'running', stoppedReason: undefined });
        break;

      case 'output':
        this.emit('output', {
          category: String(body['category'] ?? 'console'),
          text: String(body['output'] ?? '')
        });
        break;

      case 'terminated':
      case 'exited':
        this.#teardown();
        break;

      default:
        break;
    }
  }

  #setState(state: DebugSessionState): void {
    this.#state = state;
    this.emit('state', state);
  }

  #teardown(): void {
    if (this.#state.status === 'inactive' && !this.#process) return;

    this.#client?.dispose();
    this.#client = null;

    const child = this.#process;
    this.#process = null;
    // SIGTERM first; an adapter that ignores it is killed by the OS when the
    // editor exits, which is better than leaving the user's program running.
    child?.kill();

    this.#setState({ status: 'inactive', threadId: null, configurationName: null });
  }

  #adapterMissing(command: string, type: string, error: unknown): CairnError {
    return new CairnError({
      code: 'DEBUG_ADAPTER_MISSING',
      message: `The debug adapter for ${type} could not be started`,
      cause: `Running "${command}" failed: ${String(error)}. cairn-code speaks the Debug Adapter Protocol but does not ship adapters, so the one for ${type} has to be installed in the workspace or on the PATH.`,
      solution:
        type === 'python'
          ? 'Install it with pip install debugpy, then start the session again.'
          : 'Install the adapter for this language, or set "debugAdapter" in the configuration to the command that starts it.',
      original: error
    });
  }
}

/* -------------------------------------------------------------------------- */

interface AdapterCommand {
  command: string;
  args: string[];
}

/**
 * Works out what to run for a configuration.
 *
 * An explicit `debugAdapter` always wins, so any adapter can be used. The two
 * defaults cover the languages whose adapters are reachable without extra
 * setup: debugpy as a Python module, and a Node adapter on the PATH.
 */
export function resolveAdapter(configuration: DebugConfiguration): AdapterCommand {
  const command = configuration.debugAdapter;

  if (typeof command === 'string' && command.trim().length > 0) {
    // An explicit argument list is preferred, because splitting a command on
    // spaces breaks the moment the adapter lives under a path containing one.
    if (Array.isArray(configuration.debugAdapterArgs)) {
      return { command, args: configuration.debugAdapterArgs.map(String) };
    }
    const parts = command.split(' ').filter((part) => part.length > 0);
    return { command: parts[0] as string, args: parts.slice(1) };
  }

  if (configuration.type === 'python') {
    return { command: 'python', args: ['-m', 'debugpy.adapter'] };
  }

  return { command: 'js-debug-adapter', args: [] };
}

/**
 * Removes comments and trailing commas so launch.json can be parsed.
 *
 * Scanning rather than a regular expression, because a `//` inside a string
 * literal is not a comment and a pattern cannot tell the difference.
 */
export function stripJsonComments(text: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;
    const next = text[i + 1];

    if (inLine) {
      if (char === '\n') {
        inLine = false;
        out += char;
      }
      continue;
    }

    if (inBlock) {
      if (char === '*' && next === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      out += char;
      if (char === '\\') {
        out += next ?? '';
        i += 1;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === '/' && next === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      inBlock = true;
      i += 1;
      continue;
    }

    out += char;
  }

  // Trailing commas, now that no comment can hide one.
  return out.replace(/,(\s*[}\]])/g, '$1');
}
