import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('electron', () => import('./electron-mock'));

const { resetElectronMock, app: fakeApp, shell: fakeShell } = await import('./electron-mock');
const { ShortcutService } = await import('@main/services/shortcut-service');
const { CausewayError } = await import('@shared/errors');

let desktop: string;
let resources: string;
let service: InstanceType<typeof ShortcutService>;

beforeEach(async () => {
  resetElectronMock();
  desktop = await mkdtemp(join(tmpdir(), 'causeway-desktop-'));
  resources = await mkdtemp(join(tmpdir(), 'causeway-resources-'));

  fakeApp.getPath = vi.fn((name: string) => {
    if (name === 'desktop') return desktop;
    if (name === 'exe') return join(resources, 'causeway.exe');
    return resources;
  });
  fakeApp.isPackaged = true;
  (process as { resourcesPath?: string }).resourcesPath = resources;

  service = new ShortcutService();
});

afterEach(async () => {
  fakeApp.isPackaged = false;
  await rm(desktop, { recursive: true, force: true, maxRetries: 3 });
  await rm(resources, { recursive: true, force: true, maxRetries: 3 });
});

describe('reporting the state', () => {
  it('should say a shortcut can be created in a packaged build', async () => {
    const state = await service.getState();

    expect(state.canCreate).toBe(true);
    expect(state.exists).toBe(false);
    expect(state.path.startsWith(desktop)).toBe(true);
  });

  it('should refuse in a development build, and say why', async () => {
    fakeApp.isPackaged = false;
    const state = await service.getState();

    expect(state.canCreate).toBe(false);
    expect(state.reason).toContain('development');
  });

  it('should name a platform appropriate file', async () => {
    const state = await service.getState();

    if (process.platform === 'win32') expect(state.path.endsWith('.lnk')).toBe(true);
    else if (process.platform === 'darwin') expect(state.path.endsWith('causeway')).toBe(true);
    else expect(state.path.endsWith('.desktop')).toBe(true);
  });

  it('should report an existing shortcut', async () => {
    const state = await service.getState();
    await writeFile(state.path, 'placeholder');

    expect((await service.getState()).exists).toBe(true);
  });

  it('should fall back to a home directory path when the shell folder is unknown', async () => {
    fakeApp.getPath = vi.fn((name: string) => {
      if (name === 'desktop') throw new Error('no desktop folder configured');
      return join(resources, 'causeway.exe');
    });

    // The fallback must still produce a usable path rather than throwing.
    await expect(service.getState()).resolves.toMatchObject({ canCreate: true });
  });
});

describe('creating the shortcut', () => {
  it('should refuse a development build with a cause and a fix', async () => {
    fakeApp.isPackaged = false;

    await expect(service.create()).rejects.toThrowError(CausewayError);
    try {
      await service.create();
    } catch (error) {
      const failure = error as InstanceType<typeof CausewayError>;
      expect(failure.code).toBe('SHORTCUT_UNAVAILABLE');
      expect(failure.userCause.length).toBeGreaterThan(0);
      expect(failure.solution).toContain('installer');
    }
  });

  it.runIf(process.platform !== 'win32' && process.platform !== 'darwin')(
    'should write an executable desktop entry on Linux',
    async () => {
      const path = await service.create();
      const entry = await readFile(path, 'utf8');

      expect(entry).toContain('[Desktop Entry]');
      expect(entry).toContain('Name=causeway');
      expect(entry).toContain('Categories=Development;IDE;TextEditor;');
      // A launcher has to be executable or a file manager treats it as text.
      expect((await stat(path)).mode & 0o111).toBeGreaterThan(0);
    }
  );

  it.runIf(process.platform !== 'win32' && process.platform !== 'darwin')(
    'should quote the executable so an install path with a space works',
    async () => {
      const spaced = join(resources, 'Program Files');
      await mkdir(spaced, { recursive: true });
      fakeApp.getPath = vi.fn((name: string) => (name === 'desktop' ? desktop : join(spaced, 'causeway')));

      const entry = await readFile(await service.create(), 'utf8');
      expect(entry).toContain('Exec="' + join(spaced, 'causeway') + '" %U');
    }
  );

  it.runIf(process.platform === 'win32')('should ask the shell to write a link on Windows', async () => {
    fakeShell.writeShortcutLink = vi.fn(() => true);

    const path = await service.create();

    expect(path.endsWith('causeway.lnk')).toBe(true);
    expect(fakeShell.writeShortcutLink).toHaveBeenCalledWith(
      path,
      'create',
      expect.objectContaining({ appUserModelId: 'dev.causeway.editor' })
    );
  });

  it.runIf(process.platform === 'win32')('should report a refusal from the shell', async () => {
    fakeShell.writeShortcutLink = vi.fn(() => false);

    await expect(service.create()).rejects.toMatchObject({ code: 'SHORTCUT_FAILED' });
  });
});

describe('removing the shortcut', () => {
  it('should report false when there is nothing to remove', async () => {
    expect(await service.remove()).toBe(false);
  });

  it('should delete an existing shortcut', async () => {
    const { path } = await service.getState();
    await writeFile(path, 'placeholder');

    expect(await service.remove()).toBe(true);
    expect((await service.getState()).exists).toBe(false);
  });
});
