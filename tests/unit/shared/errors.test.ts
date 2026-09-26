import { describe, it, expect } from 'vitest';
import {
  CausewayError,
  FileSystemError,
  TerminalError,
  fileSystemErrorFor,
  toIpcResult,
  guarded
} from '@shared/errors';

describe('CausewayError', () => {
  it('should carry code, message, cause and solution', () => {
    const error = new CausewayError({
      code: 'TEST',
      message: 'Something failed',
      cause: 'Because of a reason',
      solution: 'Do this instead'
    });

    expect(error.code).toBe('TEST');
    expect(error.message).toBe('Something failed');
    expect(error.userCause).toBe('Because of a reason');
    expect(error.solution).toBe('Do this instead');
    expect(error).toBeInstanceOf(Error);
  });

  it('should take the name of the concrete subclass', () => {
    const error = new TerminalError({ code: 'T', message: 'm', cause: 'c', solution: 's' });
    expect(error.name).toBe('TerminalError');
    expect(error).toBeInstanceOf(CausewayError);
  });

  it('should serialise into the IPC error shape', () => {
    const error = new FileSystemError({ code: 'FS_X', message: 'm', cause: 'c', solution: 's' });
    expect(error.toIpcError()).toEqual({ code: 'FS_X', message: 'm', cause: 'c', solution: 's' });
  });
});

describe('fileSystemErrorFor', () => {
  it('should explain ENOENT in terms the user can act on', () => {
    const error = fileSystemErrorFor({ code: 'ENOENT' }, '/tmp/missing.ts');

    expect(error).toBeInstanceOf(FileSystemError);
    expect(error.code).toBe('FS_ENOENT');
    expect(error.message).toContain('/tmp/missing.ts');
    expect(error.userCause.length).toBeGreaterThan(0);
    expect(error.solution.length).toBeGreaterThan(0);
  });

  it('should explain a permission failure', () => {
    const error = fileSystemErrorFor({ code: 'EACCES' }, '/root/secret');
    expect(error.code).toBe('FS_EACCES');
    expect(error.message).toContain('Permission denied');
  });

  it('should suggest the watcher limit for ENOSPC, which is the usual cause on Linux', () => {
    const error = fileSystemErrorFor({ code: 'ENOSPC' }, '/workspace');
    expect(error.solution).toContain('max_user_watches');
  });

  it('should still produce a cause and solution for an unknown errno', () => {
    const error = fileSystemErrorFor({ code: 'EWEIRD' }, '/tmp/file');
    expect(error.code).toBe('FS_EWEIRD');
    expect(error.userCause).toContain('EWEIRD');
    expect(error.solution.length).toBeGreaterThan(0);
  });

  it('should handle a thrown value that is not an errno object', () => {
    const error = fileSystemErrorFor('not an error', '/tmp/file');
    expect(error.code).toBe('FS_UNKNOWN');
  });
});

describe('toIpcResult', () => {
  it('should preserve cause and solution for a CausewayError', () => {
    const result = toIpcResult(new CausewayError({ code: 'C', message: 'm', cause: 'why', solution: 'how' }));
    expect(result.ok).toBe(false);
    expect(result.error).toEqual({ code: 'C', message: 'm', cause: 'why', solution: 'how' });
  });

  it('should wrap a plain Error with a generic explanation', () => {
    const result = toIpcResult(new Error('boom'));
    expect(result.error.code).toBe('UNEXPECTED');
    expect(result.error.message).toBe('boom');
    expect(result.error.cause).toBeDefined();
    expect(result.error.solution).toBeDefined();
  });

  it('should wrap a non-Error throw', () => {
    const result = toIpcResult('a string was thrown');
    expect(result.error.code).toBe('UNEXPECTED');
    expect(result.error.message).toBe('a string was thrown');
  });
});

describe('guarded', () => {
  it('should wrap a successful value', async () => {
    await expect(guarded(() => 42)).resolves.toEqual({ ok: true, value: 42 });
  });

  it('should await an async handler', async () => {
    await expect(guarded(async () => 'done')).resolves.toEqual({ ok: true, value: 'done' });
  });

  it('should convert a throw into a failed envelope instead of rejecting', async () => {
    const result = await guarded(() => {
      throw new FileSystemError({ code: 'FS_X', message: 'm', cause: 'c', solution: 's' });
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FS_X');
  });

  it('should convert a rejected promise into a failed envelope', async () => {
    const result = await guarded(async () => {
      throw new Error('async boom');
    });
    expect(result.ok).toBe(false);
  });
});
