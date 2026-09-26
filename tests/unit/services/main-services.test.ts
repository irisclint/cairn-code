import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileSystemService } from '@main/services/fs-service';
import { SearchService } from '@main/services/search-service';
import { SettingsStore, DEFAULT_SETTINGS } from '@main/services/settings-store';
import { detectShells } from '@main/services/shell-detector';
import { FileSystemError, WorkspaceError } from '@shared/errors';

/** Waits for the settings store's serialised write queue to drain. */
const flushWrites = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60));

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'causeway-unit-'));
});

afterEach(async () => {
  // The settings store writes asynchronously; letting its queue drain first
  // avoids removing the directory out from under an in-flight write.
  await flushWrites();
  await rm(root, { recursive: true, force: true, maxRetries: 12, retryDelay: 60 });
});

describe('FileSystemService', () => {
  const files = new FileSystemService();

  it('should read a file with its metadata', async () => {
    const path = join(root, 'hello.txt');
    const contents = 'hello causeway';
    await writeFile(path, contents, 'utf8');

    const result = await files.readFile(path);
    expect(result.content).toBe(contents);
    expect(result.path).toBe(path);
    // Derived rather than written out, so editing the fixture cannot leave a
    // stale byte count behind.
    expect(result.size).toBe(Buffer.byteLength(contents, 'utf8'));
    expect(result.isLarge).toBe(false);
  });

  it('should raise an actionable error for a missing file', async () => {
    await expect(files.readFile(join(root, 'nope.txt'))).rejects.toThrowError(FileSystemError);

    try {
      await files.readFile(join(root, 'nope.txt'));
    } catch (error) {
      const fsError = error as FileSystemError;
      expect(fsError.code).toBe('FS_ENOENT');
      expect(fsError.userCause.length).toBeGreaterThan(0);
      expect(fsError.solution.length).toBeGreaterThan(0);
    }
  });

  it('should refuse to read a directory as a file', async () => {
    await mkdir(join(root, 'folder'));
    await expect(files.readFile(join(root, 'folder'))).rejects.toThrowError(/folder/i);
  });

  it('should write a file and report its new size', async () => {
    const path = join(root, 'out.txt');
    const stat = await files.writeFile(path, 'written');

    expect(stat.size).toBe(7);
    expect(await readFile(path, 'utf8')).toBe('written');
  });

  it('should list a directory with folders before files, each sorted by name', async () => {
    await mkdir(join(root, 'zeta'));
    await mkdir(join(root, 'alpha'));
    await writeFile(join(root, 'b.txt'), '');
    await writeFile(join(root, 'a.txt'), '');

    const entries = await files.readDirectory(root);
    expect(entries.map((entry) => entry.name)).toEqual(['alpha', 'zeta', 'a.txt', 'b.txt']);
    expect(entries[0]?.isDirectory).toBe(true);
  });

  it('should hide ignored directories from the listing', async () => {
    await mkdir(join(root, 'node_modules'));
    await mkdir(join(root, '.git'));
    await mkdir(join(root, 'src'));

    const names = (await files.readDirectory(root)).map((entry) => entry.name);
    expect(names).toEqual(['src']);
  });

  it('should sort numerically so file10 comes after file2', async () => {
    for (const name of ['file10.txt', 'file2.txt', 'file1.txt']) {
      await writeFile(join(root, name), '');
    }
    const names = (await files.readDirectory(root)).map((entry) => entry.name);
    expect(names).toEqual(['file1.txt', 'file2.txt', 'file10.txt']);
  });

  it('should create a file and refuse to overwrite an existing one', async () => {
    const path = join(root, 'new.txt');
    await files.createFile(path);
    expect(await files.exists(path)).toBe(true);

    await expect(files.createFile(path)).rejects.toThrowError(/already exists/i);
  });

  it('should create nested directories', async () => {
    const path = join(root, 'a', 'b', 'c');
    await files.createDirectory(path);
    expect(await files.exists(path)).toBe(true);
  });

  it('should rename a file', async () => {
    const from = join(root, 'old.txt');
    const to = join(root, 'new.txt');
    await writeFile(from, 'content');

    const stat = await files.rename(from, to);
    expect(stat.path).toBe(to);
    expect(await files.exists(from)).toBe(false);
  });

  it('should refuse a rename that would overwrite an existing entry', async () => {
    await writeFile(join(root, 'a.txt'), '');
    await writeFile(join(root, 'b.txt'), '');
    await expect(files.rename(join(root, 'a.txt'), join(root, 'b.txt'))).rejects.toThrowError(/taken/i);
  });

  it('should delete a file and a directory tree', async () => {
    await writeFile(join(root, 'gone.txt'), '');
    await files.delete(join(root, 'gone.txt'));
    expect(await files.exists(join(root, 'gone.txt'))).toBe(false);

    await mkdir(join(root, 'tree', 'deep'), { recursive: true });
    await writeFile(join(root, 'tree', 'deep', 'f.txt'), '');
    await files.delete(join(root, 'tree'));
    expect(await files.exists(join(root, 'tree'))).toBe(false);
  });

  it('should report existence without throwing', async () => {
    expect(await files.exists(join(root, 'missing'))).toBe(false);
  });
});

