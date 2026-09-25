import { app, BrowserWindow, clipboard } from 'electron';
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
import { LintService } from './services/lint-service';
import { GitCliService } from './services/git-cli';
import { ExtensionRegistry } from './services/extension-registry';
import { ExtensionHost } from './services/extension-host';
import { MarketplaceClient } from './services/marketplace';
import { DebugService } from './services/debug-service';

/**
 * The namespaces the editor's own commands live in.
 *
 * An extension may not register an id under any of them, so a familiar
 * shortcut can never be taken over. The list is here rather than imported
 * because the command registry lives in the renderer, and the main process
 * has to be able to answer without asking it.
 */
const BUILT_IN_COMMAND_PREFIXES: string[] = [
  'file',
  'edit',
  'selection',
  'view',
  'navigate',
  'terminal',
  'debug',
  'workbench',
  'app',
  'theme',
  'preferences',
  'help'
];

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

  // The debug session pushes rather than being polled: a stop can happen at
  // any moment, and the renderer has to react to it rather than discover it.
  const debugService = new DebugService();
  debugService.on('state', (state) => windows?.broadcast(IpcChannel.DebugStateChanged, state));
  debugService.on('output', (output) => windows?.broadcast(IpcChannel.DebugOutput, output));

  /*
   * Extensions.
   *
   * The registry owns a folder under the user's data directory. The host owns
   * a hidden sandboxed window that extension code runs inside, and the
   * capabilities below are the only things it can reach, each one only after
   * the permission gate has allowed it.
   *
   * Both are built before the context so that the host can close over the
   * filesystem service and the workspace rather than reaching back through it.
   */
  const files = new FileSystemService();
  const workspace = { rootPath: null as string | null, name: null as string | null };
  const extensions = new ExtensionRegistry(join(app.getPath('userData'), 'extensions'));

  const extensionHost = new ExtensionHost({
    registry: extensions,
    preloadPath: join(appPath, 'out/preload/extension-host.cjs'),
    pagePath: join(appPath, 'out/renderer/extension-host.html'),
    capabilities: {
      workspaceRoot: () => workspace.rootPath,
      readFile: async (path) => (await files.readFile(path)).content,
      writeFile: async (path, text) => {
        await files.writeFile(path, text);
      },
      listFiles: async (path) => (await files.readDirectory(path)).map((entry) => entry.name),
      notify: (notification) => windows?.broadcast(IpcChannel.ExtensionsChanged, { kind: 'notify', notification }),
      registerCommand: (extensionId, commandId, title) => {
        extensionHost.noteCommand(extensionId, commandId);
        windows?.broadcast(IpcChannel.ExtensionsChanged, { kind: 'command', extensionId, commandId, title });
      },
      addExplanation: (explanation) =>
        windows?.broadcast(IpcChannel.ExtensionsChanged, { kind: 'explanation', explanation }),
      readClipboard: () => clipboard.readText(),
      writeClipboard: (text) => clipboard.writeText(text),
      // The renderer owns the command registry, so the main process answers
      // this from the prefixes the built-in commands use.
      isBuiltInCommand: (commandId) =>
        BUILT_IN_COMMAND_PREFIXES.some((prefix) => commandId.startsWith(prefix + '.'))
    }
  });

  extensionHost.on('failed', (failure: { id: string; message: string }) => {
    windows?.broadcast(IpcChannel.ExtensionsChanged, { kind: 'failed', ...failure });
  });

  const context: IpcContext = {
    windows,
    files,
    search: new SearchService(),
    pty,
    settings,
    watcher,
    protocolHandler,
    updater,
    shortcuts: new ShortcutService(),
    lint: new LintService(),
    git: new GitCliService(),
    debug: debugService,
    extensions,
    extensionHost,
    marketplace: new MarketplaceClient(extensions),
    workspace
  };

  registerIpcHandlers(context);
  buildApplicationMenu(() => windows?.focused ?? null);

  windows.createWindow();

  // Started after the window, so an extension can never delay first paint.
  void extensionHost.startAll().catch((error: unknown) => {
    logger.warn(`Extensions did not all start: ${String(error)}`);
  });
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
