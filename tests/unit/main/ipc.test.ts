import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => import('./electron-mock'));

const {
  ipcMain,
  BrowserWindow,
  dialogResponses,
  resetElectronMock,
  app: fakeApp
} = await import('./electron-mock');

const { registerIpcHandlers, disposeIpcHandlers } = await import('@main/ipc');
const { IpcChannel } = await import('@shared/ipc-channels');
const { FileSystemService } = await import('@main/services/fs-service');
const { SearchService } = await import('@main/services/search-service');
const { SettingsStore } = await import('@main/services/settings-store');
const { WindowManager } = await import('@main/windows');
const { ProtocolHandler } = await import('@main/protocol');
const { UpdateService } = await import('@main/updater');
const { ShortcutService } = await import('@main/services/shortcut-service');
const { GitCliService } = await import('@main/services/git-cli');
const { DebugService } = await import('@main/services/debug-service');

import type { IpcResult, LintOutcome } from '@shared/types';
import type { IpcContext } from '@main/ipc';

const lintSpy = vi.fn(
  async (): Promise<LintOutcome> => ({ findings: [], ignored: false })
);

/** Fails the test if the envelope reports an error, otherwise unwraps it. */
function expectOk<T>(result: unknown): T {
  const envelope = result as IpcResult<T>;
  if (!envelope.ok) {
    throw new Error(`Expected success but got ${envelope.error.code}: ${envelope.error.message}`);
  }
  return envelope.value;
}

/** Returns the error of a failed envelope, failing the test if it succeeded. */
function expectError(result: unknown): { code: string; message: string; cause?: string; solution?: string } {
  const envelope = result as IpcResult<unknown>;
  if (envelope.ok) throw new Error('Expected a failure but the call succeeded');
  return envelope.error;
}

let root: string;
let context: Parameters<typeof registerIpcHandlers>[0];
let broadcasts: Array<{ channel: string; payload: unknown }>;
let watched: string[];

beforeEach(async () => {
  resetElectronMock();
  root = await mkdtemp(join(tmpdir(), 'cairn-ipc-'));
  broadcasts = [];
  watched = [];

  const windows = new WindowManager({
    rendererUrl: undefined,
    preloadPath: '/tmp/preload.cjs',
    rendererHtmlPath: '/tmp/index.html'
  });
  windows.broadcast = (channel: string, payload: unknown): void => {
    broadcasts.push({ channel, payload });
  };

  context = {
    windows,
    files: new FileSystemService(),
    search: new SearchService(),
    pty: {
      listShells: () => [{ id: 'sh', label: 'sh', executable: '/bin/sh', args: [] }],
      create: vi.fn(async () => ({
        id: 'term-1',
        pid: 42,
        shellLabel: 'sh',
        cwd: root,
        hasPty: true
      })),
      write: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      disposeAll: vi.fn(),
      count: 0
    } as unknown as Parameters<typeof registerIpcHandlers>[0]['pty'],
    settings: new SettingsStore(join(root, 'settings.json')),
    watcher: {
      watch: (path: string) => watched.push(path),
      dispose: vi.fn()
    } as unknown as Parameters<typeof registerIpcHandlers>[0]['watcher'],
    protocolHandler: new ProtocolHandler(),
    updater: new UpdateService(() => {}),
    shortcuts: new ShortcutService(),
    // A stub rather than the real service: spawning a worker thread per test
    // would be slow, and what is under test here is the handler's guards.
    lint: { lint: lintSpy, dispose: vi.fn(async () => undefined) } as unknown as IpcContext['lint'],
    git: new GitCliService(),
    debug: new DebugService(),
    workspace: { rootPath: null, name: null }
  };

  await context.settings.load();
  registerIpcHandlers(context);
});

