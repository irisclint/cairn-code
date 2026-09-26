import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ExtensionRegistry, hashBundle } from '@main/services/extension-registry';
import { MarketplaceClient, type FetchLike } from '@main/services/marketplace';
import type { MarketplaceEntry } from '@shared/types';

/**
 * The marketplace client fetches code that will then run on this machine, so
 * most of these check what it refuses rather than what it accepts.
 */

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

const BUNDLE_TEXT = JSON.stringify({
  manifest: MANIFEST,
  files: { 'extension.js': 'causeway.commands.register("hello.say", function () {});' }
});

let root: string;
let registry: ExtensionRegistry;
let responses: Map<string, { ok: boolean; status: number; body: string }>;
let fetchImpl: FetchLike;
let client: MarketplaceClient;

function entry(overrides: Partial<MarketplaceEntry> = {}): MarketplaceEntry {
  return {
    id: 'acme.hello',
    name: 'Hello',
    version: '1.0.0',
    publisher: 'acme',
    description: 'Says hello.',
    permissions: ['commands'],
    archiveUrl: 'https://registry.example/acme.hello-1.0.0.json',
    sha256: hashBundle(BUNDLE_TEXT),
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
  root = await mkdtemp(join(tmpdir(), 'causeway-market-'));
  registry = new ExtensionRegistry(root);

  responses = new Map([
    ['https://registry.example/index.json', { ok: true, status: 200, body: JSON.stringify([entry()]) }],
    ['https://registry.example/acme.hello-1.0.0.json', { ok: true, status: 200, body: BUNDLE_TEXT }]
  ]);

  fetchImpl = vi.fn(async (url: string) => {
    const response = responses.get(url);
    if (!response) throw new Error('connection refused');
    return { ok: response.ok, status: response.status, text: async () => response.body };
  });

  client = new MarketplaceClient(registry, fetchImpl);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
});

describe('browsing a catalogue', () => {
  it('should read the entries a registry publishes', async () => {
    const entries = await client.browse('https://registry.example/index.json');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'acme.hello', permissions: ['commands'] });
  });

  it('should accept a catalogue wrapped in an object', async () => {
    responses.set('https://registry.example/index.json', {
      ok: true,
      status: 200,
      body: JSON.stringify({ extensions: [entry()] })
    });

    expect(await client.browse('https://registry.example/index.json')).toHaveLength(1);
  });

  it('should skip one malformed row rather than losing the whole catalogue', async () => {
    responses.set('https://registry.example/index.json', {
      ok: true,
      status: 200,
      body: JSON.stringify([entry(), { id: 'broken' }, entry({ id: 'acme.other' })])
    });

    const entries = await client.browse('https://registry.example/index.json');
    expect(entries.map((item) => item.id)).toEqual(['acme.hello', 'acme.other']);
  });

  it('should skip a row that asks for a permission that does not exist', async () => {
    responses.set('https://registry.example/index.json', {
      ok: true,
      status: 200,
      body: JSON.stringify([entry({ permissions: ['filesystem.everything'] as never })])
    });

    expect(await client.browse('https://registry.example/index.json')).toEqual([]);
  });

  it('should explain a page that is not a catalogue', async () => {
    responses.set('https://registry.example/index.json', {
      ok: true,
      status: 200,
      body: '<!doctype html><html></html>'
    });

    await expect(client.browse('https://registry.example/index.json')).rejects.toMatchObject({
      code: 'MARKETPLACE_BAD_INDEX',
      solution: expect.stringContaining('plain web page')
    });
  });

  it('should say when nothing is published at the address', async () => {
    responses.set('https://registry.example/index.json', { ok: false, status: 404, body: '' });

    await expect(client.browse('https://registry.example/index.json')).rejects.toMatchObject({
      code: 'MARKETPLACE_HTTP_ERROR',
      solution: expect.stringContaining('Nothing is published')
    });
  });

  it('should say when it cannot reach the registry at all', async () => {
    await expect(client.browse('https://nowhere.example/index.json')).rejects.toMatchObject({
      code: 'MARKETPLACE_UNREACHABLE'
    });
  });
});

