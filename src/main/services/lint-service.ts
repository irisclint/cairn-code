import { Worker } from 'node:worker_threads';
import { join, sep } from 'node:path';
import { existsSync } from 'node:fs';
import { CairnError } from '@shared/errors';
import { createLogger } from '@shared/logger';
import type { LintOutcome } from '@shared/types';
import type { LintRequestMessage, LintResponseMessage } from '../workers/eslint-worker';

const log = createLogger('lint');

/** A request that takes longer than this is treated as a hung worker. */
const TIMEOUT_MS = 10_000;

/**
 * Drives the ESLint worker.
 *
 * The worker is started on the first request and kept alive, because
 * constructing ESLint reads and validates the whole configuration and that is
 * the slow part. If it dies, the next request starts a new one rather than
 * failing for the rest of the session.
 */
export class LintService {
  #worker: Worker | null = null;
  #nextId = 1;
  #pending = new Map<
    number,
    { resolve: (outcome: LintOutcome) => void; reject: (error: unknown) => void; timer: NodeJS.Timeout }
  >();

  /**
   * Where the built worker lives.
   *
   * worker_threads cannot load a file from inside an asar archive, so the
   * worker is unpacked by the packaging configuration and the path is
   * redirected to the unpacked copy. In development both paths are the same.
   */
  #workerPath(): string {
    const unpacked = __dirname.replace(`app.asar${sep}`, `app.asar.unpacked${sep}`);
    const candidate = join(unpacked, 'eslint-worker.cjs');
    return existsSync(candidate) ? candidate : join(__dirname, 'eslint-worker.cjs');
  }

  #start(): Worker {
    if (this.#worker) return this.#worker;

    const path = this.#workerPath();
    if (!existsSync(path)) {
      throw new CairnError({
        code: 'LINT_WORKER_MISSING',
        message: 'The ESLint worker is missing from this build',
        cause: `No worker script was found at ${path}, so linting cannot be started.`,
        solution: 'Reinstall cairn-code, or run npm run build if you are working from source.'
      });
    }

    const worker = new Worker(path);

    worker.on('message', (response: LintResponseMessage) => {
      const entry = this.#pending.get(response.id);
      if (!entry) return;

      clearTimeout(entry.timer);
      this.#pending.delete(response.id);

      if (response.ok) {
        entry.resolve({ findings: response.findings, ignored: response.ignored });
        return;
      }

      entry.reject(
        new CairnError({
          code: response.error.code,
          message: response.error.message,
          cause: response.error.cause,
          solution: response.error.solution
        })
      );
    });

    worker.on('error', (error) => {
      log.warn(`The ESLint worker failed: ${String(error)}`);
      this.#failAll(error);
      this.#worker = null;
    });

    worker.on('exit', (code) => {
      if (code !== 0) log.warn(`The ESLint worker exited with code ${code}`);
      this.#failAll(new Error(`The ESLint worker stopped with code ${code}.`));
      this.#worker = null;
    });

    // Nothing should be held open by linting when the app wants to quit.
    worker.unref();

    this.#worker = worker;
    return worker;
  }

  #failAll(reason: unknown): void {
    for (const [, entry] of this.#pending) {
      clearTimeout(entry.timer);
      entry.reject(
        new CairnError({
          code: 'LINT_WORKER_STOPPED',
          message: 'Linting stopped unexpectedly',
          cause: `The worker running ESLint ended before it answered: ${String(reason)}`,
          solution:
            'Save the file to lint it again. If it keeps happening, run npx eslint on the file in a terminal to see whether the configuration itself is failing.'
        })
      );
    }
    this.#pending.clear();
  }

  /** Lints the given contents as if they were the file at `filePath`. */
  async lint(filePath: string, text: string, cwd: string): Promise<LintOutcome> {
    const worker = this.#start();
    const id = this.#nextId++;

    return new Promise<LintOutcome>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(
          new CairnError({
            code: 'LINT_TIMEOUT',
            message: 'ESLint took too long and was given up on',
            cause: `No result arrived within ${TIMEOUT_MS / 1000} seconds. A rule caught in a loop on this file is the usual reason.`,
            solution:
              'Run npx eslint on this file in a terminal to find the rule that hangs, then disable it for this file while you report it.'
          })
        );
      }, TIMEOUT_MS);

      this.#pending.set(id, { resolve, reject, timer });
      const request: LintRequestMessage = { id, filePath, text, cwd };
      worker.postMessage(request);
    });
  }

  /** Stops the worker. Safe to call when it was never started. */
  async dispose(): Promise<void> {
    this.#failAll(new Error('cairn-code is shutting down.'));
    const worker = this.#worker;
    this.#worker = null;
    if (worker) await worker.terminate();
  }
}