afterEach(async () => {
  disposeIpcHandlers();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('handler registration', () => {
  it('should register a handler for every invoke channel the bridge uses', () => {
    const expected = [
      IpcChannel.AppGetInfo,
      IpcChannel.WindowIsMaximized,
      IpcChannel.DialogOpenFile,
      IpcChannel.DialogOpenFolder,
      IpcChannel.DialogSaveFile,
      IpcChannel.DialogConfirm,
      IpcChannel.FsReadFile,
      IpcChannel.FsWriteFile,
      IpcChannel.FsReadDirectory,
      IpcChannel.FsStat,
      IpcChannel.FsCreateFile,
      IpcChannel.FsCreateDirectory,
      IpcChannel.FsRename,
      IpcChannel.FsDelete,
      IpcChannel.FsExists,
      IpcChannel.WorkspaceOpen,
      IpcChannel.WorkspaceClose,
      IpcChannel.SearchInFiles,
      IpcChannel.SearchFileNames,
      IpcChannel.TerminalListShells,
      IpcChannel.TerminalCreate,
      IpcChannel.SettingsGetAll,
      IpcChannel.SettingsSet,
      IpcChannel.SettingsReset,
      IpcChannel.UpdateCheck
    ];

    for (const channel of expected) {
      expect(ipcMain.handlers.has(channel), channel).toBe(true);
    }
  });

  it('should remove every handler on dispose', () => {
    disposeIpcHandlers();
    expect(ipcMain.handlers.size).toBe(0);
    expect(ipcMain.listeners.size).toBe(0);
  });
});

describe('application info', () => {
  it('should report the versions the About dialog shows', async () => {
    const info = expectOk<{ name: string; version: string; node: string }>(
      await ipcMain.invoke(IpcChannel.AppGetInfo)
    );

    expect(info.name).toBe('cairn-code');
    expect(info.version).toBe('1.0.0-alpha.1');
    expect(info.node).toBe(process.versions.node);
  });
});

describe('window control', () => {
  it('should minimize, maximize and close the sending window', () => {
    const window = new BrowserWindow();

    ipcMain.emit(IpcChannel.WindowMinimize, window.webContents);
    expect(window.isMinimized()).toBe(true);

    ipcMain.emit(IpcChannel.WindowMaximizeToggle, window.webContents);
    expect(window.isMaximized()).toBe(true);

    ipcMain.emit(IpcChannel.WindowMaximizeToggle, window.webContents);
    expect(window.isMaximized()).toBe(false);

    ipcMain.emit(IpcChannel.WindowClose, window.webContents);
    expect(window.isDestroyed()).toBe(true);
  });

  it('should report the maximised state', async () => {
    const window = new BrowserWindow();
    window.maximize();

    const result = await ipcMain.invokeFrom(window.webContents, IpcChannel.WindowIsMaximized);
    expect(expectOk<boolean>(result)).toBe(true);
  });

  it('should ignore a window control message from an unknown sender', () => {
    expect(() => ipcMain.emit(IpcChannel.WindowMinimize, { id: 999 })).not.toThrow();
  });
});

describe('dialogs', () => {
  it('should return the selected files', async () => {
    const paths = expectOk<string[] | null>(await ipcMain.invoke(IpcChannel.DialogOpenFile));
    expect(paths).toEqual(['/tmp/chosen.ts']);
  });

  it('should return null when the file dialog is cancelled', async () => {
    dialogResponses.openFile = { canceled: true, filePaths: [] };
    expect(expectOk(await ipcMain.invoke(IpcChannel.DialogOpenFile))).toBeNull();
  });

  it('should return the selected folder', async () => {
    expect(expectOk(await ipcMain.invoke(IpcChannel.DialogOpenFolder))).toBe('/tmp/workspace');
  });

  it('should return null when the folder dialog is cancelled', async () => {
    dialogResponses.openFolder = { canceled: true, filePaths: [] };
    expect(expectOk(await ipcMain.invoke(IpcChannel.DialogOpenFolder))).toBeNull();
  });

  it('should return the save path', async () => {
    expect(expectOk(await ipcMain.invoke(IpcChannel.DialogSaveFile, '/tmp/a.ts'))).toBe('/tmp/saved.ts');
  });

  it('should report a confirmation as true only for the first button', async () => {
    dialogResponses.message = { response: 0 };
    expect(expectOk(await ipcMain.invoke(IpcChannel.DialogConfirm, { title: 'T', message: 'M' }))).toBe(true);

    dialogResponses.message = { response: 1 };
    expect(expectOk(await ipcMain.invoke(IpcChannel.DialogConfirm, { title: 'T', message: 'M' }))).toBe(
      false
    );
  });
});

describe('filesystem handlers', () => {
  it('should read a file through the envelope', async () => {
    const path = join(root, 'a.txt');
    await writeFile(path, 'content', 'utf8');

    const file = expectOk<{ content: string }>(await ipcMain.invoke(IpcChannel.FsReadFile, path));
    expect(file.content).toBe('content');
  });

  it('should report a missing file with a cause and a solution instead of throwing', async () => {
    const error = expectError(await ipcMain.invoke(IpcChannel.FsReadFile, join(root, 'missing.txt')));

    expect(error.code).toBe('FS_ENOENT');
    expect(error.cause?.length).toBeGreaterThan(0);
    expect(error.solution?.length).toBeGreaterThan(0);
  });

  it('should write, stat and delete a file', async () => {
    const path = join(root, 'written.txt');

    expect(expectOk<{ size: number }>(await ipcMain.invoke(IpcChannel.FsWriteFile, path, 'hello')).size).toBe(
      5
    );
    expect(expectOk<{ name: string }>(await ipcMain.invoke(IpcChannel.FsStat, path)).name).toBe(
      'written.txt'
    );
    expect(expectOk<boolean>(await ipcMain.invoke(IpcChannel.FsExists, path))).toBe(true);

    expectOk(await ipcMain.invoke(IpcChannel.FsDelete, path));
    expect(expectOk<boolean>(await ipcMain.invoke(IpcChannel.FsExists, path))).toBe(false);
  });

  it('should list a directory', async () => {
    await mkdir(join(root, 'sub'));
    await writeFile(join(root, 'file.txt'), '');

    const entries = expectOk<Array<{ name: string }>>(await ipcMain.invoke(IpcChannel.FsReadDirectory, root));
    expect(entries.map((entry) => entry.name)).toEqual(['sub', 'file.txt']);
  });

  it('should create a file and a directory', async () => {
    expectOk(await ipcMain.invoke(IpcChannel.FsCreateFile, join(root, 'new.txt')));
    expectOk(await ipcMain.invoke(IpcChannel.FsCreateDirectory, join(root, 'newdir')));

    expect(expectOk<boolean>(await ipcMain.invoke(IpcChannel.FsExists, join(root, 'new.txt')))).toBe(true);
    expect(expectOk<boolean>(await ipcMain.invoke(IpcChannel.FsExists, join(root, 'newdir')))).toBe(true);
  });

  it('should rename a file', async () => {
    await writeFile(join(root, 'old.txt'), '');
    const stat = expectOk<{ path: string }>(
      await ipcMain.invoke(IpcChannel.FsRename, join(root, 'old.txt'), join(root, 'new.txt'))
    );
    expect(stat.path).toBe(join(root, 'new.txt'));
  });
});

describe('workspace handlers', () => {
  it('should open a folder, start watching it and broadcast the change', async () => {
    const info = expectOk<{ rootPath: string; name: string }>(
      await ipcMain.invoke(IpcChannel.WorkspaceOpen, root)
    );

    expect(info.rootPath).toBe(root);
    expect(context.workspace.rootPath).toBe(root);
    expect(watched).toEqual([root]);
    expect(broadcasts.some((entry) => entry.channel === IpcChannel.WorkspaceChanged)).toBe(true);
  });

  it('should close the folder and broadcast an empty workspace', async () => {
    await ipcMain.invoke(IpcChannel.WorkspaceOpen, root);
    broadcasts.length = 0;

    const info = expectOk<{ rootPath: null }>(await ipcMain.invoke(IpcChannel.WorkspaceClose));

    expect(info.rootPath).toBeNull();
    expect(context.workspace.rootPath).toBeNull();
    expect(broadcasts[0]?.channel).toBe(IpcChannel.WorkspaceChanged);
  });

  it('should report a missing folder rather than opening it', async () => {
    const error = expectError(await ipcMain.invoke(IpcChannel.WorkspaceOpen, join(root, 'nope')));
    expect(error.code).toBe('FS_ENOENT');
    expect(context.workspace.rootPath).toBeNull();
  });
});

describe('search handlers', () => {
  beforeEach(async () => {
    await writeFile(join(root, 'a.ts'), 'const needle = 1;\n');
    await ipcMain.invoke(IpcChannel.WorkspaceOpen, root);
  });

  it('should search file contents inside the workspace', async () => {
    const results = expectOk<Array<{ path: string }>>(
      await ipcMain.invoke(IpcChannel.SearchInFiles, {
        query: 'needle',
        isRegex: false,
        matchCase: false,
        wholeWord: false
      })
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.path.endsWith('a.ts')).toBe(true);
  });

  it('should search file names inside the workspace', async () => {
    const names = expectOk<string[]>(await ipcMain.invoke(IpcChannel.SearchFileNames, 'a'));
    expect(names.some((name) => name.endsWith('a.ts'))).toBe(true);
  });

  it('should return nothing when no folder is open', async () => {
    await ipcMain.invoke(IpcChannel.WorkspaceClose);

    expect(
      expectOk(
        await ipcMain.invoke(IpcChannel.SearchInFiles, {
          query: 'needle',
          isRegex: false,
          matchCase: false,
          wholeWord: false
        })
      )
    ).toEqual([]);
    expect(expectOk(await ipcMain.invoke(IpcChannel.SearchFileNames, 'a'))).toEqual([]);
  });
});

describe('terminal handlers', () => {
  it('should list the available shells', async () => {
    const shells = expectOk<Array<{ id: string }>>(await ipcMain.invoke(IpcChannel.TerminalListShells));
    expect(shells[0]?.id).toBe('sh');
  });

  it('should create a terminal in the workspace folder', async () => {
    await ipcMain.invoke(IpcChannel.WorkspaceOpen, root);
    const session = expectOk<{ id: string }>(
      await ipcMain.invoke(IpcChannel.TerminalCreate, { cols: 80, rows: 24 })
    );

    expect(session.id).toBe('term-1');
    expect(context.pty.create).toHaveBeenCalledWith(expect.objectContaining({ cwd: root }));
  });

  it('should forward write, resize and dispose', () => {
    ipcMain.emit(IpcChannel.TerminalWrite, null, 'term-1', 'ls\n');
    ipcMain.emit(IpcChannel.TerminalResize, null, 'term-1', 120, 40);
    ipcMain.emit(IpcChannel.TerminalDispose, null, 'term-1');

    expect(context.pty.write).toHaveBeenCalledWith('term-1', 'ls\n');
    expect(context.pty.resize).toHaveBeenCalledWith('term-1', 120, 40);
    expect(context.pty.dispose).toHaveBeenCalledWith('term-1');
  });

  it('should not let a failed write crash the main process', () => {
    vi.mocked(context.pty.write).mockImplementation(() => {
      throw new Error('terminal is gone');
    });
    expect(() => ipcMain.emit(IpcChannel.TerminalWrite, null, 'term-1', 'x')).not.toThrow();
  });
});

describe('settings handlers', () => {
  it('should return every setting', async () => {
    const settings = expectOk<Record<string, unknown>>(await ipcMain.invoke(IpcChannel.SettingsGetAll));
    expect(settings['telemetry.enabled']).toBe(false);
  });

  it('should set a value and return the updated object', async () => {
    const settings = expectOk<Record<string, unknown>>(
      await ipcMain.invoke(IpcChannel.SettingsSet, 'editor.fontSize', 20)
    );
    expect(settings['editor.fontSize']).toBe(20);
  });

  it('should reset to the defaults', async () => {
    await ipcMain.invoke(IpcChannel.SettingsSet, 'editor.fontSize', 30);
    const settings = expectOk<Record<string, unknown>>(await ipcMain.invoke(IpcChannel.SettingsReset));
    expect(settings['editor.fontSize']).toBe(14);
  });
});

describe('update handler', () => {
  it('should explain that update checks need a packaged build', async () => {
    fakeApp.isPackaged = false;
    const status = expectOk<{ state: string; message?: string }>(
      await ipcMain.invoke(IpcChannel.UpdateCheck)
    );

    expect(status.state).toBe('error');
    expect(status.message).toContain('packaged build');
  });
});

describe('the lint handler', () => {
  beforeEach(() => {
    lintSpy.mockClear();
  });

  it('should explain that linting needs an open folder', async () => {
    context.workspace.rootPath = null;
    const envelope = (await ipcMain.invoke(
      IpcChannel.LintRequest,
      join(root, 'a.ts'),
      'const a = 1;'
    )) as IpcResult<LintOutcome>;

    expect(envelope.ok).toBe(false);
    if (!envelope.ok) {
      expect(envelope.error.code).toBe('LINT_NO_WORKSPACE');
      expect(envelope.error.solution).toContain('Open the folder');
    }
  });

  it('should refuse a file outside the open folder', async () => {
    context.workspace.rootPath = root;
    const outside = join(tmpdir(), 'somewhere-else', 'evil.ts');

    const envelope = (await ipcMain.invoke(
      IpcChannel.LintRequest,
      outside,
      'const a = 1;'
    )) as IpcResult<LintOutcome>;

    expect(envelope.ok).toBe(false);
    if (!envelope.ok) expect(envelope.error.code).toBe('LINT_OUTSIDE_WORKSPACE');
    expect(lintSpy).not.toHaveBeenCalled();
  });

  it('should lint a file inside the folder with the workspace as the root', async () => {
    context.workspace.rootPath = root;
    const file = join(root, 'src', 'a.ts');

    const outcome = expectOk<LintOutcome>(
      await ipcMain.invoke(IpcChannel.LintRequest, file, 'const a = 1;')
    );

    expect(outcome.findings).toEqual([]);
    expect(lintSpy).toHaveBeenCalledWith(file, 'const a = 1;', root);
  });

  it('should not be fooled by a path that walks out of the folder', async () => {
    context.workspace.rootPath = root;
    const escaping = join(root, '..', 'outside.ts');

    const envelope = (await ipcMain.invoke(
      IpcChannel.LintRequest,
      escaping,
      'const a = 1;'
    )) as IpcResult<LintOutcome>;

    expect(envelope.ok).toBe(false);
    if (!envelope.ok) expect(envelope.error.code).toBe('LINT_OUTSIDE_WORKSPACE');
  });
});
