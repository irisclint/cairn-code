import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Settings surviving the rename.
 *
 * Electron derives the userData directory from the product name, so changing
 * that name points every existing installation at an empty folder. Without
 * this, upgrading would silently reset the theme, the font, the shell and
 * every other preference, and the user would have no way to tell that the
 * cause was a rename rather than a bug.
 *
 * These tests own the electron mock, because the store reads `app.getPath`
 * only on this path and the rest of the suite has no reason to stub it.
 */

let root: string;
let userData: string;

const getPath = vi.fn((_name: string) => userData);
vi.mock('electron', () => ({ app: { getPath: (name: string) => getPath(name) } }));

/** Waits for the store's serialised write queue to drain. */
const flushWrites = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 80));

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'causeway-migration-'));
  userData = join(root, 'causeway');
  await mkdir(userData, { recursive: true });
});

afterEach(async () => {
  await flushWrites();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

/** Writes a settings file under the name the application used to have. */
async function writePreviousSettings(contents: Record<string, unknown>): Promise<string> {
  const previous = join(root, 'cairn-code');
  await mkdir(previous, { recursive: true });
  const path = join(previous, 'settings.json');
  await writeFile(path, JSON.stringify(contents), 'utf8');
  return path;
}

describe('settings left behind by the previous name', () => {
  it('should inherit them when this name has none yet', async () => {
    await writePreviousSettings({ 'editor.fontSize': 19, 'workbench.theme': 'nordic' });

    const { SettingsStore } = await import('@main/services/settings-store');
    const settings = await new SettingsStore().load();

    expect(settings['editor.fontSize']).toBe(19);
    expect(settings['workbench.theme']).toBe('nordic');
  });

  it('should write them to the new location, so the old one is read once', async () => {
    await writePreviousSettings({ 'editor.fontSize': 21 });

    const { SettingsStore } = await import('@main/services/settings-store');
    await new SettingsStore().load();
    await flushWrites();

    const written = JSON.parse(await readFile(join(userData, 'settings.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(written['editor.fontSize']).toBe(21);
  });

  it('should leave the previous file in place rather than moving it', async () => {
    const previous = await writePreviousSettings({ 'editor.fontSize': 21 });

    const { SettingsStore } = await import('@main/services/settings-store');
    await new SettingsStore().load();
    await flushWrites();

    // Still readable. If the migration is ever wrong, the original is the only
    // copy of what the user actually chose.
    await expect(readFile(previous, 'utf8')).resolves.toContain('editor.fontSize');
  });

  it('should prefer settings already saved under this name', async () => {
    await writePreviousSettings({ 'editor.fontSize': 19 });
    await writeFile(join(userData, 'settings.json'), JSON.stringify({ 'editor.fontSize': 14 }), 'utf8');

    const { SettingsStore } = await import('@main/services/settings-store');
    const settings = await new SettingsStore().load();

    expect(settings['editor.fontSize']).toBe(14);
  });

  it('should fall back to the defaults when neither name has a file', async () => {
    const { SettingsStore, DEFAULT_SETTINGS } = await import('@main/services/settings-store');
    const settings = await new SettingsStore().load();

    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it('should not throw when the previous file is not valid JSON', async () => {
    await writeFile(join(root, 'cairn-code', 'settings.json'), '{ not json', 'utf8').catch(
      async () => {
        await mkdir(join(root, 'cairn-code'), { recursive: true });
        await writeFile(join(root, 'cairn-code', 'settings.json'), '{ not json', 'utf8');
      }
    );

    const { SettingsStore, DEFAULT_SETTINGS } = await import('@main/services/settings-store');
    const settings = await new SettingsStore().load();

    expect(settings).toEqual(DEFAULT_SETTINGS);
  });
});
