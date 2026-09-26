import { vi } from 'vitest';

/**
 * A working fake of the slice of Electron the main process uses.
 *
 * The real module cannot be imported outside an Electron process, so the tests
 * substitute this. It is a behaving fake rather than a bag of `vi.fn()`:
 * `ipcMain.handle` really stores handlers so a test can invoke them, and
 * `BrowserWindow` really tracks its own maximised state. That lets the tests
 * assert on what the code does instead of on which mock was called.
 */

export interface FakeWebContents {
  send: ReturnType<typeof vi.fn>;
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
  /** Spies that also record the listener, so a test can fire the event. */
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  /** Fires every listener registered for an event, as Electron would. */
  emit: (event: string, ...args: unknown[]) => void;
  id: number;
}

export class FakeBrowserWindow {
  static instances: FakeBrowserWindow[] = [];
  static focused: FakeBrowserWindow | null = null;

  webContents: FakeWebContents;
  destroyed = false;
  maximized = false;
  minimized = false;
  visible = false;
  fullScreen = false;
  focused = false;
  loadedUrl: string | null = null;
  loadedFile: string | null = null;
  titleBarOverlay: unknown = null;
  backgroundColor: string | null = null;

  readonly options: Record<string, unknown>;
  readonly listeners = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(options: Record<string, unknown> = {}) {
    this.options = options;
    /*
     * webContents is an emitter here rather than a bag of spies.
     *
     * The window only becomes visible in response to one of its events, so a
     * test that cannot fire them cannot cover the thing most worth covering.
     * The listeners are still recorded on the spies, which the navigation
     * tests read.
     */
    const contentsListeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const record = (event: string, listener: (...args: unknown[]) => void): void => {
      const list = contentsListeners.get(event) ?? [];
      list.push(listener);
      contentsListeners.set(event, list);
    };

    this.webContents = {
      send: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      on: vi.fn(record),
      once: vi.fn(record),
      emit: (event, ...args) => {
        for (const listener of contentsListeners.get(event) ?? []) listener(...args);
      },
      id: FakeBrowserWindow.instances.length + 1
    };
    FakeBrowserWindow.instances.push(this);
  }

  static getAllWindows(): FakeBrowserWindow[] {
    return FakeBrowserWindow.instances.filter((window) => !window.destroyed);
  }

  static getFocusedWindow(): FakeBrowserWindow | null {
    return FakeBrowserWindow.focused;
  }

  static fromWebContents(contents: FakeWebContents): FakeBrowserWindow | null {
    return FakeBrowserWindow.instances.find((window) => window.webContents === contents) ?? null;
  }

  static reset(): void {
    FakeBrowserWindow.instances = [];
    FakeBrowserWindow.focused = null;
  }

  on(event: string, listener: (...args: unknown[]) => void): this {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
    return this;
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }

  /** Fires every listener registered for an event. */
  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  show(): void {
    this.visible = true;
  }
  focus(): void {
    this.focused = true;
    FakeBrowserWindow.focused = this;
  }
  minimize(): void {
    this.minimized = true;
  }
  restore(): void {
    this.minimized = false;
  }
  maximize(): void {
    this.maximized = true;
    this.emit('maximize');
  }
  unmaximize(): void {
    this.maximized = false;
    this.emit('unmaximize');
  }
  close(): void {
    this.destroyed = true;
    this.emit('closed');
  }
  isMaximized(): boolean {
    return this.maximized;
  }
  isVisible(): boolean {
    return this.visible;
  }

  isMinimized(): boolean {
    return this.minimized;
  }
  isFullScreen(): boolean {
    return this.fullScreen;
  }
  isFocused(): boolean {
    return this.focused;
  }
  isDestroyed(): boolean {
    return this.destroyed;
  }
  loadURL(url: string): Promise<void> {
    this.loadedUrl = url;
    return Promise.resolve();
  }
  loadFile(file: string): Promise<void> {
    this.loadedFile = file;
    return Promise.resolve();
  }
  setTitleBarOverlay(overlay: unknown): void {
    this.titleBarOverlay = overlay;
  }
  setBackgroundColor(color: string): void {
    this.backgroundColor = color;
  }
}

type InvokeHandler = (event: unknown, ...args: unknown[]) => unknown;
type EventListener = (event: unknown, ...args: unknown[]) => void;

class FakeIpcMain {
  handlers = new Map<string, InvokeHandler>();
  listeners = new Map<string, EventListener[]>();

