import type {
  DebugConfiguration,
  InstalledExtension,
  MarketplaceEntry,
  DebugSessionState,
  DebugScope,
  DebugStackFrame,
  DebugVariable,
  GitStatus,
  LintOutcome,
  SourceBreakpoint
} from '@shared/types';
import { vi } from 'vitest';
import type { CairnApi } from '../../../src/preload';

/**
 * An in-memory stand-in for the preload bridge.
 *
 * Renderer code reaches the system only through `window.cairn`, so faking it
 * here lets the stores be tested against their real logic with no Electron and
 * no disk. The fake holds an actual file table, so a write followed by a read
 * behaves the way it does in the product.
 */

export interface FakeFile {
  content: string;
  modifiedAt: number;
}

export interface BridgeState {
  files: Map<string, FakeFile>;
  directories: Map<string, Array<{ name: string; isDirectory: boolean }>>;
  settings: Record<string, unknown>;
  dialogFileResult: string[] | null;
  dialogFolderResult: string | null;
  dialogSaveResult: string | null;
  dialogConfirmResult: boolean;
  searchNames: string[];
  failNextRead: boolean;
  failNextWrite: boolean;
  shortcut: { exists: boolean; path: string; canCreate: boolean; reason?: string };
  /** What the fake ESLint run comes back with. */
  lint: LintOutcome;
  /** What the fake repository looks like. */
  git: { status: GitStatus; branches: string[]; diff: string | null; commits: string[] };
  /** What the fake extension registry and catalogue hold. */
  extensions: {
    installed: InstalledExtension[];
    catalogue: MarketplaceEntry[];
    /** Set to refuse the catalogue with this failure. */
    catalogueError: { code: string; message: string; cause: string; solution: string } | null;
    invoked: Array<{ extensionId: string; commandId: string }>;
  };
  /** What the fake debug adapter reports. */
  debug: {
    configurations: DebugConfiguration[];
    frames: DebugStackFrame[];
    scopes: DebugScope[];
    variables: Record<number, DebugVariable[]>;
    breakpoints: Record<string, SourceBreakpoint[]>;
    started: DebugConfiguration | null;
    actions: string[];
  };
}

export const state: BridgeState = {
  files: new Map(),
  directories: new Map(),
  settings: {},
  dialogFileResult: null,
  dialogFolderResult: null,
  dialogSaveResult: null,
  dialogConfirmResult: true,
  searchNames: [],
  failNextRead: false,
  failNextWrite: false,
  shortcut: { exists: false, path: '/home/dev/Desktop/cairn-code.lnk', canCreate: true },
  lint: { findings: [], ignored: false },
  git: {
    status: { isRepository: false, branch: null, ahead: 0, behind: 0, changes: [] },
    branches: [],
    diff: null,
    commits: []
  },
  extensions: { installed: [], catalogue: [], catalogueError: null, invoked: [] },
  debug: {
    configurations: [],
    frames: [],
    scopes: [],
    variables: {},
    breakpoints: {},
    started: null,
    actions: []
  }
};

const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const fail = (code: string, message: string) => ({
  ok: false as const,
  error: { code, message, cause: 'A test fixture made this call fail.', solution: 'Adjust the fixture.' }
});

/** Listeners registered through the bridge, so a test can fire an event. */
export const listeners = {
  workspaceChanged: [] as Array<(info: unknown) => void>,
  fileEvents: [] as Array<(events: unknown) => void>,
  terminalData: [] as Array<(event: unknown) => void>,
  terminalExit: [] as Array<(event: unknown) => void>,
  menuCommand: [] as Array<(command: string) => void>,
  windowState: [] as Array<(state: unknown) => void>,
  updateStatus: [] as Array<(status: unknown) => void>,
  debugState: [] as Array<(state: DebugSessionState) => void>,
  debugOutput: [] as Array<(output: unknown) => void>,
  extensionsChanged: [] as Array<(change: unknown) => void>
};

export const calls = {
  terminalWrite: [] as Array<[string, string]>,
  terminalResize: [] as Array<[string, number, number]>,
  terminalDispose: [] as string[]
};

