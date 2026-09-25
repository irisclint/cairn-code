import { app } from 'electron';
import type { AppUpdater } from 'electron-updater';
import type { UpdateStatus } from '@shared/types';
import { createLogger } from '@shared/logger';

const log = createLogger('updater');

/**
 * Auto-update coordinator built on electron-updater.
 *
 * The module is imported lazily and only in packaged builds: electron-updater
 * throws when it cannot find an app-update.yml, which is always the case during
 * development. Any failure is reported as an update status rather than crashing
 * the application, because a failed update check must never block editing.
 */
export class UpdateService {
  #status: UpdateStatus = { state: 'idle' };

  /**
   * Resolves electron-updater across both module shapes.
   *
   * It is a CommonJS package, and the main process is bundled as CommonJS, so
   * `await import` goes through an interop wrapper that puts the real exports
   * under `default`. Read from the wrong one and `autoUpdater` is `undefined`,
   * and the first property assigned to it throws a TypeError naming the
   * property rather than the cause. Development never sees it, because there
   * the module is loaded directly.
   */
  static async resolveUpdater(): Promise<AppUpdater> {
    const imported = (await import('electron-updater')) as unknown as {
      autoUpdater?: AppUpdater;
      default?: { autoUpdater?: AppUpdater };
    };
    const updater = imported.autoUpdater ?? imported.default?.autoUpdater;

    if (!updater) {
      throw new Error(
        'electron-updater loaded but exposed no autoUpdater. Cause: it was reached through a ' +
          'module interop shape this code does not handle. Solution: report this with your ' +
          'platform and version, and use the download page until it is fixed.'
      );
    }

    return updater;
  }

  constructor(private readonly onStatus: (status: UpdateStatus) => void) {}

  get status(): UpdateStatus {
    return this.#status;
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      return this.#emit({
        state: 'error',
        message: 'Update checks are only available in a packaged build of cairn-code.'
      });
    }

    this.#emit({ state: 'checking' });

    try {
      const autoUpdater = await UpdateService.resolveUpdater();
      autoUpdater.autoDownload = false;
      autoUpdater.logger = null;

      autoUpdater.on('update-available', (info) => {
        this.#emit({ state: 'available', version: info.version });
        void autoUpdater.downloadUpdate();
      });
      autoUpdater.on('update-not-available', () => this.#emit({ state: 'not-available' }));
      autoUpdater.on('download-progress', (progress) => {
        this.#emit({ state: 'downloading', percent: Math.round(progress.percent) });
      });
      autoUpdater.on('update-downloaded', (info) =>
        this.#emit({ state: 'downloaded', version: info.version })
      );
      autoUpdater.on('error', (error) => {
        this.#emit({ state: 'error', message: error.message });
      });

      await autoUpdater.checkForUpdates();
      return this.#status;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      log.warn(`Update check failed: ${reason}`);
      return this.#emit({
        state: 'error',
        // The old text here blamed the network for every failure, including the
        // ones that never reached it. Saying what actually went wrong costs one
        // line and is the whole point of the project.
        message: `Could not check for updates: ${reason}`
      });
    }
  }

  async quitAndInstall(): Promise<void> {
    if (this.#status.state !== 'downloaded') return;
    const autoUpdater = await UpdateService.resolveUpdater();
    autoUpdater.quitAndInstall();
  }

  #emit(status: UpdateStatus): UpdateStatus {
    this.#status = status;
    this.onStatus(status);
    return status;
  }
}
