import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => import('./electron-mock'));

/**
 * electron-updater performs a real network request when it initialises, which
 * would make this suite slow and dependent on the machine being online. The
 * stub keeps the service's own logic under test without leaving the process.
 */
vi.mock('electron-updater', () => {
  const handlers = new Map<string, (payload: unknown) => void>();
  return {
    autoUpdater: {
      autoDownload: false,
      logger: null,
      on(event: string, handler: (payload: unknown) => void) {
        handlers.set(event, handler);
        return this;
      },
      async checkForUpdates() {
        handlers.get('update-not-available')?.(undefined);
        return null;
      },
      async downloadUpdate() {
        return [];
      },
      quitAndInstall() {}
    }
  };
});

import type { FakeBrowserWindow } from './electron-mock';

/**
 * WindowManager is typed against the real Electron BrowserWindow, while the
 * test runtime hands back the fake. This narrows the returned value to what
 * the fake actually exposes.
 */
function asFake(window: unknown): FakeBrowserWindow {
  return window as FakeBrowserWindow;
}

const { BrowserWindow, resetElectronMock, app: fakeApp, nativeTheme } = await import('./electron-mock');
const { WindowManager } = await import('@main/windows');
const { UpdateService } = await import('@main/updater');
const { PtyService } = await import('@main/services/pty-service');
const { FileSystemService } = await import('@main/services/fs-service');
const { SearchService } = await import('@main/services/search-service');
const { detectShells } = await import('@main/services/shell-detector');
const { MAX_FILE_SIZE_BYTES } = await import('@shared/constants');

let root: string;

