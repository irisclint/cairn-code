/**
 * Runs ESLint off the main thread.
 *
 * Linting a large file with a plugin-heavy configuration takes long enough to
 * be felt, and the main process also serves every filesystem and terminal
 * request, so it cannot afford to block. This runs in a worker thread and
 * talks over messages.
 *
 * ESLint is loaded from the opened workspace rather than bundled with the
 * editor. That is the only way the workspace's own configuration, plugins,
 * parser and version are honoured, and it keeps a large dependency tree out of
 * the installer. A workspace without ESLint gets an explanation, not a crash.
 */

import { parentPort } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { LintFinding } from '@shared/types';

/* -------------------------------------------------------------------------- */
/* Protocol                                                                    */
/* -------------------------------------------------------------------------- */

export interface LintRequestMessage {
  id: number;
  /** Absolute path of the file being linted. */
  filePath: string;
  /** The current editor contents, which may differ from what is on disk. */
  text: string;
  /** The opened workspace root, used to resolve ESLint and its config. */
  cwd: string;
}

export interface LintFailure {
  code: string;
  message: string;
  cause: string;
  solution: string;
}

export type LintResponseMessage =
  | { id: number; ok: true; findings: LintFinding[]; ignored: boolean }
  | { id: number; ok: false; error: LintFailure };

/* -------------------------------------------------------------------------- */
/* ESLint loading                                                              */
/* -------------------------------------------------------------------------- */

interface EslintLike {
  lintText: (
    text: string,
    options: { filePath: string; warnIgnored?: boolean }
  ) => Promise<Array<{ messages: RawMessage[] }>>;
  isPathIgnored: (filePath: string) => Promise<boolean>;
}

interface RawMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  fix?: unknown;
}

/**
 * One instance per workspace, because constructing ESLint reads and validates
 * the whole configuration, which is the expensive part.
 */
const cache = new Map<string, EslintLike>();

function loadEslint(cwd: string): EslintLike {
  const cached = cache.get(cwd);
  if (cached) return cached;

  // Resolution starts at a file inside the workspace, so Node walks that
  // project's node_modules rather than the editor's.
  const requireFromWorkspace = createRequire(join(cwd, 'package.json'));

  let module: { ESLint: new (options: { cwd: string }) => EslintLike };
  try {
    module = requireFromWorkspace('eslint') as typeof module;
  } catch (error) {
    throw new LintError({
      code: 'ESLINT_NOT_INSTALLED',
      message: 'ESLint is not installed in this workspace',
      cause: `Resolving "eslint" from ${cwd} failed: ${describe(error)}. causeway deliberately uses the project's own ESLint so that its configuration, plugins and version are the ones that apply.`,
      solution:
        'Run npm install --save-dev eslint in the workspace, or switch diagnostics.enableEslint off in Settings if this project does not use ESLint.'
    });
  }

  if (typeof module?.ESLint !== 'function') {
    throw new LintError({
      code: 'ESLINT_UNSUPPORTED',
      message: 'This workspace has a version of ESLint causeway cannot drive',
      cause: 'The resolved module does not export the ESLint class, which every version since 7 provides.',
      solution: 'Upgrade the workspace to ESLint 8 or newer, or turn diagnostics.enableEslint off in Settings.'
    });
  }

  const instance = new module.ESLint({ cwd });
  cache.set(cwd, instance);
  return instance;
}

class LintError extends Error {
  readonly failure: LintFailure;

  constructor(failure: LintFailure) {
    super(failure.message);
    this.name = 'LintError';
    this.failure = failure;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* -------------------------------------------------------------------------- */
/* Message handling                                                            */
/* -------------------------------------------------------------------------- */

async function lint(request: LintRequestMessage): Promise<LintResponseMessage> {
  try {
    const eslint = loadEslint(request.cwd);

    // A file the project ignores should show nothing rather than a wall of
    // parser errors from, say, a minified bundle in dist/.
    if (await eslint.isPathIgnored(request.filePath)) {
      return { id: request.id, ok: true, findings: [], ignored: true };
    }

    const results = await eslint.lintText(request.text, { filePath: request.filePath });
    const messages = results[0]?.messages ?? [];

    const findings = messages.map(
      (message): LintFinding => ({
        ruleId: message.ruleId ?? null,
        severity: message.severity === 2 ? 2 : 1,
        message: message.message,
        line: Math.max(1, message.line ?? 1),
        column: Math.max(1, message.column ?? 1),
        endLine: message.endLine,
        endColumn: message.endColumn,
        fixable: message.fix !== undefined
      })
    );

    return { id: request.id, ok: true, findings, ignored: false };
  } catch (error) {
    if (error instanceof LintError) return { id: request.id, ok: false, error: error.failure };

    // A configuration that throws is the common remaining case, and the
    // message ESLint produces for it is usually the useful part.
    return {
      id: request.id,
      ok: false,
      error: {
        code: 'ESLINT_FAILED',
        message: 'ESLint could not lint this file',
        cause: describe(error),
        solution:
          'Run npx eslint on the file in a terminal to see the full error. A configuration that fails there fails here for the same reason.'
      }
    };
  }
}

parentPort?.on('message', (request: LintRequestMessage) => {
  void lint(request).then((response) => parentPort?.postMessage(response));
});
