import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { basename } from 'node:path';
import { IpcChannel } from '@shared/ipc-channels';
import { WorkspaceError, guarded } from '@shared/errors';
import type {
  AppInfo,
  DirectoryEntry,
  FileContent,
  FileStat,
  GitStatus,
  IpcResult,
  LintOutcome,
  SearchFileResult,
  SearchQuery,
  SettingKey,
  Settings,
  ShellDescriptor,
  ShortcutState,
  TerminalCreateOptions,
  TerminalSession,
  UpdateStatus,
  WorkspaceInfo
} from '@shared/types';
import type { WindowManager } from './windows';
import type { FileSystemService } from './services/fs-service';
import type { SearchService } from './services/search-service';
import type { PtyService } from './services/pty-service';
import type { SettingsStore } from './services/settings-store';
import type { FileWatcherService } from './services/file-watcher';
import type { ProtocolHandler } from './protocol';
import type { UpdateService } from './updater';
import type { ShortcutService } from './services/shortcut-service';
import type { LintService } from './services/lint-service';
import type { GitCliService } from './services/git-cli';
import { createLogger } from '@shared/logger';

import { isAbsolute, resolve as resolvePath, sep } from 'node:path';

const log = createLogger('ipc');

export interface IpcContext {
  windows: WindowManager;
  files: FileSystemService;
  search: SearchService;
  pty: PtyService;
  settings: SettingsStore;
  watcher: FileWatcherService;
  protocolHandler: ProtocolHandler;
  updater: UpdateService;
  shortcuts: ShortcutService;
  lint: LintService;
  git: GitCliService;
  /** Mutable workspace state owned by the main process. */
  workspace: { rootPath: string | null; name: string | null };
}

type Handler<T> = (event: Electron.IpcMainInvokeEvent, ...args: never[]) => Promise<IpcResult<T>>;

/**
 * Registers every IPC handler.
 *
 * Handlers never throw across the process boundary: `guarded` converts any
 * error into an `IpcResult` envelope that carries code, message, cause and
 * solution, so the renderer can always show an actionable message.
 */