describe('SearchService', () => {
  const search = new SearchService();

  beforeEach(async () => {
    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'index.ts'), 'const needle = 1;\nconst other = 2;\nneedle;\n');
    await writeFile(join(root, 'src', 'helper.ts'), 'export function helper() {}\n');
    await writeFile(join(root, 'README.md'), '# needle in the readme\n');
    await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(join(root, 'node_modules', 'pkg', 'index.js'), 'needle everywhere\n');
  });

  it('should find every match grouped by file', async () => {
    const results = await search.searchInFiles(root, {
      query: 'needle',
      isRegex: false,
      matchCase: false,
      wholeWord: false
    });

    const total = results.reduce((sum, result) => sum + result.matches.length, 0);
    expect(total).toBe(3);
    expect(results).toHaveLength(2);
  });

  it('should never descend into ignored directories', async () => {
    const results = await search.searchInFiles(root, {
      query: 'needle',
      isRegex: false,
      matchCase: false,
      wholeWord: false
    });
    expect(results.some((result) => result.path.includes('node_modules'))).toBe(false);
  });

  it('should report the line and column of each match', async () => {
    const results = await search.searchInFiles(root, {
      query: 'other',
      isRegex: false,
      matchCase: false,
      wholeWord: false
    });

    const match = results[0]?.matches[0];
    expect(match?.lineNumber).toBe(2);
    expect(match?.column).toBe(6);
    expect(match?.length).toBe(5);
  });

  it('should respect the case sensitivity toggle', async () => {
    const insensitive = await search.searchInFiles(root, {
      query: 'NEEDLE',
      isRegex: false,
      matchCase: false,
      wholeWord: false
    });
    expect(insensitive.length).toBeGreaterThan(0);

    const sensitive = await search.searchInFiles(root, {
      query: 'NEEDLE',
      isRegex: false,
      matchCase: true,
      wholeWord: false
    });
    expect(sensitive).toHaveLength(0);
  });

  it('should match whole words only when asked', async () => {
    await writeFile(join(root, 'src', 'words.ts'), 'needles\nneedle\n');

    const whole = await search.searchInFiles(root, {
      query: 'needle',
      isRegex: false,
      matchCase: true,
      wholeWord: true
    });
    const file = whole.find((result) => result.path.endsWith('words.ts'));
    expect(file?.matches).toHaveLength(1);
    expect(file?.matches[0]?.lineNumber).toBe(2);
  });

  it('should support regular expressions', async () => {
    const results = await search.searchInFiles(root, {
      query: 'const \\w+',
      isRegex: true,
      matchCase: true,
      wholeWord: false
    });
    expect(results[0]?.matches.length).toBe(2);
  });

  it('should explain an invalid regular expression instead of crashing', async () => {
    await expect(
      search.searchInFiles(root, { query: '([', isRegex: true, matchCase: false, wholeWord: false })
    ).rejects.toThrowError(WorkspaceError);
  });

  it('should treat a literal query as literal text', async () => {
    await writeFile(join(root, 'src', 'literal.ts'), 'a.b.c\n');
    const results = await search.searchInFiles(root, {
      query: 'a.b.c',
      isRegex: false,
      matchCase: true,
      wholeWord: false
    });
    expect(results.some((result) => result.path.endsWith('literal.ts'))).toBe(true);
  });

  it('should honour an include glob', async () => {
    const results = await search.searchInFiles(root, {
      query: 'needle',
      isRegex: false,
      matchCase: false,
      wholeWord: false,
      includeGlob: '**/*.md'
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.path.endsWith('README.md')).toBe(true);
  });

  it('should honour an exclude glob', async () => {
    const results = await search.searchInFiles(root, {
      query: 'needle',
      isRegex: false,
      matchCase: false,
      wholeWord: false,
      excludeGlob: '**/*.md'
    });
    expect(results.every((result) => !result.path.endsWith('.md'))).toBe(true);
  });

  it('should stop at the result limit', async () => {
    const results = await search.searchInFiles(root, {
      query: 'needle',
      isRegex: false,
      matchCase: false,
      wholeWord: false,
      maxResults: 1
    });
    const total = results.reduce((sum, result) => sum + result.matches.length, 0);
    expect(total).toBe(1);
  });

  it('should return nothing for an empty query', async () => {
    const results = await search.searchInFiles(root, {
      query: '',
      isRegex: false,
      matchCase: false,
      wholeWord: false
    });
    expect(results).toEqual([]);
  });

  it('should rank file name matches by fuzzy score', async () => {
    const names = await search.searchFileNames(root, 'index');
    expect(names[0]?.endsWith('index.ts')).toBe(true);
  });

  it('should list files when the file name query is empty', async () => {
    const names = await search.searchFileNames(root, '');
    expect(names.length).toBeGreaterThan(0);
  });
});

