import { BrowserWindow, ipcMain } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { IpcChannel } from '@shared/ipc-channels';
import { ExtensionError } from '@shared/errors';
import { createLogger } from '@shared/logger';
import { ExtensionApi, type ExtensionCapabilities } from './extension-api';
import type { ExtensionRegistry } from './extension-registry';
import type { ExtensionManifest, InstalledExtension } from '@shared/types';

const log = createLogger('extension-host');

/** How long an extension may take to report that it started. */
const START_TIMEOUT_MS = 10_000;

/**
 * Runs extensions, away from everything.
 *
 * Extension code executes in a hidden, sandboxed renderer with no Node, and
 * inside that page it executes in a Worker, which has no document either. The
 * only thing it can do is post a message, and every message lands here, where
 * the permission gate decides before anything happens.
 *
 * The source is read here and handed to the page as text. The page has no
 * filesystem access and no network, so a blob built from that text is the only
 * way code gets in, and the page's own policy allows nothing else.
 */
export class ExtensionHost extends EventEmitter {
  #window: BrowserWindow | null = null;
  #registry: ExtensionRegistry;
  #api: ExtensionApi;
  #preloadPath: string;
  #pagePath: string;

  /** Manifests of what is currently running, by extension id. */
  #running = new Map<string, ExtensionManifest>();
  /** Command ids each running extension has wired a handler to. */
  #commands = new Map<string, Set<string>>();
  /** Resolvers for extensions that are starting. */
  #starting = new Map<string, { resolve: () => void; reject: (error: unknown) => void }>();
  #ready: Promise<void> | null = null;