describe('refusing an insecure address', () => {
  it.each(['http://registry.example/index.json', 'ftp://registry.example/index.json'])(
    'should refuse %s',
    async (url) => {
      await expect(client.browse(url)).rejects.toMatchObject({ code: 'MARKETPLACE_INSECURE' });
      expect(fetchImpl).not.toHaveBeenCalled();
    }
  );

  it('should say why, and that there is no way around it', async () => {
    await client.browse('http://registry.example/index.json').catch((error: { userCause: string; solution: string }) => {
      expect(error.userCause).toContain('code that will run on this machine');
      expect(error.solution).toContain('no setting to turn this off');
    });
  });

  it('should refuse an address that is not a URL', async () => {
    await expect(client.browse('registry.example')).rejects.toMatchObject({
      code: 'MARKETPLACE_BAD_URL'
    });
  });

  it('should refuse an insecure download even from an https catalogue', async () => {
    await expect(
      client.install(entry({ archiveUrl: 'http://registry.example/bundle.json' }))
    ).rejects.toMatchObject({ code: 'MARKETPLACE_INSECURE' });
  });
});

describe('installing', () => {
  it('should install an entry whose download matches its hash', async () => {
    await client.install(entry());

    expect(await exists(join(root, 'acme.hello', 'extension.js'))).toBe(true);
    expect((await registry.list())[0]?.manifest.id).toBe('acme.hello');
  });

  it('should refuse a download that does not hash to what was listed', async () => {
    responses.set('https://registry.example/acme.hello-1.0.0.json', {
      ok: true,
      status: 200,
      body: BUNDLE_TEXT.replace('Says hello.', 'Says something else.')
    });

    await expect(client.install(entry())).rejects.toMatchObject({
      code: 'MARKETPLACE_HASH_MISMATCH'
    });

    // And nothing is written when it does not match.
    expect(await exists(join(root, 'acme.hello'))).toBe(false);
  });

  it('should say what a hash mismatch means rather than just failing', async () => {
    responses.set('https://registry.example/acme.hello-1.0.0.json', {
      ok: true,
      status: 200,
      body: BUNDLE_TEXT + ' '
    });

    await client.install(entry()).catch((error: { userCause: string; solution: string }) => {
      expect(error.userCause).toContain('changed after being published');
      expect(error.solution).toContain('Do not install it');
    });
  });

  it('should refuse a bundle that is a different extension than the one listed', async () => {
    const other = JSON.stringify({
      manifest: { ...MANIFEST, id: 'evil.other', publisher: 'evil' },
      files: { 'extension.js': 'x' }
    });
    responses.set('https://registry.example/acme.hello-1.0.0.json', {
      ok: true,
      status: 200,
      body: other
    });

    await expect(client.install(entry({ sha256: hashBundle(other) }))).rejects.toMatchObject({
      code: 'MARKETPLACE_ID_MISMATCH'
    });
  });

  it('should refuse a bundle asking for more than the catalogue showed', async () => {
    // This is the difference between what a user agreed to and what they get.
    const greedy = JSON.stringify({
      manifest: { ...MANIFEST, permissions: ['commands', 'workspace.write'] },
      files: { 'extension.js': 'x' }
    });
    responses.set('https://registry.example/acme.hello-1.0.0.json', {
      ok: true,
      status: 200,
      body: greedy
    });

    await client
      .install(entry({ sha256: hashBundle(greedy) }))
      .catch((error: { code: string; userCause: string }) => {
        expect(error.code).toBe('MARKETPLACE_PERMISSION_MISMATCH');
        expect(error.userCause).toContain('You agreed to the first list');
      });

    expect(await exists(join(root, 'acme.hello'))).toBe(false);
  });

  it('should refuse a response that is far too large to be a bundle', async () => {
    responses.set('https://registry.example/acme.hello-1.0.0.json', {
      ok: true,
      status: 200,
      body: 'x'.repeat(9 * 1024 * 1024)
    });

    await expect(client.install(entry())).rejects.toMatchObject({
      code: 'MARKETPLACE_TOO_LARGE'
    });
  });

  it('should refuse a download that hashes correctly but is not a bundle', async () => {
    const notJson = 'this is not json at all';
    responses.set('https://registry.example/acme.hello-1.0.0.json', {
      ok: true,
      status: 200,
      body: notJson
    });

    await expect(client.install(entry({ sha256: hashBundle(notJson) }))).rejects.toMatchObject({
      code: 'MARKETPLACE_BAD_BUNDLE'
    });
  });
});
