import { create } from 'zustand';
import type { Settings, SettingKey } from '@shared/types';
import { DEFAULT_FONT_SIZE, DEFAULT_TAB_SIZE, DEFAULT_THEME_ID } from '@shared/constants';
import { api, hasBridge, unwrap } from '../services/api';
import { useNotificationStore } from './notification-store';

/** Mirrors the main process defaults so the UI can render before IPC resolves. */
export const FALLBACK_SETTINGS: Settings = {
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
  'diagnostics.enableTypeScript': true,
  'telemetry.enabled': false,
  'update.checkAutomatically': true,
  'shortcut.promptAnswered': false
};

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  set: <K extends SettingKey>(key: K, value: Settings[K]) => Promise<void>;
  reset: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: FALLBACK_SETTINGS,
  loaded: false,

  load: async () => {
    if (!hasBridge()) {
      set({ loaded: true });
      return;
    }
    try {
      const settings = await unwrap(api().settings.getAll());
      set({ settings, loaded: true });
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not load settings');
      set({ loaded: true });
    }
  },

  set: async (key, value) => {
    // Applied locally first so the UI reacts immediately; the write is
    // confirmed by the main process afterwards.
    set({ settings: { ...get().settings, [key]: value } });
    try {
      const settings = await unwrap(api().settings.set(key, value));
      set({ settings });
    } catch (error) {
      useNotificationStore.getState().notifyError(error, `Could not save the setting ${key}`);
    }
  },

  reset: async () => {
    try {
      const settings = await unwrap(api().settings.reset());
      set({ settings });
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not reset settings');
    }
  }
}));

/** Reads one setting without subscribing the caller to the whole object. */
export function getSetting<K extends SettingKey>(key: K): Settings[K] {
  return useSettingsStore.getState().settings[key];
}