function subscribe<T>(bucket: Array<(payload: T) => void>, listener: (payload: T) => void): () => void {
  bucket.push(listener);
  return () => {
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
}

export function createBridge(): CairnApi {
  const bridge = {
    app: {
      getInfo: vi.fn(async () =>
        ok({
          name: 'cairn-code',
          version: '1.0.0-test',
          electron: '44.0.0',
          chrome: '152.0.0',
          node: '24.0.0',
          platform: 'win32',
          arch: 'x64',
          isPackaged: false
        })
      )
    },

    window: {
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      close: vi.fn(),
      isMaximized: vi.fn(async () => ok(false)),
      onStateChanged: vi.fn((listener: (payload: unknown) => void) =>
        subscribe(listeners.windowState, listener)
      )
    },

    dialog: {
      openFile: vi.fn(async () => ok(state.dialogFileResult)),
      openFolder: vi.fn(async () => ok(state.dialogFolderResult)),
      saveFile: vi.fn(async () => ok(state.dialogSaveResult)),
      confirm: vi.fn(async () => ok(state.dialogConfirmResult))
    },

    fs: {
      readFile: vi.fn(async (path: string) => {
        if (state.failNextRead) {
          state.failNextRead = false;
          return fail('FS_ENOENT', 'File or folder not found: ' + path);
        }
        const file = state.files.get(path);
        if (!file) return fail('FS_ENOENT', 'File or folder not found: ' + path);
        return ok({
          path,
          content: file.content,
          encoding: 'utf8' as const,
          size: file.content.length,
          modifiedAt: file.modifiedAt,
          isLarge: file.content.length > 4 * 1024 * 1024
        });
      }),

      writeFile: vi.fn(async (path: string, content: string) => {
        if (state.failNextWrite) {
          state.failNextWrite = false;
          return fail('FS_EACCES', 'Permission denied: ' + path);
        }
        state.files.set(path, { content, modifiedAt: Date.now() });
        return ok({
          path,
          name: path.split(/[\\/]/).pop() ?? path,
          isDirectory: false,
          isSymbolicLink: false,
          size: content.length,
          modifiedAt: Date.now()
        });
      }),

      readDirectory: vi.fn(async (path: string) =>
        ok(
          (state.directories.get(path) ?? []).map((entry) => ({
            path: path + '/' + entry.name,
            name: entry.name,
            isDirectory: entry.isDirectory,
            isSymbolicLink: false,
            size: 0,
            modifiedAt: 0
          }))
        )
      ),

      stat: vi.fn(async (path: string) =>
        ok({
          path,
          name: path.split(/[\\/]/).pop() ?? path,
          isDirectory: state.directories.has(path),
          isSymbolicLink: false,
          size: state.files.get(path)?.content.length ?? 0,
          modifiedAt: 0
        })
      ),

      createFile: vi.fn(async (path: string) => {
        state.files.set(path, { content: '', modifiedAt: Date.now() });
        return ok({
          path,
          name: path.split(/[\\/]/).pop() ?? path,
          isDirectory: false,
          isSymbolicLink: false,
          size: 0,
          modifiedAt: Date.now()
        });
      }),

      createDirectory: vi.fn(async (path: string) => {
        state.directories.set(path, []);
        return ok({
          path,
          name: path.split(/[\\/]/).pop() ?? path,
          isDirectory: true,
          isSymbolicLink: false,
          size: 0,
          modifiedAt: Date.now()
        });
      }),

      rename: vi.fn(async (from: string, to: string) => {
        const file = state.files.get(from);
        if (file) {
          state.files.delete(from);
          state.files.set(to, file);
        }
        return ok({
          path: to,
          name: to.split(/[\\/]/).pop() ?? to,
          isDirectory: false,
          isSymbolicLink: false,
          size: file?.content.length ?? 0,
          modifiedAt: Date.now()
        });
      }),

      delete: vi.fn(async (path: string) => {
        state.files.delete(path);
        state.directories.delete(path);
        return ok(undefined);
      }),

      exists: vi.fn(async (path: string) => ok(state.files.has(path) || state.directories.has(path)))
    },

    workspace: {
      open: vi.fn(async (rootPath: string) =>
        ok({ rootPath, name: rootPath.split(/[\\/]/).pop() ?? rootPath })
      ),
      close: vi.fn(async () => ok({ rootPath: null, name: null })),
      onChanged: vi.fn((listener: (info: unknown) => void) =>
        subscribe(listeners.workspaceChanged, listener)
      ),
      onFileEvents: vi.fn((listener: (events: unknown) => void) => subscribe(listeners.fileEvents, listener))
    },

    search: {
      inFiles: vi.fn(async () => ok([])),
      fileNames: vi.fn(async () => ok(state.searchNames))
    },

    terminal: {
      listShells: vi.fn(async () =>
        ok([
          { id: 'pwsh', label: 'PowerShell 7', executable: 'pwsh.exe', args: [] },
          { id: 'cmd', label: 'Command Prompt', executable: 'cmd.exe', args: [] }
        ])
      ),
      create: vi.fn(async () => ok(createSession())),
      write: vi.fn((id: string, data: string) => calls.terminalWrite.push([id, data])),
      resize: vi.fn((id: string, cols: number, rows: number) => calls.terminalResize.push([id, cols, rows])),
      dispose: vi.fn((id: string) => calls.terminalDispose.push(id)),
      onData: vi.fn((listener: (event: unknown) => void) => subscribe(listeners.terminalData, listener)),
      onExit: vi.fn((listener: (event: unknown) => void) => subscribe(listeners.terminalExit, listener))
    },

    settings: {
      getAll: vi.fn(async () => ok(state.settings)),
      set: vi.fn(async (key: string, value: unknown) => {
        state.settings = { ...state.settings, [key]: value };
        return ok(state.settings);
      }),
      reset: vi.fn(async () => ok(state.settings))
    },

    shortcut: {
      getState: vi.fn(async () => ok(state.shortcut)),
      create: vi.fn(async () => {
        state.shortcut = { ...state.shortcut, exists: true };
        return ok(state.shortcut.path);
      }),
      remove: vi.fn(async () => {
        const had = state.shortcut.exists;
        state.shortcut = { ...state.shortcut, exists: false };
        return ok(had);
      })
    },

    lint: {
      run: vi.fn(async () => ok(state.lint))
    },

    extensions: {
      list: vi.fn(async () => ok(state.extensions.installed)),
      marketplace: vi.fn(async () =>
        state.extensions.catalogueError
          ? { ok: false as const, error: state.extensions.catalogueError }
          : ok(state.extensions.catalogue)
      ),
      install: vi.fn(async (entry: MarketplaceEntry) => {
        state.extensions.installed = [
          ...state.extensions.installed,
          {
            manifest: {
              id: entry.id,
              name: entry.name,
              version: entry.version,
              publisher: entry.publisher,
              description: entry.description,
              permissions: entry.permissions,
              contributes: {}
            },
            status: 'enabled' as const,
            path: '/ext/' + entry.id
          }
        ];
        return ok(undefined);
      }),
      setEnabled: vi.fn(async (id: string, enabled: boolean) => {
        state.extensions.installed = state.extensions.installed.map((entry) =>
          entry.manifest.id === id
            ? { ...entry, status: enabled ? ('enabled' as const) : ('disabled' as const) }
            : entry
        );
        return ok(undefined);
      }),
      uninstall: vi.fn(async (id: string) => {
        state.extensions.installed = state.extensions.installed.filter(
          (entry) => entry.manifest.id !== id
        );
        return ok(undefined);
      }),
      invokeCommand: vi.fn(async (extensionId: string, commandId: string) => {
        state.extensions.invoked.push({ extensionId, commandId });
        return ok(undefined);
      }),
      onChanged: vi.fn((listener: (change: unknown) => void) =>
        subscribe(listeners.extensionsChanged, listener)
      )
    },

    debug: {
      configurations: vi.fn(async () => ok(state.debug.configurations)),
      start: vi.fn(async (configuration: DebugConfiguration) => {
        state.debug.started = configuration;
        listeners.debugState.forEach((listener) =>
          listener({ status: 'running', threadId: null, configurationName: configuration.name })
        );
        return ok(undefined);
      }),
      stop: vi.fn(async () => {
        state.debug.started = null;
        listeners.debugState.forEach((listener) =>
          listener({ status: 'inactive', threadId: null, configurationName: null })
        );
        return ok(undefined);
      }),
      control: vi.fn(async (action: string) => {
        state.debug.actions.push(action);
        return ok(undefined);
      }),
      setBreakpoints: vi.fn(async (filePath: string, breakpoints: SourceBreakpoint[]) => {
        state.debug.breakpoints[filePath] = breakpoints;
        return ok(undefined);
      }),
      stackTrace: vi.fn(async () => ok(state.debug.frames)),
      scopes: vi.fn(async () => ok(state.debug.scopes)),
      variables: vi.fn(async (reference: number) => ok(state.debug.variables[reference] ?? [])),
      evaluate: vi.fn(async (expression: string) => ok('=' + expression)),
      onState: vi.fn((listener: (state: unknown) => void) => subscribe(listeners.debugState, listener)),
      onOutput: vi.fn((listener: (output: unknown) => void) => subscribe(listeners.debugOutput, listener))
    },

    git: {
      status: vi.fn(async () => ok(state.git.status)),
      branches: vi.fn(async () => ok(state.git.branches)),
      diff: vi.fn(async () => ok(state.git.diff)),
      stage: vi.fn(async (paths: string[]) => {
        state.git.status = {
          ...state.git.status,
          changes: state.git.status.changes.map((change) =>
            paths.includes(change.path) ? { ...change, staged: true } : change
          )
        };
        return ok(undefined);
      }),
      unstage: vi.fn(async (paths: string[]) => {
        state.git.status = {
          ...state.git.status,
          changes: state.git.status.changes.map((change) =>
            paths.includes(change.path) ? { ...change, staged: false } : change
          )
        };
        return ok(undefined);
      }),
      discard: vi.fn(async (paths: string[]) => {
        state.git.status = {
          ...state.git.status,
          changes: state.git.status.changes.filter((change) => !paths.includes(change.path))
        };
        return ok(undefined);
      }),
      commit: vi.fn(async (message: string) => {
        state.git.commits.push(message);
        state.git.status = {
          ...state.git.status,
          changes: state.git.status.changes.filter((change) => !change.staged)
        };
        return ok('abc1234');
      }),
      switchBranch: vi.fn(async (name: string) => {
        state.git.status = { ...state.git.status, branch: name };
        return ok(undefined);
      }),
      createBranch: vi.fn(async (name: string) => {
        state.git.branches = [...state.git.branches, name];
        state.git.status = { ...state.git.status, branch: name };
        return ok(undefined);
      })
    },

    update: {
      check: vi.fn(async () => ok({ state: 'not-available' as const })),
      onStatus: vi.fn((listener: (status: unknown) => void) => subscribe(listeners.updateStatus, listener))
    },

    menu: {
      onCommand: vi.fn((listener: (command: string) => void) => subscribe(listeners.menuCommand, listener))
    }
  };

  return bridge as unknown as CairnApi;
}

let sessionCounter = 0;

/** Builds a distinct terminal session, so tab titles get their suffixes. */
function createSession(): {
  id: string;
  pid: number;
  shellLabel: string;
  cwd: string;
  hasPty: boolean;
} {
  sessionCounter += 1;
  return {
    id: 'term-' + sessionCounter,
    pid: 1000 + sessionCounter,
    shellLabel: 'PowerShell 7',
    cwd: '/workspace',
    hasPty: true
  };
}

/** Installs the fake bridge on `window` and resets its state. */
export function installBridge(): CairnApi {
  state.files = new Map();
  state.directories = new Map();
  state.settings = {};
  state.dialogFileResult = null;
  state.dialogFolderResult = null;
  state.dialogSaveResult = null;
  state.dialogConfirmResult = true;
  state.searchNames = [];
  state.failNextRead = false;
  state.failNextWrite = false;
  state.shortcut = { exists: false, path: '/home/dev/Desktop/cairn-code.lnk', canCreate: true };
  sessionCounter = 0;

  for (const bucket of Object.values(listeners)) bucket.length = 0;
  calls.terminalWrite.length = 0;
  calls.terminalResize.length = 0;
  calls.terminalDispose.length = 0;

  const bridge = createBridge();
  (globalThis as { window?: { cairn?: CairnApi } }).window ??= {};
  (globalThis.window as unknown as { cairn: CairnApi }).cairn = bridge;
  return bridge;
}

/** Removes the bridge, so code that must tolerate its absence can be tested. */
export function removeBridge(): void {
  delete (globalThis.window as unknown as { cairn?: CairnApi }).cairn;
}
