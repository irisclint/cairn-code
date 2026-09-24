import { describe, it, expect, beforeEach, vi } from 'vitest';
import { join, resolve } from 'node:path';

import { ExtensionApi, type ExtensionCapabilities } from '@main/services/extension-api';
import { EXTENSION_PERMISSIONS, type ExtensionManifest, type ExtensionPermission } from '@shared/types';

/**
 * The permission gate.
 *
 * The sandbox keeps an extension away from the system; this decides what it
 * may ask the editor to do instead. These tests are the second half of that
 * boundary, so every refusal is checked for the reason and the fix, and every
 * method is checked to need a permission.
 */

// Resolved, so the expectations below match on Windows too, where an
// absolute path carries a drive letter.
const ROOT = resolve(join('/', 'work', 'project'));

let capabilities: ExtensionCapabilities;
let api: ExtensionApi;

function manifest(overrides: Partial<ExtensionManifest> = {}): ExtensionManifest {
  return {
    id: 'acme.hello',
    name: 'Hello',
    version: '1.0.0',
    publisher: 'acme',
    description: 'Says hello.',
    main: 'extension.js',
    permissions: [...EXTENSION_PERMISSIONS],
    contributes: { commands: [{ id: 'hello.say', title: 'Say Hello' }] },
    ...overrides
  };
}

/** The same manifest but granted only the named permissions. */
function granted(...permissions: ExtensionPermission[]): ExtensionManifest {
  return manifest({ permissions });
}

beforeEach(() => {
  capabilities = {
    workspaceRoot: vi.fn(() => ROOT),
    readFile: vi.fn(async () => 'contents'),
    writeFile: vi.fn(async () => undefined),
    listFiles: vi.fn(async () => ['a.ts']),
    notify: vi.fn(),
    registerCommand: vi.fn(),
    addExplanation: vi.fn(),
    readClipboard: vi.fn(() => 'clipboard text'),
    writeClipboard: vi.fn(),
    isBuiltInCommand: vi.fn(() => false)
  };
  api = new ExtensionApi(capabilities);
});

describe('the API surface', () => {
  it('should refuse a method that does not exist, and say what does', async () => {
    await expect(api.call(manifest(), 'filesystem.deleteEverything', [])).rejects.toMatchObject({
      code: 'EXTENSION_UNKNOWN_METHOD'
    });

    await api.call(manifest(), 'nope', []).catch((error: { solution: string }) => {
      expect(error.solution).toContain('workspace.readFile');
    });
  });

  it('should require a permission for every method it offers', async () => {
    // Nothing is free: an extension granted nothing can do nothing.
    const nothing = granted();

    for (const method of ExtensionApi.methods()) {
      await expect(api.call(nothing, method, ['x', 'y', 'z'])).rejects.toMatchObject({
        code: 'EXTENSION_PERMISSION_DENIED'
      });
    }
  });

  it('should name the missing permission and what it would allow', async () => {
    try {
      await api.call(granted('commands'), 'workspace.readFile', ['a.ts']);
      expect.unreachable('reading without the permission should be refused');
    } catch (error) {
      const failure = error as { userCause: string; solution: string };
      expect(failure.userCause).toContain('workspace.read');
      expect(failure.userCause).toContain('read the files in your open folder');
      expect(failure.solution).toContain('permissions list');
    }
  });
});

describe('commands', () => {
  it('should register one the manifest declared', async () => {
    await api.call(granted('commands'), 'commands.register', ['hello.say']);

    expect(capabilities.registerCommand).toHaveBeenCalledWith('acme.hello', 'hello.say', 'Say Hello');
  });

  it('should refuse one the manifest never declared', async () => {
    // Otherwise the list a user saw before installing is not the list that
    // ends up in their palette.
    try {
      await api.call(granted('commands'), 'commands.register', ['hello.secret']);
      expect.unreachable('an undeclared command should be refused');
    } catch (error) {
      const failure = error as { code: string; userCause: string };
      expect(failure.code).toBe('EXTENSION_COMMAND_UNDECLARED');
      expect(failure.userCause).toContain('nobody reviewing or installing');
    }
  });

  it('should refuse to take over one of the editor own commands', async () => {
    vi.mocked(capabilities.isBuiltInCommand).mockReturnValue(true);

    const withFileSave = manifest({
      permissions: ['commands'],
      contributes: { commands: [{ id: 'file.save', title: 'Save' }] }
    });

    try {
      await api.call(withFileSave, 'commands.register', ['file.save']);
      expect.unreachable('a built-in command should not be replaceable');
    } catch (error) {
      const failure = error as { code: string; userCause: string; solution: string };
      expect(failure.code).toBe('EXTENSION_COMMAND_RESERVED');
      expect(failure.userCause).toContain('familiar shortcut');
      expect(failure.solution).toContain('acme.hello.');
    }

    expect(capabilities.registerCommand).not.toHaveBeenCalled();
  });
});

