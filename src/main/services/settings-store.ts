import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Settings, SettingKey } from '@shared/types';
import { DEFAULT_FONT_SIZE, DEFAULT_TAB_SIZE, DEFAULT_THEME_ID } from '@shared/constants';
import { createLogger } from '@shared/logger';

const log = createLogger('settings');

export const DEFAULT_SETTINGS: Settings = {
  'workbench.theme': DEFAULT_THEME_ID,
  'workbench.showMinimap': true,
  'workbench.showBreadcrumbs': true,
  'workbench.sidebarPosition': 'left',
  'editor.fontSize': DEFAULT_FONT_SIZE,
  'editor.fontFamily': "'JetBrains Mono', 'Cascadia Code', 'SF Mono', Consolas, monospace",
  'editor.tabSize': DEFAULT_TAB_SIZE,
  'editor.insertSpaces': true,
  'editor.wordWrap': 'off',
  'editor.lineNumbers': 'on',
  'editor.renderWhitespace': 'boundary',
  'editor.formatOnSave': false,
  'editor.autoSave': 'off',
  'editor.autoSaveDelayMs': 1000,
  'terminal.fontSize': 13,
  'terminal.fontFamily': "'JetBrains Mono', 'Cascadia Mono', 'SF Mono', Consolas, monospace",
  'terminal.defaultShell': null,
  'terminal.cursorBlink': true,
  'diagnostics.enableEslint': true,
  // No default on purpose: no catalogue has been published, and a baked-in
  // address would make the editor request something that does not exist.
  'extensions.registryUrl': '',
  'diagnostics.enableTypeScript': true,
  // Telemetry stays off until the user opts in explicitly. See docs/SECURITY.md.
  'telemetry.enabled': false,
  'update.checkAutomatically': true,
  'shortcut.promptAnswered': false
};

/**
 * JSON-backed settings store persisted in the Electron userData directory.
 *
 * Writes are serialised through a single promise chain so that rapid setting
 * changes cannot interleave and corrupt the file.
 */
export class SettingsStore {
  #settings: Settings = { ...DEFAULT_SETTINGS };
  #filePath: string;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath?: string) {
    this.#filePath = filePath ?? join(app.getPath('userData'), 'settings.json');
  }

  get filePath(): string {
    return this.#filePath;
  }

  async load(): Promise<Settings> {
    try {
      const raw = await readFile(this.#filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<Settings>;
      this.#settings = this.#merge(parsed);
      log.info(`Loaded settings from ${this.#filePath}`);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        log.warn(`Settings file unreadable, falling back to defaults: ${String(error)}`);
      }
      this.#settings = { ...DEFAULT_SETTINGS };
    }
    return this.getAll();
  }

  getAll(): Settings {
    return { ...this.#settings };
  }

  get<K extends SettingKey>(key: K): Settings[K] {
    return this.#settings[key];
  }

  set<K extends SettingKey>(key: K, value: Settings[K]): Settings {
    this.#settings = { ...this.#settings, [key]: value };
    this.#persist();
    return this.getAll();
  }

  reset(): Settings {
    this.#settings = { ...DEFAULT_SETTINGS };
    this.#persist();
    return this.getAll();
  }

  /** Drops unknown keys and keeps defaults for anything missing or mistyped. */
  #merge(partial: Partial<Settings>): Settings {
    const merged = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
      const incoming = partial[key];
      if (incoming === undefined) continue;
      if (typeof incoming === typeof DEFAULT_SETTINGS[key] || DEFAULT_SETTINGS[key] === null) {
        // The runtime check above guarantees the assignment is type safe.
        (merged[key] as Settings[SettingKey]) = incoming as Settings[SettingKey];
      }
    }
    return merged;
  }

  #persist(): void {
    const snapshot = JSON.stringify(this.#settings, null, 2);
    this.#writeQueue = this.#writeQueue
      .then(async () => {
        await mkdir(dirname(this.#filePath), { recursive: true });
        await writeFile(this.#filePath, snapshot, 'utf8');
      })
      .catch((error: unknown) => {
        log.error(`Could not persist settings: ${String(error)}`);
      });
  }
}
