import { contextBridge, ipcRenderer } from 'electron';
import { IpcChannel } from '../shared/ipc-channels';
import type {
  AppInfo,
  DirectoryEntry,
  FileContent,
  FileEvent,
  FileStat,
  IpcResult,
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

export type CairnApi = typeof api;

contextBridge.exposeInMainWorld('cairn', api);
