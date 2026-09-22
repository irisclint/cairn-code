import { BrowserWindow, shell, nativeTheme } from 'electron';
import { join } from 'node:path';
import { IpcChannel } from '@shared/ipc-channels';
import {
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  MIN_WINDOW_WIDTH,
  APP_NAME
} from '@shared/constants';
import { createLogger } from '@shared/logger';

const log = createLogger('windows');

/** Background painted before the renderer draws, avoids a white flash. */
const STARTUP_BACKGROUND = '#1e1e1e';

export interface WindowManagerOptions {
  /** Dev server URL injected by electron-vite, absent in packaged builds. */
  rendererUrl: string | undefined;
  preloadPath: string;
  rendererHtmlPath: string;
}

/**
 * Creates and tracks application windows.
 *
 * Windows are created hidden and only shown on `ready-to-show`, which is what
 * keeps perceived startup below the two second budget: the user never sees an
 * unpainted frame.
 */
export class WindowManager {
  #windows = new Set<BrowserWindow>();

  constructor(private readonly options: WindowManagerOptions) {}

  get all(): BrowserWindow[] {
    return [...this.#windows];
  }

  get focused(): BrowserWindow | null {
    return BrowserWindow.getFocusedWindow() ?? this.all[0] ?? null;
  }

  createWindow(): BrowserWindow {
    const window = new BrowserWindow({
      width: DEFAULT_WINDOW_WIDTH,
      height: DEFAULT_WINDOW_HEIGHT,
      minWidth: MIN_WINDOW_WIDTH,
      minHeight: MIN_WINDOW_HEIGHT,
      show: false,
      backgroundColor: STARTUP_BACKGROUND,
      title: APP_NAME,
      autoHideMenuBar: true,
      // cairn-code draws its own title bar so the tab strip and window controls can
      // share one row, as specified in the layout design.
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
      titleBarOverlay:
        process.platform === 'win32'
          ? { color: STARTUP_BACKGROUND, symbolColor: '#cccccc', height: 35 }
          : false,
      trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 11 } : undefined,
      webPreferences: {
        preload: this.options.preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
        spellcheck: false
      }
    });

    window.once('ready-to-show', () => {
      window.show();
      log.info('Window shown');
    });

    // External links open in the user's browser, never inside the app shell.
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://') || url.startsWith('http://')) {
        void shell.openExternal(url);
      }
      return { action: 'deny' };
    });

    // Block in-place navigation; the renderer is a single page application.
    window.webContents.on('will-navigate', (event, url) => {
      const isDevServer = this.options.rendererUrl && url.startsWith(this.options.rendererUrl);
      if (!isDevServer) event.preventDefault();
    });

    const notifyState = (): void => {
      if (window.isDestroyed()) return;
      window.webContents.send(IpcChannel.WindowStateChanged, {
        isMaximized: window.isMaximized(),
        isFullScreen: window.isFullScreen(),
        isFocused: window.isFocused()
      });
    };
    window.on('maximize', notifyState);
    window.on('unmaximize', notifyState);
    window.on('enter-full-screen', notifyState);
    window.on('leave-full-screen', notifyState);
    window.on('focus', notifyState);
    window.on('blur', notifyState);

    window.on('closed', () => {
      this.#windows.delete(window);
    });

    if (this.options.rendererUrl) {
      void window.loadURL(this.options.rendererUrl);
    } else {
      void window.loadFile(this.options.rendererHtmlPath);
    }

    this.#windows.add(window);
    return window;
  }

  /** Focuses an existing window or creates the first one. */
  focusOrCreate(): BrowserWindow {
    const existing = this.focused;
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return existing;
    }
    return this.createWindow();
  }

  /** Sends an IPC message to every open window. */
  broadcast(channel: string, payload: unknown): void {
    for (const window of this.#windows) {
      if (!window.isDestroyed()) window.webContents.send(channel, payload);
    }
  }

  /** Keeps the native title bar overlay in sync with the active theme. */
  applyTitleBarColors(background: string, symbol: string): void {
    if (process.platform !== 'win32') return;
    for (const window of this.#windows) {
      if (window.isDestroyed()) continue;
      try {
        window.setTitleBarOverlay({ color: background, symbolColor: symbol, height: 35 });
        window.setBackgroundColor(background);
      } catch (error) {
        log.warn(`Could not update title bar overlay: ${String(error)}`);
      }
    }
    nativeTheme.themeSource = 'dark';
  }

  static resolvePaths(appPath: string): { preloadPath: string; rendererHtmlPath: string } {
    return {
      preloadPath: join(appPath, 'out/preload/index.cjs'),
      rendererHtmlPath: join(appPath, 'out/renderer/index.html')
    };
  }
}