describe('the workspace', () => {
  it('should read a file inside the open folder', async () => {
    const result = await api.call(granted('workspace.read'), 'workspace.readFile', ['src/a.ts']);

    expect(result).toBe('contents');
    expect(capabilities.readFile).toHaveBeenCalledWith(join(ROOT, 'src', 'a.ts'));
  });

  it.each([
    '../secrets.txt',
    '../../../../etc/passwd',
    'src/../../outside.ts',
    'C:/Windows/system32/config/SAM'
  ])('should refuse the path %s, which is outside the folder', async (path) => {
    await expect(
      api.call(granted('workspace.read'), 'workspace.readFile', [path])
    ).rejects.toMatchObject({ code: 'EXTENSION_PATH_ESCAPES' });

    expect(capabilities.readFile).not.toHaveBeenCalled();
  });

  it('should say that the permission covers the open folder only', async () => {
    await api
      .call(granted('workspace.read'), 'workspace.readFile', ['../x'])
      .catch((error: { userCause: string; solution: string }) => {
        expect(error.userCause).toContain('open folder only');
        expect(error.solution).toContain('relative to the workspace root');
      });
  });

  it('should explain that there is no folder open, rather than reading from the disk root', async () => {
    vi.mocked(capabilities.workspaceRoot).mockReturnValue(null);

    await expect(
      api.call(granted('workspace.read'), 'workspace.readFile', ['a.ts'])
    ).rejects.toMatchObject({ code: 'EXTENSION_NO_WORKSPACE' });
  });

  it('should not let a read permission write', async () => {
    await expect(
      api.call(granted('workspace.read'), 'workspace.writeFile', ['a.ts', 'x'])
    ).rejects.toMatchObject({ code: 'EXTENSION_PERMISSION_DENIED' });

    expect(capabilities.writeFile).not.toHaveBeenCalled();
  });

  it('should write when the write permission was granted', async () => {
    await api.call(granted('workspace.write'), 'workspace.writeFile', ['a.ts', 'new text']);
    expect(capabilities.writeFile).toHaveBeenCalledWith(join(ROOT, 'a.ts'), 'new text');
  });
});

describe('notifications', () => {
  it('should say which extension a message came from', async () => {
    await api.call(granted('notifications'), 'notifications.show', ['Done', 'because', 'do this']);

    expect(capabilities.notify).toHaveBeenCalledWith({
      severity: 'info',
      message: 'Hello: Done',
      cause: 'because',
      solution: 'do this'
    });
  });
});

describe('diagnostic explanations', () => {
  it('should add one to the catalog', async () => {
    await api.call(granted('diagnostics'), 'diagnostics.explain', [
      'TS2532',
      'The value may be undefined.',
      'Narrow it first.',
      'https://example.com'
    ]);

    expect(capabilities.addExplanation).toHaveBeenCalledWith({
      code: 'TS2532',
      cause: 'The value may be undefined.',
      solution: 'Narrow it first.',
      documentationUrl: 'https://example.com'
    });
  });

  it('should refuse an explanation missing its cause or its solution', async () => {
    await expect(
      api.call(granted('diagnostics'), 'diagnostics.explain', ['TS1', '', 'fix'])
    ).rejects.toMatchObject({ code: 'EXTENSION_BAD_ARGUMENT' });

    await expect(
      api.call(granted('diagnostics'), 'diagnostics.explain', ['TS1', 'cause', ''])
    ).rejects.toMatchObject({ code: 'EXTENSION_BAD_ARGUMENT' });
  });
});

describe('arguments', () => {
  it.each([
    [undefined, 'nothing'],
    [null, 'null'],
    [42, 'a number'],
    [{}, 'a object'],
    ['', 'an empty string']
  ])('should refuse %s and say what arrived', async (value, described) => {
    await api
      .call(granted('clipboard'), 'clipboard.write', [value])
      .catch((error: { code: string; userCause: string }) => {
        expect(error.code).toBe('EXTENSION_BAD_ARGUMENT');
        expect(error.userCause).toContain(described);
      });

    expect(capabilities.writeClipboard).not.toHaveBeenCalled();
  });

  it('should say why it does not coerce', async () => {
    await api
      .call(granted('clipboard'), 'clipboard.write', [42])
      .catch((error: { solution: string }) => {
        expect(error.solution).toContain('hides the mistake');
      });
  });
});

describe('the clipboard', () => {
  it('should read and write when granted', async () => {
    expect(await api.call(granted('clipboard'), 'clipboard.read', [])).toBe('clipboard text');

    await api.call(granted('clipboard'), 'clipboard.write', ['copied']);
    expect(capabilities.writeClipboard).toHaveBeenCalledWith('copied');
  });
});
