import { watch, type FSWatcher } from 'node:fs';
import { join } from 'node:path';
import type { FileEvent } from '@shared/types';
import { WATCHER_DEBOUNCE_MS, IGNORED_DIRECTORIES } from '@shared/constants';
import { createLogger } from '@shared/logger';

const log = createLogger('file-watcher');

/**
 * Recursive workspace watcher.
 *
 * Windows and macOS support `recursive: true` natively. On Linux the flag is
 * only available from Node 20 with limited platform support, so the watcher
 * degrades to a single non-recursive watch on the workspace root rather than
 * spawning one inotify handle per directory, which would exhaust the default
 * user watch limit on large repositories.
 */
export class FileWatcherService {
  #watchers = new Map<string, FSWatcher>();
  #pending = new Map<string, FileEvent>();
  #flushTimer: ReturnType<typeof setTimeout> | null = null;
  #onEvents: (events: FileEvent[]) => void;

  constructor(onEvents: (events: FileEvent[]) => void) {
    this.#onEvents = onEvents;
  }

  watch(rootPath: string): void {
    this.dispose();
    const recursive = process.platform === 'win32' || process.platform === 'darwin';

    try {
      const watcher = watch(rootPath, { recursive, persistent: false }, (eventType, filename) => {
        if (!filename) return;
        const relative = filename.toString();
        if (this.#isIgnored(relative)) return;
        this.#queue({
          kind: eventType === 'rename' ? 'created' : 'changed',
          path: join(rootPath, relative)
        });
      });

      watcher.on('error', (error) => {
        log.warn(`Watcher error for ${rootPath}: ${String(error)}`);
      });

      this.#watchers.set(rootPath, watcher);
      log.info(`Watching ${rootPath} (recursive: ${recursive})`);
    } catch (error) {
      // A missing watch is a degraded experience, never a fatal error: the user
      // can still edit and save, the explorer simply needs a manual refresh.
      log.warn(`Could not watch ${rootPath}: ${String(error)}`);
    }
  }

  dispose(): void {
    for (const watcher of this.#watchers.values()) watcher.close();
    this.#watchers.clear();
    if (this.#flushTimer !== null) clearTimeout(this.#flushTimer);
    this.#flushTimer = null;
    this.#pending.clear();
  }

  #isIgnored(relativePath: string): boolean {
    const segments = relativePath.split(/[\\/]/);
    return segments.some((segment) => IGNORED_DIRECTORIES.includes(segment));
  }

  /**
   * Coalesces bursts of events. A single save triggers several raw events on
   * most platforms; the renderer only needs the final state.
   */
  #queue(event: FileEvent): void {
    this.#pending.set(event.path, event);
    if (this.#flushTimer !== null) return;
    this.#flushTimer = setTimeout(() => {
      this.#flushTimer = null;
      const events = [...this.#pending.values()];
      this.#pending.clear();
      if (events.length > 0) this.#onEvents(events);
    }, WATCHER_DEBOUNCE_MS);
  }
}
