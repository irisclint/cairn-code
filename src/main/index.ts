import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import log from 'electron-log/main';
import { APP_ID } from '@shared/constants';
import { IpcChannel } from '@shared/ipc-channels';
import { createLogger, Logger } from '@shared/logger';
import { WindowManager } from './windows';
import { buildApplicationMenu } from './menu';
import { registerIpcHandlers, disposeIpcHandlers, type IpcContext } from './ipc';
import { registerProtocolSchemes, ProtocolHandler } from './protocol';
import { FileSystemService } from './services/fs-service';
import { SearchService } from './services/search-service';
import { PtyService } from './services/pty-service';
import { SettingsStore } from './services/settings-store';
import { FileWatcherService } from './services/file-watcher';
import { UpdateService } from './updater';
import { ShortcutService } from './services/shortcut-service';

const logger = createLogger('main');

/* Custom schemes must be registered before the app is ready. */
registerProtocolSchemes();

app.setAppUserModelId(APP_ID);

/* A second instance focuses the existing window instead of starting a new app. */
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let windows: WindowManager | null = null;
let pty: PtyService | null = null;
let watcher: FileWatcherService | null = null;

async function bootstrap(): Promise<void> {
  const startedAt = Date.now();

  log.initialize();
  log.transports.file.level = 'info';
  Logger.level = app.isPackaged ? 'info' : 'debug';

  const settings = new SettingsStore();
  await settings.load();

  const appPath = app.getAppPath();
  const { preloadPath, rendererHtmlPath } = WindowManager.resolvePaths(appPath);

  windows = new WindowManager({
    // electron-vite exposes the dev server URL through this variable.
    rendererUrl: process.env.ELECTRON_RENDERER_URL,
    preloadPath: process.env.ELECTRON_RENDERER_URL ? join(appPath, 'out/preload/index.cjs') : preloadPath,
    rendererHtmlPath
  });

  const protocolHandler = new ProtocolHandler();
  protocolHandler.register();

  watcher = new FileWatcherService((events) => {
    windows?.broadcast(IpcChannel.WorkspaceFileEvent, events);
  });

  pty = new PtyService(
    (id, data) => windows?.broadcast(IpcChannel.TerminalData, { id, data }),
    (event) => windows?.broadcast(IpcChannel.TerminalExit, event)
  );

  const updater = new UpdateService((status) => {
    windows?.broadcast(IpcChannel.UpdateStatus, status);
  });

  const context: IpcContext = {
    windows,
    files: new FileSystemService(),
    search: new SearchService(),
    pty,
    settings,
    watcher,
    protocolHandler,
    updater,
    shortcuts: new ShortcutService(),
    workspace: { rootPath: null, name: null }
  };

  registerIpcHandlers(context);
  buildApplicationMenu(() => windows?.focused ?? null);

  windows.createWindow();
  logger.info(`Main process ready in ${Date.now() - startedAt} ms`);

  if (settings.get('update.checkAutomatically') && app.isPackaged) {
    // Delayed so the update check never competes with first paint.
    setTimeout(() => void updater.checkForUpdates(), 5_000);
  }
}

app.on('second-instance', () => {
  windows?.focusOrCreate();
});

app.on('window-all-closed', () => {
  // macOS keeps the application alive without windows, every other platform quits.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) windows?.createWindow();
});

app.on('before-quit', () => {
  pty?.disposeAll();
  watcher?.dispose();
  disposeIpcHandlers();
});

/* Renderer crashes must not take the whole application down silently. */
app.on('render-process-gone', (_event, _webContents, details) => {
  logger.error(`Renderer process gone: ${details.reason} (exit code ${details.exitCode})`);
});

process.on('uncaughtException', (error) => {
  logger.error(`Uncaught exception in main process: ${error.stack ?? error.message}`);
});

if (hasSingleInstanceLock) {
  void app.whenReady().then(bootstrap);
}