  handle(channel: string, handler: InvokeHandler): void {
    this.handlers.set(channel, handler);
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel);
  }

  on(channel: string, listener: EventListener): void {
    const list = this.listeners.get(channel) ?? [];
    list.push(listener);
    this.listeners.set(channel, list);
  }

  removeAllListeners(channel: string): void {
    this.listeners.delete(channel);
  }

  /** Calls a registered invoke handler the way ipcRenderer.invoke would. */
  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No handler registered for ${channel}`);
    return handler({ sender: FakeBrowserWindow.instances[0]?.webContents }, ...args);
  }

  /** Calls a registered handler with a specific sender. */
  async invokeFrom(sender: unknown, channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel);
    if (!handler) throw new Error(`No handler registered for ${channel}`);
    return handler({ sender }, ...args);
  }

  /** Delivers a fire and forget message the way ipcRenderer.send would. */
  emit(channel: string, sender: unknown, ...args: unknown[]): void {
    for (const listener of this.listeners.get(channel) ?? []) listener({ sender }, ...args);
  }

  reset(): void {
    this.handlers.clear();
    this.listeners.clear();
  }
}

export const ipcMain = new FakeIpcMain();

export const dialogResponses = {
  openFile: { canceled: false, filePaths: ['/tmp/chosen.ts'] },
  openFolder: { canceled: false, filePaths: ['/tmp/workspace'] },
  save: { canceled: false, filePath: '/tmp/saved.ts' },
  message: { response: 0 }
};

export const dialog = {
  showOpenDialog: vi.fn(async (_window?: unknown, options?: { properties?: string[] }) => {
    const opts = options ?? (_window as { properties?: string[] }) ?? {};
    return opts.properties?.includes('openDirectory') ? dialogResponses.openFolder : dialogResponses.openFile;
  }),
  showSaveDialog: vi.fn(async () => dialogResponses.save),
  showMessageBox: vi.fn(async () => dialogResponses.message)
};

export const app = {
  getName: vi.fn(() => 'causeway'),
  getVersion: vi.fn(() => '1.0.0'),
  getPath: vi.fn((_name: string) => '/tmp/causeway-userdata'),
  getAppPath: vi.fn(() => '/tmp/causeway-app'),
  isPackaged: false,
  quit: vi.fn(),
  on: vi.fn(),
  whenReady: vi.fn(async () => undefined),
  requestSingleInstanceLock: vi.fn(() => true),
  setAppUserModelId: vi.fn(),
  dock: { setMenu: vi.fn() }
};

export const shell = {
  openExternal: vi.fn(async () => undefined),
  // Returns true when Windows accepted the shortcut write.
  writeShortcutLink: vi.fn((_path: string, _operation: string, _options: unknown) => true)
};

export const menuTemplates: unknown[] = [];

export class Menu {
  static applicationMenu: unknown = null;

  constructor(readonly template: unknown) {}

  static buildFromTemplate(template: unknown): Menu {
    menuTemplates.push(template);
    return new Menu(template);
  }

  static setApplicationMenu(menu: unknown): void {
    Menu.applicationMenu = menu;
  }
}

export const protocolHandlers = new Map<string, (request: Request) => Promise<Response>>();
export const privilegedSchemes: unknown[] = [];

export const protocol = {
  registerSchemesAsPrivileged: vi.fn((schemes: unknown[]) => {
    privilegedSchemes.push(...schemes);
  }),
  handle: vi.fn((scheme: string, handler: (request: Request) => Promise<Response>) => {
    protocolHandlers.set(scheme, handler);
  })
};

export const net = {
  fetch: vi.fn(async (url: string) => new Response('file contents for ' + url, { status: 200 }))
};

export const nativeTheme = { themeSource: 'system' };

export const BrowserWindow = FakeBrowserWindow;

/** Restores every fake to its initial state. */
export function resetElectronMock(): void {
  FakeBrowserWindow.reset();
  ipcMain.reset();
  protocolHandlers.clear();
  privilegedSchemes.length = 0;
  menuTemplates.length = 0;
  Menu.applicationMenu = null;
  app.isPackaged = false;
  dialogResponses.openFile = { canceled: false, filePaths: ['/tmp/chosen.ts'] };
  dialogResponses.openFolder = { canceled: false, filePaths: ['/tmp/workspace'] };
  dialogResponses.save = { canceled: false, filePath: '/tmp/saved.ts' };
  dialogResponses.message = { response: 0 };
  vi.clearAllMocks();
}
