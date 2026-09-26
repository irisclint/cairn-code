import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ExtensionRegistry, hashBundle, type ExtensionBundle } from '@main/services/extension-registry';

let root: string;
let registry: ExtensionRegistry;

const MANIFEST = {
  id: 'acme.hello',
  name: 'Hello',
  version: '1.0.0',
  publisher: 'acme',
  description: 'Says hello.',
  main: 'extension.js',
  permissions: ['commands'],
  contributes: { commands: [{ id: 'hello.say', title: 'Say Hello' }] }
};

function bundle(overrides: Partial<ExtensionBundle> = {}): ExtensionBundle {
  return {
    manifest: MANIFEST,
    files: { 'extension.js': 'export function activate() {}\n' },
    ...overrides
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'causeway-ext-'));
  registry = new ExtensionRegistry(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 12, retryDelay: 60 });
});

describe('an empty installation', () => {
  it('should list nothing rather than failing', async () => {
    expect(await registry.list()).toEqual([]);
  });

  it('should list nothing when the folder does not exist at all', async () => {
    const missing = new ExtensionRegistry(join(root, 'not-created-yet'));
    expect(await missing.list()).toEqual([]);
  });
});

describe('installing', () => {
  it('should write the files and report the manifest', async () => {
    const manifest = await registry.install(bundle());

    expect(manifest.id).toBe('acme.hello');
    expect(await readFile(join(root, 'acme.hello', 'extension.js'), 'utf8')).toContain('activate');
    expect(await exists(join(root, 'acme.hello', 'causeway.extension.json'))).toBe(true);
  });

  it('should create nested folders a bundle asks for', async () => {
    await registry.install(
      bundle({
        manifest: { ...MANIFEST, main: 'dist/extension.js' },
        files: { 'dist/extension.js': 'x', 'assets/icon.svg': '<svg/>' }
      })
    );

    expect(await exists(join(root, 'acme.hello', 'dist', 'extension.js'))).toBe(true);
    expect(await exists(join(root, 'acme.hello', 'assets', 'icon.svg'))).toBe(true);
  });

  it('should show it in the list, enabled by default', async () => {
    await registry.install(bundle());
    const [installed] = await registry.list();

    expect(installed?.manifest.id).toBe('acme.hello');
    expect(installed?.status).toBe('enabled');
  });

  it('should replace rather than merge, so a removed file does not survive', async () => {
    await registry.install(bundle({ files: { 'extension.js': 'x', 'old.js': 'gone soon' } }));
    expect(await exists(join(root, 'acme.hello', 'old.js'))).toBe(true);

    await registry.install(bundle({ files: { 'extension.js': 'x' } }));
    expect(await exists(join(root, 'acme.hello', 'old.js'))).toBe(false);
  });
});

describe('refusing a bad bundle', () => {
  it.each([
    ['../escaped.js', 'a parent directory'],
    ['../../etc/passwd', 'two levels up'],
    ['sub/../../escaped.js', 'a path that climbs out after descending']
  ])('should refuse %s, which is %s', async (path) => {
    await expect(
      registry.install(bundle({ files: { 'extension.js': 'x', [path]: 'payload' } }))
    ).rejects.toMatchObject({ code: 'EXTENSION_BUNDLE_ESCAPES' });
  });

  it('should leave nothing behind when a path escapes', async () => {
    await registry
      .install(bundle({ files: { 'extension.js': 'x', '../escaped.js': 'payload' } }))
      .catch(() => undefined);

    // Neither the escaped file nor a half-written extension folder.
    expect(await exists(join(root, 'escaped.js'))).toBe(false);
    expect(await exists(join(root, 'acme.hello'))).toBe(false);
  });

  it('should refuse a bundle whose manifest is invalid, before writing anything', async () => {
    await expect(
      registry.install(bundle({ manifest: { ...MANIFEST, id: 'no-publisher' } }))
    ).rejects.toMatchObject({ code: 'EXTENSION_MANIFEST_INVALID' });

    expect(await exists(join(root, 'no-publisher'))).toBe(false);
  });

  it('should refuse a bundle with no files', async () => {
    await expect(registry.install(bundle({ files: {} }))).rejects.toMatchObject({
      code: 'EXTENSION_BUNDLE_EMPTY'
    });
  });

  it('should refuse a bundle whose entry file is not in it', async () => {
    await expect(
      registry.install(bundle({ files: { 'something-else.js': 'x' } }))
    ).rejects.toMatchObject({ code: 'EXTENSION_MAIN_MISSING' });
  });

  it('should refuse a file larger than the limit', async () => {
    const huge = 'x'.repeat(3 * 1024 * 1024);
    await expect(
      registry.install(bundle({ files: { 'extension.js': huge } }))
    ).rejects.toMatchObject({ code: 'EXTENSION_FILE_TOO_LARGE' });
  });

  it('should refuse a bundle with more files than the limit', async () => {
    const files: Record<string, string> = { 'extension.js': 'x' };
    for (let i = 0; i < 250; i += 1) files[`f${i}.js`] = 'x';

    await expect(registry.install(bundle({ files }))).rejects.toMatchObject({
      code: 'EXTENSION_BUNDLE_TOO_LARGE'
    });
  });
});