describe('SettingsStore', () => {
  it('should start from the defaults when no file exists', async () => {
    const store = new SettingsStore(join(root, 'settings.json'));
    expect(await store.load()).toEqual(DEFAULT_SETTINGS);
  });

  it('should keep telemetry off by default', () => {
    expect(DEFAULT_SETTINGS['telemetry.enabled']).toBe(false);
  });

  it('should persist a changed setting and read it back', async () => {
    const path = join(root, 'settings.json');
    const store = new SettingsStore(path);
    await store.load();

    store.set('editor.fontSize', 18);
    await flushWrites();

    const reloaded = new SettingsStore(path);
    expect((await reloaded.load())['editor.fontSize']).toBe(18);
  });

  it('should merge a partial file over the defaults', async () => {
    const path = join(root, 'settings.json');
    await writeFile(path, JSON.stringify({ 'editor.fontSize': 20 }), 'utf8');

    const settings = await new SettingsStore(path).load();
    expect(settings['editor.fontSize']).toBe(20);
    expect(settings['editor.tabSize']).toBe(DEFAULT_SETTINGS['editor.tabSize']);
  });

  it('should drop unknown keys from the file', async () => {
    const path = join(root, 'settings.json');
    await writeFile(path, JSON.stringify({ 'not.a.setting': true }), 'utf8');

    const settings = await new SettingsStore(path).load();
    expect('not.a.setting' in settings).toBe(false);
  });

  it('should ignore a value of the wrong type', async () => {
    const path = join(root, 'settings.json');
    await writeFile(path, JSON.stringify({ 'editor.fontSize': 'huge' }), 'utf8');

    const settings = await new SettingsStore(path).load();
    expect(settings['editor.fontSize']).toBe(DEFAULT_SETTINGS['editor.fontSize']);
  });

  it('should fall back to the defaults when the file is corrupt', async () => {
    const path = join(root, 'settings.json');
    await writeFile(path, '{ not json at all', 'utf8');

    expect(await new SettingsStore(path).load()).toEqual(DEFAULT_SETTINGS);
  });

  it('should restore every default on reset', async () => {
    const store = new SettingsStore(join(root, 'settings.json'));
    await store.load();
    store.set('editor.fontSize', 30);
    expect(store.reset()).toEqual(DEFAULT_SETTINGS);
  });

  it('should return a copy so callers cannot mutate the store', async () => {
    const store = new SettingsStore(join(root, 'settings.json'));
    await store.load();

    const snapshot = store.getAll();
    snapshot['editor.fontSize'] = 99;
    expect(store.get('editor.fontSize')).toBe(DEFAULT_SETTINGS['editor.fontSize']);
  });
});

describe('detectShells', () => {
  it('should always return at least one shell', () => {
    const shells = detectShells();
    expect(shells.length).toBeGreaterThan(0);
  });

  it('should give every shell an id, a label and an executable', () => {
    for (const shell of detectShells()) {
      expect(shell.id.length).toBeGreaterThan(0);
      expect(shell.label.length).toBeGreaterThan(0);
      expect(shell.executable.length).toBeGreaterThan(0);
      expect(Array.isArray(shell.args)).toBe(true);
    }
  });

  it('should return platform appropriate shells', () => {
    const labels = detectShells().map((shell) => shell.label.toLowerCase());
    if (process.platform === 'win32') {
      expect(labels.some((label) => label.includes('powershell') || label.includes('command prompt'))).toBe(
        true
      );
    } else {
      expect(labels.some((label) => /sh|bash|zsh|fish/.test(label))).toBe(true);
    }
  });
});
