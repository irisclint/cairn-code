import { describe, it, expect } from 'vitest';
import { parseManifest, validateManifest } from '@main/services/extension-manifest';

/**
 * The manifest check is the last cheap place to turn a bad extension away, so
 * every rejection here is asserted to carry a cause and a fix, not just a no.
 */

const VALID = {
  id: 'acme.hello',
  name: 'Hello',
  version: '1.0.0',
  publisher: 'acme',
  description: 'Says hello.',
  main: 'extension.js',
  permissions: ['commands', 'notifications'],
  contributes: {
    commands: [{ id: 'hello.say', title: 'Say Hello' }]
  }
};

function reject(manifest: unknown): { code: string; userCause: string; solution: string } {
  try {
    validateManifest(manifest, 'test.json');
  } catch (error) {
    return error as { code: string; userCause: string; solution: string };
  }
  throw new Error('the manifest was accepted when it should have been refused');
}

describe('a manifest that is fine', () => {
  it('should be accepted with everything it declared', () => {
    const manifest = validateManifest(VALID, 'test.json');

    expect(manifest.id).toBe('acme.hello');
    expect(manifest.permissions).toEqual(['commands', 'notifications']);
    expect(manifest.contributes.commands).toEqual([{ id: 'hello.say', title: 'Say Hello' }]);
  });

  it('should allow a data-only extension with no code and no permissions', () => {
    const manifest = validateManifest(
      {
        ...VALID,
        main: undefined,
        permissions: [],
        contributes: {
          diagnosticExplanations: [
            { code: 'TS2532', cause: 'The value may be undefined.', solution: 'Narrow it first.' }
          ]
        }
      },
      'test.json'
    );

    expect(manifest.main).toBeUndefined();
    expect(manifest.contributes.diagnosticExplanations).toHaveLength(1);
  });

  it('should not show the same permission twice', () => {
    const manifest = validateManifest(
      { ...VALID, permissions: ['commands', 'commands', 'notifications'] },
      'test.json'
    );

    expect(manifest.permissions).toEqual(['commands', 'notifications']);
  });
});

describe('identity', () => {
  it('should refuse an id that is not publisher.name', () => {
    const error = reject({ ...VALID, id: 'hello' });
    expect(error.code).toBe('EXTENSION_MANIFEST_INVALID');
    expect(error.solution).toContain('publisher');
  });

  it('should refuse an id whose publisher is not the declared publisher', () => {
    // Otherwise one publisher could ship an extension under another's name.
    const error = reject({ ...VALID, id: 'evil.hello', publisher: 'acme' });
    expect(error.userCause).toContain('does not begin with the publisher');
  });

  it('should refuse an id with uppercase or spaces', () => {
    expect(reject({ ...VALID, id: 'Acme.Hello' }).code).toBe('EXTENSION_MANIFEST_INVALID');
    expect(reject({ ...VALID, id: 'acme hello.x' }).code).toBe('EXTENSION_MANIFEST_INVALID');
  });

  it('should refuse a version that is not semantic', () => {
    expect(reject({ ...VALID, version: '1.0' }).solution).toContain('1.0.0');
  });

  it('should accept a pre-release version', () => {
    expect(validateManifest({ ...VALID, version: '2.1.0-beta.3' }, 'x').version).toBe('2.1.0-beta.3');
  });

  it.each(['name', 'description', 'publisher'])('should refuse a missing %s', (field) => {
    const manifest = { ...VALID } as Record<string, unknown>;
    delete manifest[field];
    expect(reject(manifest).userCause).toContain(field);
  });
});

describe('permissions', () => {
  it('should refuse a permission it does not know rather than ignoring it', () => {
    const error = reject({ ...VALID, permissions: ['commands', 'filesystem.everything'] });

    expect(error.userCause).toContain('filesystem.everything');
    // The reason matters: silently dropping it would install something whose
    // manifest claims more than the editor understood.
    expect(error.solution).toContain('refused rather than ignored');
  });

  it('should list the permissions that do exist', () => {
    const error = reject({ ...VALID, permissions: ['nope'] });
    expect(error.solution).toContain('workspace.read');
    expect(error.solution).toContain('clipboard');
  });

  it('should refuse permissions that are not a list', () => {
    expect(reject({ ...VALID, permissions: 'commands' }).userCause).toContain('not a list');
  });

  it('should refuse permissions asked for by an extension that runs nothing', () => {
    const error = reject({ ...VALID, main: undefined, permissions: ['workspace.write'] });
    expect(error.userCause).toContain('no code to use them');
  });
});

describe('the entry file', () => {
  it.each(['../../../etc/passwd', '/etc/passwd', 'C:/Windows/system32/cmd.exe', 'a/../../b.js'])(
    'should refuse an entry point that escapes the folder: %s',
    (main) => {
      const error = reject({ ...VALID, main });
      expect(error.userCause).toContain('outside the extension folder');
    }
  );

  it('should accept a nested entry point inside the folder', () => {
    expect(validateManifest({ ...VALID, main: 'dist/extension.js' }, 'x').main).toBe('dist/extension.js');
  });
});

describe('contributions', () => {
  it('should refuse a command with no title, which would be invisible', () => {
    const error = reject({
      ...VALID,
      contributes: { commands: [{ id: 'hello.say', title: '   ' }] }
    });

    expect(error.userCause).toContain('no title');
  });

  it('should refuse a command id with characters a palette cannot show', () => {
    expect(
      reject({ ...VALID, contributes: { commands: [{ id: 'hello say!', title: 'x' }] } }).userCause
    ).toContain('no usable id');
  });

  it('should hold a contributed explanation to the same rule as its own', () => {
    const noCause = reject({
      ...VALID,
      contributes: { diagnosticExplanations: [{ code: 'TS1', solution: 'Do this.' }] }
    });
    expect(noCause.userCause).toContain('no cause');
    expect(noCause.solution).toContain('what went wrong');

    const noSolution = reject({
      ...VALID,
      contributes: { diagnosticExplanations: [{ code: 'TS1', cause: 'Because.' }] }
    });
    expect(noSolution.userCause).toContain('no solution');
    expect(noSolution.solution).toContain('where they started');
  });

  it('should keep a documentation link when one is given', () => {
    const manifest = validateManifest(
      {
        ...VALID,
        contributes: {
          diagnosticExplanations: [
            { code: 'TS1', cause: 'a', solution: 'b', documentationUrl: 'https://example.com' }
          ]
        }
      },
      'x'
    );

    expect(manifest.contributes.diagnosticExplanations?.[0]?.documentationUrl).toBe(
      'https://example.com'
    );
  });
});

describe('parsing the file', () => {
  it('should read a manifest from text', () => {
    expect(parseManifest(JSON.stringify(VALID), 'x.json').id).toBe('acme.hello');
  });

  it('should say where the JSON broke', () => {
    try {
      parseManifest('{ "id": }', 'broken.json');
      expect.unreachable('broken JSON should be refused');
    } catch (error) {
      const failure = error as { code: string; userCause: string; solution: string };
      expect(failure.code).toBe('EXTENSION_MANIFEST_INVALID_JSON');
      expect(failure.userCause).toContain('broken.json');
      expect(failure.solution).toContain('where the parser gave up');
    }
  });

  it('should refuse a manifest that is an array rather than an object', () => {
    expect(reject([VALID]).userCause).toContain('not a JSON object');
  });
});