describe('enabling and disabling', () => {
  beforeEach(async () => {
    await registry.install(bundle());
  });

  it('should turn one off without removing it', async () => {
    await registry.setEnabled('acme.hello', false);

    const [installed] = await registry.list();
    expect(installed?.status).toBe('disabled');
    expect(await exists(join(root, 'acme.hello', 'extension.js'))).toBe(true);
  });

  it('should keep the choice across a restart', async () => {
    await registry.setEnabled('acme.hello', false);

    const reopened = new ExtensionRegistry(root);
    expect((await reopened.list())[0]?.status).toBe('disabled');
  });

  it('should leave a disabled extension out of what runs', async () => {
    await registry.setEnabled('acme.hello', false);
    expect(await registry.enabled()).toEqual([]);

    await registry.setEnabled('acme.hello', true);
    expect(await registry.enabled()).toHaveLength(1);
  });

  it('should refuse to enable something that is not installed', async () => {
    await expect(registry.setEnabled('acme.missing', true)).rejects.toMatchObject({
      code: 'EXTENSION_NOT_INSTALLED'
    });
  });

  it('should refuse an id that climbs out of the extensions folder', async () => {
    await expect(registry.setEnabled('../../elsewhere', true)).rejects.toMatchObject({
      code: 'EXTENSION_BAD_ID'
    });
  });
});

describe('uninstalling', () => {
  it('should remove the folder and forget the choice', async () => {
    await registry.install(bundle());
    await registry.setEnabled('acme.hello', false);

    await registry.uninstall('acme.hello');
    expect(await exists(join(root, 'acme.hello'))).toBe(false);

    // Reinstalling starts enabled again rather than inheriting the old state.
    await registry.install(bundle());
    expect((await registry.list())[0]?.status).toBe('enabled');
  });

  it('should refuse an id that climbs out of the extensions folder', async () => {
    await expect(registry.uninstall('../../elsewhere')).rejects.toMatchObject({
      code: 'EXTENSION_BAD_ID'
    });
  });
});

describe('an installation that has gone wrong', () => {
  it('should report a broken manifest rather than hiding the extension', async () => {
    await mkdir(join(root, 'acme.broken'), { recursive: true });
    await writeFile(join(root, 'acme.broken', 'causeway.extension.json'), '{ not json');

    const [installed] = await registry.list();
    expect(installed?.status).toBe('failed');
    expect(installed?.failure).toBeTruthy();
    expect(installed?.manifest.id).toBe('acme.broken');
  });

  it('should refuse a folder whose name does not match the manifest id', async () => {
    // Otherwise one extension could shadow another by folder name alone.
    await mkdir(join(root, 'acme.pretender'), { recursive: true });
    await writeFile(
      join(root, 'acme.pretender', 'causeway.extension.json'),
      JSON.stringify({ ...MANIFEST, id: 'acme.hello' })
    );

    const [installed] = await registry.list();
    expect(installed?.status).toBe('failed');
    expect(installed?.failure).toContain('does not match');
  });

  it('should ignore a stray file in the extensions folder', async () => {
    await writeFile(join(root, 'notes.txt'), 'not an extension');
    expect(await registry.list()).toEqual([]);
  });
});

describe('hashing a bundle', () => {
  it('should be stable for the same text and differ for any change', () => {
    const text = JSON.stringify(bundle());

    expect(hashBundle(text)).toBe(hashBundle(text));
    expect(hashBundle(text)).toHaveLength(64);
    expect(hashBundle(text)).not.toBe(hashBundle(text + ' '));
  });
});
