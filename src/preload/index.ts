import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel } from '../shared/ipc-channels';
import type {
  AppInfo,
  DirectoryEntry,
  FileContent,
  FileEvent,
  FileStat,
  DebugConfiguration,
  DebugOutput,
  DebugScope,
  DebugSessionState,
  DebugStackFrame,
  DebugVariable,
  GitStatus,
  InstalledExtension,
  MarketplaceEntry,
  IpcResult,
  SourceBreakpoint,
  LintOutcome,
  SearchFileResult,
  SearchQuery,
  Settings,
  SettingKey,
  ShortcutState,
  ShellDescriptor,
  TerminalCreateOptions,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSession,
  UpdateStatus,
  WorkspaceInfo
} from '../shared/types';

export interface WindowState {
  isMaximized: boolean;
  isFullScreen: boolean;
  isFocused: boolean;
}

export interface ConfirmRequest {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
}

type Unsubscribe = () => void;

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const wrapped = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

/**
 * The complete bridge between the renderer and the main process.
 *
 * Nothing else is exposed: no `require`, no Node globals, no raw ipcRenderer.
 * Every method maps onto exactly one allowlisted channel from IpcChannel.
 */
const api = {
  app: {
    getInfo: (): Promise<IpcResult<AppInfo>> => ipcRenderer.invoke(IpcChannel.AppGetInfo)
  },

  window: {
    minimize: (): void => ipcRenderer.send(IpcChannel.WindowMinimize),
    toggleMaximize: (): void => ipcRenderer.send(IpcChannel.WindowMaximizeToggle),
    close: (): void => ipcRenderer.send(IpcChannel.WindowClose),
    isMaximized: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IpcChannel.WindowIsMaximized),
    onStateChanged: (listener: (state: WindowState) => void): Unsubscribe =>
      subscribe(IpcChannel.WindowStateChanged, listener)
  },

  dialog: {
    openFile: (): Promise<IpcResult<string[] | null>> => ipcRenderer.invoke(IpcChannel.DialogOpenFile),
    openFolder: (): Promise<IpcResult<string | null>> => ipcRenderer.invoke(IpcChannel.DialogOpenFolder),
    saveFile: (defaultPath?: string): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke(IpcChannel.DialogSaveFile, defaultPath),
    confirm: (request: ConfirmRequest): Promise<IpcResult<boolean>> =>
      ipcRenderer.invoke(IpcChannel.DialogConfirm, request)
  },

  fs: {
    readFile: (path: string): Promise<IpcResult<FileContent>> =>
      ipcRenderer.invoke(IpcChannel.FsReadFile, path),
    writeFile: (path: string, content: string): Promise<IpcResult<FileStat>> =>
      ipcRenderer.invoke(IpcChannel.FsWriteFile, path, content),
    readDirectory: (path: string): Promise<IpcResult<DirectoryEntry[]>> =>
      ipcRenderer.invoke(IpcChannel.FsReadDirectory, path),
    stat: (path: string): Promise<IpcResult<FileStat>> => ipcRenderer.invoke(IpcChannel.FsStat, path),
    createFile: (path: string): Promise<IpcResult<FileStat>> =>
      ipcRenderer.invoke(IpcChannel.FsCreateFile, path),
    createDirectory: (path: string): Promise<IpcResult<FileStat>> =>
      ipcRenderer.invoke(IpcChannel.FsCreateDirectory, path),
    rename: (from: string, to: string): Promise<IpcResult<FileStat>> =>
      ipcRenderer.invoke(IpcChannel.FsRename, from, to),
    delete: (path: string): Promise<IpcResult<void>> => ipcRenderer.invoke(IpcChannel.FsDelete, path),
    exists: (path: string): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IpcChannel.FsExists, path)
  },

  workspace: {
    open: (rootPath: string): Promise<IpcResult<WorkspaceInfo>> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceOpen, rootPath),
    close: (): Promise<IpcResult<WorkspaceInfo>> => ipcRenderer.invoke(IpcChannel.WorkspaceClose),
    onChanged: (listener: (info: WorkspaceInfo) => void): Unsubscribe =>
      subscribe(IpcChannel.WorkspaceChanged, listener),
    onFileEvents: (listener: (events: FileEvent[]) => void): Unsubscribe =>
      subscribe(IpcChannel.WorkspaceFileEvent, listener)
  },

  search: {
    inFiles: (query: SearchQuery): Promise<IpcResult<SearchFileResult[]>> =>
      ipcRenderer.invoke(IpcChannel.SearchInFiles, query),
    fileNames: (query: string, limit?: number): Promise<IpcResult<string[]>> =>
      ipcRenderer.invoke(IpcChannel.SearchFileNames, query, limit)
  },

  terminal: {
    listShells: (): Promise<IpcResult<ShellDescriptor[]>> =>
      ipcRenderer.invoke(IpcChannel.TerminalListShells),
    create: (options: TerminalCreateOptions): Promise<IpcResult<TerminalSession>> =>
      ipcRenderer.invoke(IpcChannel.TerminalCreate, options),
    write: (id: string, data: string): void => ipcRenderer.send(IpcChannel.TerminalWrite, id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send(IpcChannel.TerminalResize, id, cols, rows),
    dispose: (id: string): void => ipcRenderer.send(IpcChannel.TerminalDispose, id),
    onData: (listener: (event: TerminalDataEvent) => void): Unsubscribe =>
      subscribe(IpcChannel.TerminalData, listener),
    onExit: (listener: (event: TerminalExitEvent) => void): Unsubscribe =>
      subscribe(IpcChannel.TerminalExit, listener)
  },

  settings: {
    getAll: (): Promise<IpcResult<Settings>> => ipcRenderer.invoke(IpcChannel.SettingsGetAll),
    set: <K extends SettingKey>(key: K, value: Settings[K]): Promise<IpcResult<Settings>> =>
      ipcRenderer.invoke(IpcChannel.SettingsSet, key, value),
    reset: (): Promise<IpcResult<Settings>> => ipcRenderer.invoke(IpcChannel.SettingsReset)
  },

  shortcut: {
    getState: (): Promise<IpcResult<ShortcutState>> => ipcRenderer.invoke(IpcChannel.ShortcutGetState),
    create: (): Promise<IpcResult<string>> => ipcRenderer.invoke(IpcChannel.ShortcutCreate),
    remove: (): Promise<IpcResult<boolean>> => ipcRenderer.invoke(IpcChannel.ShortcutRemove)
  },

  extensions: {
    list: (): Promise<IpcResult<InstalledExtension[]>> => ipcRenderer.invoke(IpcChannel.ExtensionsList),
    setEnabled: (id: string, enabled: boolean): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.ExtensionsSetEnabled, id, enabled),
    uninstall: (id: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.ExtensionsUninstall, id),
    invokeCommand: (extensionId: string, commandId: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.ExtensionsInvokeCommand, extensionId, commandId),
    marketplace: (): Promise<IpcResult<MarketplaceEntry[]>> =>
      ipcRenderer.invoke(IpcChannel.ExtensionsMarketplace),
    install: (entry: MarketplaceEntry): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.ExtensionsInstall, entry),
    onChanged: (listener: (change: unknown) => void): Unsubscribe =>
      subscribe(IpcChannel.ExtensionsChanged, listener)
  },

  debug: {
    configurations: (): Promise<IpcResult<DebugConfiguration[]>> =>
      ipcRenderer.invoke(IpcChannel.DebugConfigurations),
    start: (configuration: DebugConfiguration): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.DebugStart, configuration),
    stop: (): Promise<IpcResult<void>> => ipcRenderer.invoke(IpcChannel.DebugStop),
    control: (action: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.DebugControl, action),
    setBreakpoints: (filePath: string, breakpoints: SourceBreakpoint[]): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.DebugSetBreakpoints, filePath, breakpoints),
    stackTrace: (): Promise<IpcResult<DebugStackFrame[]>> =>
      ipcRenderer.invoke(IpcChannel.DebugStackTrace),
    scopes: (frameId: number): Promise<IpcResult<DebugScope[]>> =>
      ipcRenderer.invoke(IpcChannel.DebugScopes, frameId),
    variables: (reference: number): Promise<IpcResult<DebugVariable[]>> =>
      ipcRenderer.invoke(IpcChannel.DebugVariables, reference),
    evaluate: (expression: string, frameId: number | null): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IpcChannel.DebugEvaluate, expression, frameId),
    onState: (listener: (state: DebugSessionState) => void): Unsubscribe =>
      subscribe(IpcChannel.DebugStateChanged, listener),
    onOutput: (listener: (output: DebugOutput) => void): Unsubscribe =>
      subscribe(IpcChannel.DebugOutput, listener)
  },

  git: {
    status: (): Promise<IpcResult<GitStatus>> => ipcRenderer.invoke(IpcChannel.GitStatus),
    diff: (filePath: string, staged: boolean): Promise<IpcResult<string | null>> =>
      ipcRenderer.invoke(IpcChannel.GitDiff, filePath, staged),
    stage: (paths: string[]): Promise<IpcResult<void>> => ipcRenderer.invoke(IpcChannel.GitStage, paths),
    unstage: (paths: string[]): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.GitUnstage, paths),
    discard: (paths: string[]): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.GitDiscard, paths),
    commit: (message: string): Promise<IpcResult<string>> =>
      ipcRenderer.invoke(IpcChannel.GitCommit, message),
    branches: (): Promise<IpcResult<string[]>> => ipcRenderer.invoke(IpcChannel.GitBranches),
    switchBranch: (name: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.GitSwitchBranch, name),
    createBranch: (name: string): Promise<IpcResult<void>> =>
      ipcRenderer.invoke(IpcChannel.GitCreateBranch, name)
  },

  lint: {
    run: (filePath: string, text: string): Promise<IpcResult<LintOutcome>> =>
      ipcRenderer.invoke(IpcChannel.LintRequest, filePath, text)
  },

  update: {
    check: (): Promise<IpcResult<UpdateStatus>> => ipcRenderer.invoke(IpcChannel.UpdateCheck),
    onStatus: (listener: (status: UpdateStatus) => void): Unsubscribe =>
      subscribe(IpcChannel.UpdateStatus, listener)
  },

  menu: {
    onCommand: (listener: (command: string) => void): Unsubscribe =>
      subscribe(IpcChannel.MenuCommand, listener)
  }
} as const;

export type CausewayApi = typeof api;

contextBridge.exposeInMainWorld('causeway', api);
