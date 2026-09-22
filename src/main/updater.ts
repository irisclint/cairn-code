import { app } from 'electron';
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
      const { autoUpdater } = await import('electron-updater');
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
      log.warn(`Update check failed: ${String(error)}`);
      return this.#emit({
        state: 'error',
        message: 'Could not reach the update server. Check your internet connection and try again.'
      });
    }
  }

  async quitAndInstall(): Promise<void> {
    if (this.#status.state !== 'downloaded') return;
    const { autoUpdater } = await import('electron-updater');
    autoUpdater.quitAndInstall();
  }

  #emit(status: UpdateStatus): UpdateStatus {
    this.#status = status;
    this.onStatus(status);
    return status;
  }
}