export function registerIpcHandlers(context: IpcContext): void {
  const handle = <T>(channel: string, handler: Handler<T>): void => {
    ipcMain.handle(channel, handler as (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown);
  };

  /* ---------------------------------------------------------------------- */
  /* Window                                                                  */
  /* ---------------------------------------------------------------------- */

  ipcMain.on(IpcChannel.WindowMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });

  ipcMain.on(IpcChannel.WindowMaximizeToggle, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });

  ipcMain.on(IpcChannel.WindowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  handle<boolean>(IpcChannel.WindowIsMaximized, (event) =>
    guarded(() => BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false)
  );

  /* ---------------------------------------------------------------------- */
  /* Application                                                             */
  /* ---------------------------------------------------------------------- */

  handle<AppInfo>(IpcChannel.AppGetInfo, () =>
    guarded(() => ({
      name: app.getName(),
      version: app.getVersion(),
      electron: process.versions.electron ?? 'unknown',
      chrome: process.versions.chrome ?? 'unknown',
      node: process.versions.node,
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged
    }))
  );

  /* ---------------------------------------------------------------------- */
  /* Dialogs                                                                 */
  /* ---------------------------------------------------------------------- */

  handle<string[] | null>(IpcChannel.DialogOpenFile, async (event) =>
    guarded(async () => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = window
        ? await dialog.showOpenDialog(window, { properties: ['openFile', 'multiSelections'] })
        : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
      return result.canceled ? null : result.filePaths;
    })
  );

  handle<string | null>(IpcChannel.DialogOpenFolder, async (event) =>
    guarded(async () => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const result = window
        ? await dialog.showOpenDialog(window, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    })
  );

  handle<string | null>(IpcChannel.DialogSaveFile, async (event, ...args) =>
    guarded(async () => {
      const [defaultPath] = args as unknown as [string | undefined];
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.SaveDialogOptions = defaultPath ? { defaultPath } : {};
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      return result.canceled ? null : (result.filePath ?? null);
    })
  );

  handle<boolean>(IpcChannel.DialogConfirm, async (event, ...args) =>
    guarded(async () => {
      const [request] = args as unknown as [
        { title: string; message: string; detail?: string; confirmLabel?: string }
      ];
      const window = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.MessageBoxOptions = {
        type: 'question',
        buttons: [request.confirmLabel ?? 'Confirm', 'Cancel'],
        defaultId: 0,
        cancelId: 1,
        title: request.title,
        message: request.message,
        detail: request.detail
      };
      const result = window
        ? await dialog.showMessageBox(window, options)
        : await dialog.showMessageBox(options);
      return result.response === 0;
    })
  );

  /* ---------------------------------------------------------------------- */
  /* Filesystem                                                              */
  /* ---------------------------------------------------------------------- */

  handle<FileContent>(IpcChannel.FsReadFile, (_event, ...args) => {
    const [path] = args as unknown as [string];
    return guarded(() => context.files.readFile(path));
  });

  handle<FileStat>(IpcChannel.FsWriteFile, (_event, ...args) => {
    const [path, content] = args as unknown as [string, string];
    return guarded(() => context.files.writeFile(path, content));
  });

  handle<DirectoryEntry[]>(IpcChannel.FsReadDirectory, (_event, ...args) => {
    const [path] = args as unknown as [string];
    return guarded(() => context.files.readDirectory(path));
  });

  handle<FileStat>(IpcChannel.FsStat, (_event, ...args) => {
    const [path] = args as unknown as [string];
    return guarded(() => context.files.stat(path));
  });

  handle<FileStat>(IpcChannel.FsCreateFile, (_event, ...args) => {
    const [path] = args as unknown as [string];
    return guarded(() => context.files.createFile(path));
  });

  handle<FileStat>(IpcChannel.FsCreateDirectory, (_event, ...args) => {
    const [path] = args as unknown as [string];
    return guarded(() => context.files.createDirectory(path));
  });

  handle<FileStat>(IpcChannel.FsRename, (_event, ...args) => {
    const [from, to] = args as unknown as [string, string];
    return guarded(() => context.files.rename(from, to));
  });

  handle<void>(IpcChannel.FsDelete, (_event, ...args) => {
    const [path] = args as unknown as [string];
    return guarded(() => context.files.delete(path));
  });

  handle<boolean>(IpcChannel.FsExists, (_event, ...args) => {
    const [path] = args as unknown as [string];
    return guarded(() => context.files.exists(path));
  });

  /* ---------------------------------------------------------------------- */
  /* Workspace                                                               */
  /* ---------------------------------------------------------------------- */

  handle<WorkspaceInfo>(IpcChannel.WorkspaceOpen, (_event, ...args) => {
    const [rootPath] = args as unknown as [string];
    return guarded(async () => {
      const stats = await context.files.stat(rootPath);
      const root = stats.isDirectory ? rootPath : null;
      if (!root) {
        return { rootPath: context.workspace.rootPath, name: context.workspace.name };
      }
      context.workspace.rootPath = root;
      context.workspace.name = basename(root);
      context.protocolHandler.allowRoot(root);
      context.watcher.watch(root);
      const info: WorkspaceInfo = { rootPath: root, name: context.workspace.name };
      context.windows.broadcast(IpcChannel.WorkspaceChanged, info);
      log.info(`Workspace opened: ${root}`);
      return info;
    });
  });

  handle<WorkspaceInfo>(IpcChannel.WorkspaceClose, () =>
    guarded(() => {
      context.watcher.dispose();
      context.protocolHandler.clearWorkspaceRoots();
      context.workspace.rootPath = null;
      context.workspace.name = null;
      const info: WorkspaceInfo = { rootPath: null, name: null };
      context.windows.broadcast(IpcChannel.WorkspaceChanged, info);
      return info;
    })
  );

  /* ---------------------------------------------------------------------- */
  /* Search                                                                  */
  /* ---------------------------------------------------------------------- */

  handle<SearchFileResult[]>(IpcChannel.SearchInFiles, (_event, ...args) => {
    const [query] = args as unknown as [SearchQuery];
    return guarded(async () => {
      const root = context.workspace.rootPath;
      if (!root) return [];
      return context.search.searchInFiles(root, query);
    });
  });

  handle<string[]>(IpcChannel.SearchFileNames, (_event, ...args) => {
    const [query, limit] = args as unknown as [string, number | undefined];
    return guarded(async () => {
      const root = context.workspace.rootPath;
      if (!root) return [];
      return context.search.searchFileNames(root, query, limit);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Terminal                                                                */
  /* ---------------------------------------------------------------------- */

  handle<ShellDescriptor[]>(IpcChannel.TerminalListShells, () => guarded(() => context.pty.listShells()));

  handle<TerminalSession>(IpcChannel.TerminalCreate, (_event, ...args) => {
    const [options] = args as unknown as [TerminalCreateOptions];
    return guarded(() =>
      context.pty.create({
        ...options,
        cwd: options.cwd ?? context.workspace.rootPath ?? undefined
      })
    );
  });

  ipcMain.on(IpcChannel.TerminalWrite, (_event, id: string, data: string) => {
    try {
      context.pty.write(id, data);
    } catch (error) {
      log.warn(`Terminal write failed: ${String(error)}`);
    }
  });

  ipcMain.on(IpcChannel.TerminalResize, (_event, id: string, cols: number, rows: number) => {
    context.pty.resize(id, cols, rows);
  });

  ipcMain.on(IpcChannel.TerminalDispose, (_event, id: string) => {
    context.pty.dispose(id);
  });

  /* ---------------------------------------------------------------------- */
  /* Settings                                                                */
  /* ---------------------------------------------------------------------- */

  handle<Settings>(IpcChannel.SettingsGetAll, () => guarded(() => context.settings.getAll()));

  handle<Settings>(IpcChannel.SettingsSet, (_event, ...args) => {
    const [key, value] = args as unknown as [SettingKey, Settings[SettingKey]];
    return guarded(() => context.settings.set(key, value));
  });

  handle<Settings>(IpcChannel.SettingsReset, () => guarded(() => context.settings.reset()));

  /* ---------------------------------------------------------------------- */
  /* Desktop shortcut                                                        */
  /* ---------------------------------------------------------------------- */

  handle<ShortcutState>(IpcChannel.ShortcutGetState, () => guarded(() => context.shortcuts.getState()));

  handle<string>(IpcChannel.ShortcutCreate, () => guarded(() => context.shortcuts.create()));

  handle<boolean>(IpcChannel.ShortcutRemove, () => guarded(() => context.shortcuts.remove()));

  /* ---------------------------------------------------------------------- */
  /* Linting                                                                 */
  /* ---------------------------------------------------------------------- */

  handle<LintOutcome>(IpcChannel.LintRequest, (_event, ...args) => {
    const [filePath, text] = args as unknown as [string, string];

    return guarded(async () => {
      const root = context.workspace.rootPath;

      if (!root) {
        throw new WorkspaceError({
          code: 'LINT_NO_WORKSPACE',
          message: 'ESLint needs an open folder',
          cause:
            'ESLint resolves its configuration relative to a project root, and no folder is open, so there is nothing to resolve against.',
          solution: 'Open the folder that contains the project, then save the file again.'
        });
      }

      // The path arrives from the renderer, so it is checked before it is used
      // even though the renderer is the only caller today.
      const resolved = resolvePath(filePath);
      if (resolved !== root && !resolved.startsWith(root + sep)) {
        throw new WorkspaceError({
          code: 'LINT_OUTSIDE_WORKSPACE',
          message: 'That file is outside the open folder',
          cause: `${resolved} is not inside ${root}, and linting runs with the workspace configuration only.`,
          solution: 'Open the folder that contains the file, then try again.'
        });
      }

      return context.lint.lint(resolved, text, root);
    });
  });

  /* ---------------------------------------------------------------------- */
  /* Source control                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * Every source control call works against the folder the main process has
   * open. The renderer never supplies the repository path, so it cannot aim
   * git at somewhere else on the disk.
   */
  const repository = (): string => {
    const root = context.workspace.rootPath;
    if (root) return root;

    throw new WorkspaceError({
      code: 'GIT_NO_WORKSPACE',
      message: 'Source control needs an open folder',
      cause: 'git works inside a repository, and no folder is open for it to work in.',
      solution: 'Open the folder that contains the repository, then try again.'
    });
  };

  /** Paths arrive from the renderer, so they are checked before git sees them. */
  const relativePaths = (paths: unknown): string[] => {
    const list = Array.isArray(paths) ? paths : [];

    return list.map((entry) => {
      const value = String(entry);
      if (isAbsolute(value) || value.split(/[/\\]/).includes('..')) {
        throw new WorkspaceError({
          code: 'GIT_BAD_PATH',
          message: 'That path cannot be used here',
          cause: `Source control works with paths relative to the repository, and ${value} is absolute or walks outside it.`,
          solution: 'Use the entries in the Source Control panel, which already carry the right paths.'
        });
      }
      return value;
    });
  };

  handle<GitStatus>(IpcChannel.GitStatus, () => guarded(() => context.git.getStatus(repository())));

  handle<string | null>(IpcChannel.GitDiff, (_event, ...args) => {
    const [filePath, staged] = args as unknown as [string, boolean];
    return guarded(() => {
      const safe = relativePaths([filePath])[0] as string;
      return context.git.getDiff(repository(), safe, Boolean(staged));
    });
  });

  handle<void>(IpcChannel.GitStage, (_event, ...args) =>
    guarded(() => context.git.stage(repository(), relativePaths(args[0])))
  );

  handle<void>(IpcChannel.GitUnstage, (_event, ...args) =>
    guarded(() => context.git.unstage(repository(), relativePaths(args[0])))
  );

  handle<void>(IpcChannel.GitDiscard, (_event, ...args) =>
    guarded(() => context.git.discard(repository(), relativePaths(args[0])))
  );

  handle<string>(IpcChannel.GitCommit, (_event, ...args) => {
    const [message] = args as unknown as [string];
    return guarded(() => context.git.commit(repository(), String(message)));
  });

  handle<string[]>(IpcChannel.GitBranches, () => guarded(() => context.git.listBranches(repository())));

  handle<void>(IpcChannel.GitSwitchBranch, (_event, ...args) => {
    const [name] = args as unknown as [string];
    return guarded(() => context.git.switchBranch(repository(), String(name)));
  });

  handle<void>(IpcChannel.GitCreateBranch, (_event, ...args) => {
    const [name] = args as unknown as [string];
    return guarded(() => context.git.createBranch(repository(), String(name)));
  });

  /* ---------------------------------------------------------------------- */
  /* Updates                                                                 */
  /* ---------------------------------------------------------------------- */

  handle<UpdateStatus>(IpcChannel.UpdateCheck, () => guarded(() => context.updater.checkForUpdates()));
}

/** Removes every handler, used on shutdown and in tests. */
export function disposeIpcHandlers(): void {
  for (const channel of Object.values(IpcChannel)) {
    ipcMain.removeHandler(channel);
    ipcMain.removeAllListeners(channel);
  }
}