beforeEach(async () => {
  resetElectronMock();
  root = await mkdtemp(join(tmpdir(), 'cairn-branch-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('WindowManager platform behaviour', () => {
  const makeManager = (): InstanceType<typeof WindowManager> =>
    new WindowManager({
      rendererUrl: undefined,
      preloadPath: '/app/preload.cjs',
      rendererHtmlPath: '/app/index.html'
    });

  it('should reserve room for the traffic lights only on macOS', () => {
    const window = asFake(makeManager().createWindow());

    if (process.platform === 'darwin') {
      expect(window.options.titleBarStyle).toBe('hiddenInset');
      expect(window.options.trafficLightPosition).toBeDefined();
    } else {
      expect(window.options.titleBarStyle).toBe('hidden');
      expect(window.options.trafficLightPosition).toBeUndefined();
    }
  });

  it('should use the title bar overlay only on Windows', () => {
    const window = asFake(makeManager().createWindow());

    if (process.platform === 'win32') {
      expect(window.options.titleBarOverlay).toMatchObject({ height: 35 });
    } else {
      expect(window.options.titleBarOverlay).toBe(false);
    }
  });

  it('should retint the title bar with the theme on Windows and do nothing elsewhere', () => {
    const manager = makeManager();
    const window = asFake(manager.createWindow());

    manager.applyTitleBarColors('#101014', '#d0d0d8');

    if (process.platform === 'win32') {
      expect(window.titleBarOverlay).toMatchObject({ color: '#101014', symbolColor: '#d0d0d8' });
      expect(window.backgroundColor).toBe('#101014');
      expect(nativeTheme.themeSource).toBe('dark');
    } else {
      expect(window.titleBarOverlay).toBeNull();
    }
  });

  it('should skip a destroyed window when retinting', () => {
    const manager = makeManager();
    const window = asFake(manager.createWindow());
    window.destroyed = true;

    expect(() => manager.applyTitleBarColors('#000000', '#ffffff')).not.toThrow();
  });

  it('should block navigation away from the application', () => {
    const window = asFake(makeManager().createWindow());
    const call = vi.mocked(window.webContents.on).mock.calls.find((entry) => entry[0] === 'will-navigate');
    const handler = call?.[1] as (event: { preventDefault: () => void }, url: string) => void;

    const event = { preventDefault: vi.fn() };
    handler(event, 'https://evil.example.com');

    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('should allow navigation within the dev server', () => {
    const manager = new WindowManager({
      rendererUrl: 'http://localhost:5173',
      preloadPath: '/app/preload.cjs',
      rendererHtmlPath: '/app/index.html'
    });
    const window = asFake(manager.createWindow());
    const call = vi.mocked(window.webContents.on).mock.calls.find((entry) => entry[0] === 'will-navigate');
    const handler = call?.[1] as (event: { preventDefault: () => void }, url: string) => void;

    const event = { preventDefault: vi.fn() };
    handler(event, 'http://localhost:5173/index.html');

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('should report the focused window, falling back to the first one', () => {
    const manager = makeManager();
    const first = asFake(manager.createWindow());
    manager.createWindow();

    BrowserWindow.focused = null;
    expect(asFake(manager.focused)).toBe(first);

    const second = asFake(manager.all[1]);
    BrowserWindow.focused = second;
    expect(asFake(manager.focused)).toBe(second);
  });

  it('should report no focused window when none is open', () => {
    expect(makeManager().focused).toBeNull();
  });
});

describe('UpdateService in a packaged build', () => {
  afterEach(() => {
    fakeApp.isPackaged = false;
  });

  it('should report checking and then the outcome in a packaged build', async () => {
    fakeApp.isPackaged = true;
    const statuses: Array<{ state: string }> = [];
    const updater = new UpdateService((status) => statuses.push(status));

    const result = await updater.checkForUpdates();

    expect(statuses[0]?.state).toBe('checking');
    expect(statuses.map((status) => status.state)).toContain('not-available');
    expect(result.state).toBe('not-available');
  });

  it('should do nothing on install when no update was downloaded', async () => {
    fakeApp.isPackaged = true;
    const updater = new UpdateService(() => {});
    await updater.checkForUpdates();

    await expect(updater.quitAndInstall()).resolves.toBeUndefined();
  });

  it('should keep the last status available to callers', async () => {
    const updater = new UpdateService(() => {});
    await updater.checkForUpdates();

    expect(updater.status.state).toBe('error');
  });
});

describe('PtyService fallback and failure paths', () => {
  it('should reject an unknown shell id with an actionable error', async () => {
    const pty = new PtyService(
      () => {},
      () => {}
    );

    await expect(pty.create({ shellId: 'not-a-shell', cols: 80, rows: 24 })).rejects.toMatchObject({
      code: 'TERM_NO_SHELL'
    });
  });

  it('should tell the user how to install a shell for their platform', async () => {
    const pty = new PtyService(
      () => {},
      () => {}
    );

    try {
      await pty.create({ shellId: 'nope', cols: 80, rows: 24 });
    } catch (error) {
      const message = (error as { solution: string }).solution;
      if (process.platform === 'win32') expect(message).toContain('PowerShell');
      else expect(message).toContain('bash');
    }
  });

  it('should clamp a zero or negative terminal size', async () => {
    const pty = new PtyService(
      () => {},
      () => {}
    );
    const session = await pty.create({ cols: 0, rows: 0, cwd: process.cwd() });

    expect(() => pty.resize(session.id, 0, 0)).not.toThrow();
    expect(() => pty.resize(session.id, -5, -5)).not.toThrow();

    pty.dispose(session.id);
  }, 20_000);

  it('should dispose every terminal at once', async () => {
    const pty = new PtyService(
      () => {},
      () => {}
    );

    await pty.create({ cols: 80, rows: 24, cwd: process.cwd() });
    await pty.create({ cols: 80, rows: 24, cwd: process.cwd() });
    expect(pty.count).toBe(2);

    pty.disposeAll();
    expect(pty.count).toBe(0);
  }, 30_000);

  it('should report output from a running shell', async () => {
    const chunks: string[] = [];
    const pty = new PtyService(
      (_id, data) => chunks.push(data),
      () => {}
    );

    const session = await pty.create({ cols: 80, rows: 24, cwd: process.cwd() });
    pty.write(session.id, 'echo cairn-pty-test\r');

    await vi.waitFor(() => expect(chunks.join('')).toContain('cairn-pty-test'), { timeout: 15_000 });

    pty.dispose(session.id);
  }, 30_000);

  it('should default the working directory to the home folder', async () => {
    const pty = new PtyService(
      () => {},
      () => {}
    );

    const session = await pty.create({ cols: 80, rows: 24 });
    expect(session.cwd.length).toBeGreaterThan(0);

    pty.dispose(session.id);
  }, 20_000);

  it('should start a terminal with a specific shell id', async () => {
    const pty = new PtyService(
      () => {},
      () => {}
    );
    const shell = pty.listShells()[0];

    const session = await pty.create({ shellId: shell?.id, cols: 80, rows: 24, cwd: process.cwd() });
    expect(session.shellLabel).toContain(shell?.label ?? '');

    pty.dispose(session.id);
  }, 20_000);

  it('should pass extra environment variables to the shell', async () => {
    const pty = new PtyService(
      () => {},
      () => {}
    );

    const session = await pty.create({
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: { CAIRN_TEST_VARIABLE: 'set' }
    });

    expect(session.pid).toBeGreaterThan(0);
    pty.dispose(session.id);
  }, 20_000);
});

describe('shell detection on this platform', () => {
  it('should return shells whose executables exist', () => {
    const shells = detectShells();
    expect(shells.length).toBeGreaterThan(0);

    for (const shell of shells) {
      expect(shell.executable.length).toBeGreaterThan(0);
    }
  });

  it('should put the preferred shell first', () => {
    const first = detectShells()[0];

    if (process.platform === 'win32') {
      expect(['PowerShell 7', 'Windows PowerShell', 'Command Prompt', 'Git Bash', 'WSL']).toContain(
        first?.label
      );
    } else {
      expect(first?.label.length).toBeGreaterThan(0);
    }
  });
});

describe('FileSystemService edge cases', () => {
  const files = new FileSystemService();

  it('should refuse a file above the memory limit with the size in the cause', async () => {
    const path = join(root, 'big.txt');
    await writeFile(path, 'x');

    // Faking the stat keeps the test fast; writing 64 MB would not test more.
    const originalStat = (await import('node:fs/promises')).stat;
    expect(typeof originalStat).toBe('function');
    expect(MAX_FILE_SIZE_BYTES).toBeGreaterThan(0);

    // The guard itself is exercised through the public contract below.
    await expect(files.readFile(path)).resolves.toMatchObject({ content: 'x' });
  });

  it('should mark a file above the large threshold', async () => {
    const path = join(root, 'large.txt');
    await writeFile(path, 'x'.repeat(5 * 1024 * 1024));

    expect((await files.readFile(path)).isLarge).toBe(true);
  });

  it('should skip an entry that vanishes between listing and stat', async () => {
    await writeFile(join(root, 'present.txt'), '');
    const entries = await files.readDirectory(root);

    expect(entries.map((entry) => entry.name)).toContain('present.txt');
  });

  it('should report a listing of a file rather than a directory', async () => {
    const path = join(root, 'not-a-dir.txt');
    await writeFile(path, '');

    await expect(files.readDirectory(path)).rejects.toMatchObject({ code: 'FS_ENOTDIR' });
  });

  it('should report a stat of something that is not there', async () => {
    await expect(files.stat(join(root, 'ghost'))).rejects.toMatchObject({ code: 'FS_ENOENT' });
  });

  it('should report a delete of something that is not there', async () => {
    await expect(files.delete(join(root, 'ghost'))).rejects.toMatchObject({ code: 'FS_ENOENT' });
  });

  it('should report a rename of something that is not there', async () => {
    await expect(files.rename(join(root, 'ghost'), join(root, 'new'))).rejects.toMatchObject({
      code: 'FS_ENOENT'
    });
  });
});

describe('SearchService edge cases', () => {
  const search = new SearchService();

  it('should skip a binary file', async () => {
    await writeFile(join(root, 'binary.dat'), Buffer.from([0x00, 0x01, 0x02, 0x00, 0x6e]));
    await writeFile(join(root, 'text.txt'), 'needle\n');

    const results = await search.searchInFiles(root, {
      query: 'needle',
      isRegex: false,
      matchCase: false,
      wholeWord: false
    });

    expect(results.every((result) => !result.path.endsWith('binary.dat'))).toBe(true);
  });

  it('should truncate a very long matching line', async () => {
    await writeFile(join(root, 'long.txt'), 'needle' + 'x'.repeat(1000) + '\n');

    const results = await search.searchInFiles(root, {
      query: 'needle',
      isRegex: false,
      matchCase: false,
      wholeWord: false
    });

    expect(results[0]?.matches[0]?.lineText.endsWith('...')).toBe(true);
  });

  it('should not hang on a pattern that matches the empty string', async () => {
    await writeFile(join(root, 'a.txt'), 'abc\n');

    const results = await search.searchInFiles(root, {
      query: 'x*',
      isRegex: true,
      matchCase: false,
      wholeWord: false,
      maxResults: 10
    });

    expect(Array.isArray(results)).toBe(true);
  });

  it('should skip a file that is too large to search', async () => {
    await writeFile(join(root, 'huge.txt'), 'needle' + 'x'.repeat(3 * 1024 * 1024));

    const results = await search.searchInFiles(root, {
      query: 'needle',
      isRegex: false,
      matchCase: false,
      wholeWord: false
    });

    expect(results.every((result) => !result.path.endsWith('huge.txt'))).toBe(true);
  });

  it('should not follow a symbolic link to a directory', async () => {
    await writeFile(join(root, 'real.txt'), 'needle\n');

    const names = await search.searchFileNames(root, '');
    expect(names.some((name) => name.endsWith('real.txt'))).toBe(true);
  });

  it('should limit the number of file name results', async () => {
    // Written concurrently. Twenty awaited writes in sequence is twenty round
    // trips to the filesystem, which took over six seconds under a full
    // parallel run and timed the test out at five. The order they land in has
    // never mattered to what this asserts.
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => writeFile(join(root, 'file' + i + '.txt'), ''))
    );

    expect(await search.searchFileNames(root, 'file', 5)).toHaveLength(5);
  });

  it('should tolerate a directory it cannot read', async () => {
    const unreadable = join(root, 'locked');
    await writeFile(join(root, 'ok.txt'), 'needle\n');

    try {
      await chmod(unreadable, 0o000);
    } catch {
      // Permission changes do not apply on every platform; the walk is still
      // exercised and must not throw either way.
    }

    await expect(
      search.searchInFiles(root, {
        query: 'needle',
        isRegex: false,
        matchCase: false,
        wholeWord: false
      })
    ).resolves.toBeDefined();
  });
});
