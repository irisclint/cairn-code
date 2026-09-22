import { create } from 'zustand';
import type { Theme } from '../theme-engine/types';
import { themeLoader } from '../theme-engine/theme-loader';
import { listThemes } from '../theme-engine/theme-registry';
import { applyMonacoTheme, registerThemes } from '../editor/monaco-setup';
import { useSettingsStore } from './settings-store';
import { useNotificationStore } from './notification-store';
import { DEFAULT_THEME_ID } from '@shared/constants';

interface ThemeState {
  currentThemeId: string;
  currentTheme: Theme | null;
  previewThemeId: string | null;
  themes: Theme[];
  /** Applies and persists a theme. */
  setTheme: (themeId: string) => void;
  /** Applies a theme without persisting it, for picker hover previews. */
  previewTheme: (themeId: string | null) => void;
  /** Applies the theme stored in settings; call once on startup. */
  initialize: (themeId: string) => void;
  /** Re-reads the registry after a theme was added at runtime. */
  refreshThemes: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  currentThemeId: DEFAULT_THEME_ID,
  currentTheme: null,
  previewThemeId: null,
  themes: listThemes(),

  initialize: (themeId) => {
    const theme = themeLoader.applyOrFallback(themeId);
    applyMonacoTheme(theme.id);
    set({ currentThemeId: theme.id, currentTheme: theme, themes: listThemes() });
  },

  setTheme: (themeId) => {
    try {
      const theme = themeLoader.apply(themeId);
      applyMonacoTheme(theme.id);
      set({ currentThemeId: theme.id, currentTheme: theme, previewThemeId: null });
      void useSettingsStore.getState().set('workbench.theme', theme.id);
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not apply the selected theme');
    }
  },

  previewTheme: (themeId) => {
    if (themeId === null) {
      themeLoader.cancelPreview();
      applyMonacoTheme(get().currentThemeId);
      set({ previewThemeId: null });
      return;
    }
    themeLoader.preview(themeId);
    applyMonacoTheme(themeId);
    set({ previewThemeId: themeId });
  },

  refreshThemes: () => {
    registerThemes();
    set({ themes: listThemes() });
  }
}));
