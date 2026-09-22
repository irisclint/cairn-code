/**
 * Every IPC channel used between the renderer and the main process.
 *
 * Channels are declared in one place so that the preload allowlist, the main
 * process handlers and the renderer client can never drift apart.
 */
export const IpcChannel = {
  // Window
  WindowMinimize: 'window:minimize',
  WindowMaximizeToggle: 'window:maximize-toggle',
  WindowClose: 'window:close',
  WindowIsMaximized: 'window:is-maximized',
  WindowStateChanged: 'window:state-changed',

  // Application
  AppGetInfo: 'app:get-info',
  AppGetPlatform: 'app:get-platform',

  // Dialogs
  DialogOpenFile: 'dialog:open-file',
  DialogOpenFolder: 'dialog:open-folder',
  DialogSaveFile: 'dialog:save-file',
  DialogConfirm: 'dialog:confirm',

  // Filesystem
  FsReadFile: 'fs:read-file',
  FsWriteFile: 'fs:write-file',
  FsReadDirectory: 'fs:read-directory',
  FsStat: 'fs:stat',
  FsCreateFile: 'fs:create-file',
  FsCreateDirectory: 'fs:create-directory',
  FsRename: 'fs:rename',
  FsDelete: 'fs:delete',
  FsExists: 'fs:exists',

  // Workspace
  WorkspaceOpen: 'workspace:open',
  WorkspaceClose: 'workspace:close',
  WorkspaceChanged: 'workspace:changed',
  WorkspaceFileEvent: 'workspace:file-event',

  // Search
  SearchInFiles: 'search:in-files',
  SearchFileNames: 'search:file-names',

  // Terminal
  TerminalCreate: 'terminal:create',
  TerminalWrite: 'terminal:write',
  TerminalResize: 'terminal:resize',
  TerminalDispose: 'terminal:dispose',
  TerminalData: 'terminal:data',
  TerminalExit: 'terminal:exit',
  TerminalListShells: 'terminal:list-shells',

  // Settings
  SettingsGetAll: 'settings:get-all',
  SettingsSet: 'settings:set',
  SettingsReset: 'settings:reset',

  // Linting
  LintRequest: 'lint:request',

  // Source control
  GitStatus: 'git:status',
  GitDiff: 'git:diff',
  GitStage: 'git:stage',
  GitUnstage: 'git:unstage',
  GitDiscard: 'git:discard',
  GitCommit: 'git:commit',
  GitBranches: 'git:branches',
  GitSwitchBranch: 'git:switch-branch',
  GitCreateBranch: 'git:create-branch',

  // Menu and commands coming from the native menu bar
  MenuCommand: 'menu:command',

  // Desktop shortcut
  ShortcutGetState: 'shortcut:get-state',
  ShortcutCreate: 'shortcut:create',
  ShortcutRemove: 'shortcut:remove',

  // Updates
  UpdateCheck: 'update:check',
  UpdateStatus: 'update:status'
} as const;

export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel];
