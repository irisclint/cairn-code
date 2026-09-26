import type { IpcResult } from './types';

/**
 * Base class for every error causeway raises on purpose.
 *
 * A CausewayError always answers three questions: what happened (`message`),
 * why it happened (`cause`) and what the user can do (`solution`). Error
 * messages that only state a failure are treated as a defect, see
 * docs/development/rules/coding-style.md.
 */
export class CausewayError extends Error {
  readonly code: string;
  readonly userCause: string;
  readonly solution: string;
  readonly original?: unknown;

  constructor(params: {
    code: string;
    message: string;
    cause: string;
    solution: string;
    original?: unknown;
  }) {
    super(params.message);
    this.name = new.target.name;
    this.code = params.code;
    this.userCause = params.cause;
    this.solution = params.solution;
    this.original = params.original;
    Error.captureStackTrace?.(this, new.target);
  }

  toIpcError(): { code: string; message: string; cause: string; solution: string } {
    return {
      code: this.code,
      message: this.message,
      cause: this.userCause,
      solution: this.solution
    };
  }
}

export class FileSystemError extends CausewayError {}
export class WorkspaceError extends CausewayError {}
export class TerminalError extends CausewayError {}
export class ThemeError extends CausewayError {}
export class SettingsError extends CausewayError {}
export class ExtensionError extends CausewayError {}

/** Maps a Node.js `errno` code onto an actionable FileSystemError. */
export function fileSystemErrorFor(error: unknown, path: string): FileSystemError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN';

  const table: Record<string, { message: string; cause: string; solution: string }> = {
    ENOENT: {
      message: `File or folder not found: ${path}`,
      cause: 'The path does not exist any more, or it was never created.',
      solution: 'Check the path for typos, or refresh the explorer to reload the folder contents.'
    },
    EACCES: {
      message: `Permission denied: ${path}`,
      cause: 'The operating system refused access because the process lacks the required rights.',
      solution: 'Adjust the file permissions, or reopen the folder from a location you own.'
    },
    EPERM: {
      message: `Operation not permitted: ${path}`,
      cause: 'The file is locked, read-only, or protected by the operating system.',
      solution: 'Close any program that holds the file open and remove the read-only flag.'
    },
    EISDIR: {
      message: `Expected a file but found a folder: ${path}`,
      cause: 'A read or write was requested for a path that points to a directory.',
      solution: 'Select a file inside the folder instead of the folder itself.'
    },
    ENOTDIR: {
      message: `Expected a folder but found a file: ${path}`,
      cause: 'A directory listing was requested for a path that points to a file.',
      solution: 'Open the parent folder instead of the file.'
    },
    EBUSY: {
      message: `Resource is busy: ${path}`,
      cause: 'Another process is currently using the file.',
      solution: 'Close the other program and try again.'
    },
    EMFILE: {
      message: 'Too many open files',
      cause: 'The process reached the operating system limit for open file handles.',
      solution: 'Close some editors, or raise the open file limit of your system.'
    },
    ENOSPC: {
      message: `No space left on device while writing ${path}`,
      cause: 'The target drive is full, or the system watcher limit was reached.',
      solution: 'Free disk space, or raise fs.inotify.max_user_watches on Linux.'
    }
  };

  const entry = table[code] ?? {
    message: `Filesystem operation failed for ${path}`,
    cause: `The operating system reported the error code ${code}.`,
    solution: 'Check that the path exists and that causeway is allowed to access it.'
  };

  return new FileSystemError({ code: `FS_${code}`, ...entry, original: error });
}

/** Normalises any thrown value into the IPC error envelope. */
export function toIpcResult<T>(error: unknown): Extract<IpcResult<T>, { ok: false }> {
  if (error instanceof CausewayError) {
    return { ok: false, error: error.toIpcError() };
  }
  if (error instanceof Error) {
    return {
      ok: false,
      error: {
        code: 'UNEXPECTED',
        message: error.message,
        cause: 'An unexpected internal error occurred.',
        solution: 'Please report this with the log output from Help > Toggle Developer Tools.'
      }
    };
  }
  return {
    ok: false,
    error: {
      code: 'UNEXPECTED',
      message: String(error),
      cause: 'An unexpected value was thrown that is not an Error.',
      solution: 'Please report this with the log output from Help > Toggle Developer Tools.'
    }
  };
}

/** Wraps a handler so it always resolves to an IpcResult envelope. */
export async function guarded<T>(fn: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return toIpcResult<T>(error);
  }
}