  constructor(options: {
    registry: ExtensionRegistry;
    capabilities: ExtensionCapabilities;
    preloadPath: string;
    pagePath: string;
  }) {
    super();
    this.#registry = options.registry;
    this.#api = new ExtensionApi(options.capabilities);
    this.#preloadPath = options.preloadPath;
    this.#pagePath = options.pagePath;

    ipcMain.on(IpcChannel.ExtensionHostToMain, (event, message: unknown) => {
      // Only the host window is listened to. Any other sender is either a bug
      // or something that should not be able to reach this at all.
      if (event.sender !== this.#window?.webContents) return;
      void this.#onMessage(message as Record<string, unknown>);
    });
  }

  /** Extension ids that are running right now. */
  running(): string[] {
    return [...this.#running.keys()];
  }

  /**
   * Records that an extension wired a handler to one of its commands.
   *
   * Called after the permission gate allowed the registration, so nothing
   * reaches this that was not already checked.
   */
  noteCommand(extensionId: string, commandId: string): void {
    const existing = this.#commands.get(extensionId) ?? new Set<string>();
    existing.add(commandId);
    this.#commands.set(extensionId, existing);
  }

  /** The commands one extension currently answers. */
  commandsFor(extensionId: string): string[] {
    return [...(this.#commands.get(extensionId) ?? [])];
  }

  /* ------------------------------------------------------------------ */
  /* The window                                                          */
  /* ------------------------------------------------------------------ */

  async #ensureWindow(): Promise<void> {
    if (this.#window && !this.#window.isDestroyed()) {
      await this.#ready;
      return;
    }

    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        // The three that make this a sandbox rather than a second main
        // process. An extension that escapes its worker lands here, and here
        // there is still nothing to reach.
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        webviewTag: false,
        preload: this.#preloadPath,
        // Nothing is ever shown, so nothing needs to keep painting.
        backgroundThrottling: true
      }
    });

    this.#window = window;

    this.#ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new ExtensionError({
            code: 'EXTENSION_HOST_TIMEOUT',
            message: 'The extension host did not start',
            cause: `The hidden page did not report itself ready within ${START_TIMEOUT_MS / 1000} seconds.`,
            solution: 'Restart cairn-code. If it keeps happening, start it from a terminal and report what is printed.'
          })
        );
      }, START_TIMEOUT_MS);

      this.once('host-ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    window.on('closed', () => {
      this.#window = null;
      this.#ready = null;
      this.#running.clear();
    });

    await window.loadFile(this.#pagePath);
    await this.#ready;
  }

  /* ------------------------------------------------------------------ */
  /* Starting and stopping                                               */
  /* ------------------------------------------------------------------ */

  /** Starts every enabled extension that has code to run. */
  async startAll(): Promise<void> {
    const enabled = await this.#registry.enabled();
    const runnable = enabled.filter((entry) => entry.manifest.main !== undefined);

    // A data-only extension contributes through its manifest and needs no
    // host at all, so starting the window for one would be waste.
    if (runnable.length === 0) return;

    for (const entry of runnable) {
      await this.start(entry).catch((error: unknown) => {
        log.warn(`${entry.manifest.id} did not start: ${String(error)}`);
        this.emit('failed', { id: entry.manifest.id, message: describe(error) });
      });
    }
  }

  /** Starts one extension and waits for it to report itself ready. */
  async start(entry: InstalledExtension): Promise<void> {
    const { manifest, path } = entry;
    if (manifest.main === undefined) return;
    if (this.#running.has(manifest.id)) return;

    let source: string;
    try {
      source = await readFile(join(path, manifest.main), 'utf8');
    } catch (error) {
      throw new ExtensionError({
        code: 'EXTENSION_SOURCE_MISSING',
        message: `${manifest.id} has no code where its manifest says`,
        cause: `Reading ${manifest.main} from ${path} failed: ${describe(error)}`,
        solution: 'Reinstall the extension. Its files are incomplete on disk.'
      });
    }

    await this.#ensureWindow();
    this.#running.set(manifest.id, manifest);

    const started = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#starting.delete(manifest.id);
        reject(
          new ExtensionError({
            code: 'EXTENSION_START_TIMEOUT',
            message: `${manifest.id} did not finish starting`,
            cause: `It was still loading after ${START_TIMEOUT_MS / 1000} seconds. A loop at the top level of an extension does this.`,
            solution: 'Disable the extension in the Extensions panel, and report the delay to whoever published it.'
          })
        );
      }, START_TIMEOUT_MS);

      this.#starting.set(manifest.id, {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
    });

    this.#toHost({ kind: 'start', id: manifest.id, source });

    try {
      await started;
      log.info(`Started ${manifest.id} ${manifest.version}`);
    } catch (error) {
      this.#running.delete(manifest.id);
      throw error;
    }
  }

  /** Stops one extension. */
  stop(id: string): void {
    if (!this.#running.delete(id)) return;
    this.#commands.delete(id);
    this.#toHost({ kind: 'stop', id });
  }

  /** Stops everything and closes the window. */
  async dispose(): Promise<void> {
    this.#toHost({ kind: 'stop-all' });
    this.#running.clear();

    const window = this.#window;
    this.#window = null;
    this.#ready = null;
    if (window && !window.isDestroyed()) window.destroy();
  }

  /** Asks a running extension to run one of its commands. */
  invokeCommand(extensionId: string, commandId: string): void {
    if (!this.#running.has(extensionId)) return;
    this.#toHost({ kind: 'command', id: extensionId, commandId });
  }

  /* ------------------------------------------------------------------ */
  /* Messages                                                            */
  /* ------------------------------------------------------------------ */

  async #onMessage(message: Record<string, unknown>): Promise<void> {
    switch (message['kind']) {
      case 'host-ready':
        this.emit('host-ready');
        return;

      case 'started':
        this.#starting.get(String(message['id']))?.resolve();
        this.#starting.delete(String(message['id']));
        return;

      case 'failed': {
        const id = String(message['id']);
        const text = String(message['message'] ?? 'The extension failed.');

        const pending = this.#starting.get(id);
        if (pending) {
          this.#starting.delete(id);
          pending.reject(
            new ExtensionError({
              code: 'EXTENSION_FAILED',
              message: `${id} failed while starting`,
              cause: text,
              solution: 'Disable it in the Extensions panel, and report the message above to whoever published it.'
            })
          );
        }

        this.#running.delete(id);
        this.emit('failed', { id, message: text });
        return;
      }

      case 'call':
        await this.#onCall(message);
        return;

      default:
        return;
    }
  }

  /**
   * Runs one API call on behalf of one extension.
   *
   * The manifest comes from what is running here, never from the message, so
   * an extension cannot claim another's permissions by saying so.
   */
  async #onCall(message: Record<string, unknown>): Promise<void> {
    const id = String(message['id']);
    const callId = message['callId'];
    const manifest = this.#running.get(id);

    if (!manifest) {
      this.#toHost({
        kind: 'result',
        id,
        payload: {
          kind: 'result',
          id: callId,
          ok: false,
          error: { code: 'EXTENSION_NOT_RUNNING', message: 'This extension is no longer running.' }
        }
      });
      return;
    }

    try {
      const value = await this.#api.call(
        manifest,
        String(message['method']),
        Array.isArray(message['args']) ? message['args'] : []
      );

      this.#toHost({ kind: 'result', id, payload: { kind: 'result', id: callId, ok: true, value } });
    } catch (error) {
      const failure = error as { code?: string; message?: string; userCause?: string; solution?: string };

      log.debug(`${id} was refused ${String(message['method'])}: ${failure.message ?? String(error)}`);

      this.#toHost({
        kind: 'result',
        id,
        payload: {
          kind: 'result',
          id: callId,
          ok: false,
          error: {
            code: failure.code ?? 'EXTENSION_CALL_FAILED',
            message: failure.message ?? String(error),
            cause: failure.userCause ?? '',
            solution: failure.solution ?? ''
          }
        }
      });
    }
  }

  #toHost(message: unknown): void {
    const window = this.#window;
    if (window && !window.isDestroyed()) {
      window.webContents.send(IpcChannel.ExtensionHostToHost, message);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
