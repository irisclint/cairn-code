import { app } from 'electron';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Settings, SettingKey } from '@shared/types';
import { DEFAULT_FONT_SIZE, DEFAULT_TAB_SIZE, DEFAULT_THEME_ID } from '@shared/constants';
import { createLogger } from '@shared/logger';

const log = createLogger('settings');

/**
 * What this application used to be called.
 *
 * Electron names the userData directory after the product, so a rename orphans
 * everyone's settings. Kept here rather than in shared constants because it is
 * a migration detail with one reader, and it should be deleted once nobody is
 * plausibly upgrading from that name.
 */
const PREVIOUS_APP_NAME = 'cairn-code';

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
  /**
   * Whether this store owns the real user data location.
   *
   * Recorded here rather than compared later, because working it out
   * afterwards means calling `app.getPath` on a code path that also runs with
   * an injected path, where there is no Electron to ask.
   */
  readonly #usesDefaultLocation: boolean;

  constructor(filePath?: string) {
    this.#usesDefaultLocation = filePath === undefined;
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
        this.#settings = { ...DEFAULT_SETTINGS };
        return this.getAll();
      }

      // No settings here. Before falling back to defaults, look where the
      // previous name kept them.
      const inherited = await this.#readPreviousName();
      if (inherited) {
        this.#settings = this.#merge(inherited);
        this.#persist();
        return this.getAll();
      }

      this.#settings = { ...DEFAULT_SETTINGS };
    }
    return this.getAll();
  }

  /**
   * Settings left behind by the previous name.
   *
   * Electron derives the userData directory from the product name, so renaming
   * the application moved it and left every existing installation looking at an
   * empty folder. Losing someone's theme, font size and shortcuts because the
   * project changed its own mind about what it is called is not an acceptable
   * upgrade, so the old directory is read once and written to the new one.
   *
   * It is deliberately not deleted. If this migration is ever wrong, the
   * original is still there to look at.
   */
  async #readPreviousName(): Promise<Partial<Settings> | null> {
    // Only meaningful for the default location; an injected path is a test or
    // a deliberate override and has no previous name to inherit from.
    if (!this.#usesDefaultLocation) return null;

    const previous = join(dirname(app.getPath('userData')), PREVIOUS_APP_NAME, 'settings.json');

    try {
      const raw = await readFile(previous, 'utf8');
      log.info(`No settings here yet; inherited them from ${previous}`);
      return JSON.parse(raw) as Partial<Settings>;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        log.warn(
          `Found settings under the previous name but could not read them: ${String(error)}. ` +
            'Cause: the file exists but is unreadable or is not valid JSON. ' +
            `Solution: copy the values you want out of ${previous} by hand, or ignore this and ` +
            'set them again; nothing has been deleted.'
        );
      }
      return null;
    }
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
