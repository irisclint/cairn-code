import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useThemeStore } from '@renderer/store/theme-store';
import { useSettingsStore, FALLBACK_SETTINGS } from '@renderer/store/settings-store';
import { listThemes, getTheme } from '@renderer/theme-engine/theme-registry';
import { colorKeyToCssVariable } from '@renderer/theme-engine/theme-loader';
import { REQUIRED_COLOR_KEYS } from '@renderer/theme-engine/types';

/**
 * Integration coverage for the theme pipeline.
 *
 * A theme change has to travel through the loader (CSS custom properties), the
 * Monaco bridge and the settings store in one step. These tests drive the real
 * store rather than the loader in isolation, so a break anywhere along that
 * path is caught.
 */

vi.mock('@renderer/editor/monaco-setup', () => ({
  applyMonacoTheme: vi.fn(),
  registerThemes: vi.fn(),
  setupMonaco: vi.fn()
}));

const persisted: Array<[string, unknown]> = [];

beforeEach(() => {
  persisted.length = 0;
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-theme');

  useSettingsStore.setState({
    settings: { ...FALLBACK_SETTINGS },
    loaded: true,
    load: async () => {},
    reset: async () => {},
    set: async (key, value) => {
      persisted.push([key, value]);
      useSettingsStore.setState((state) => ({ settings: { ...state.settings, [key]: value } }));
    }
  });

  useThemeStore.setState({ currentThemeId: 'dark-modern', currentTheme: null, previewThemeId: null });
});

describe('theme switching', () => {
  it('should apply the stored theme on startup', () => {
    useThemeStore.getState().initialize('nordic');

    expect(useThemeStore.getState().currentThemeId).toBe('nordic');
    expect(document.documentElement.getAttribute('data-theme')).toBe('nordic');
  });

  it('should fall back to the default when the stored theme was uninstalled', () => {
    useThemeStore.getState().initialize('a-theme-that-was-removed');
    expect(useThemeStore.getState().currentThemeId).toBe('dark-modern');
  });

  it('should persist the choice when the user picks a theme', () => {
    useThemeStore.getState().initialize('dark-modern');
    useThemeStore.getState().setTheme('forest');

    expect(useThemeStore.getState().currentThemeId).toBe('forest');
    expect(persisted).toContainEqual(['workbench.theme', 'forest']);
  });

  it('should write every colour of the theme into the document as a custom property', () => {
    useThemeStore.getState().initialize('midnight-violet');

    const css = document.getElementById('causeway-theme')?.textContent ?? '';
    const theme = getTheme('midnight-violet');

    for (const key of REQUIRED_COLOR_KEYS) {
      expect(css, key).toContain(colorKeyToCssVariable(key) + ': ' + theme?.colors[key] + ';');
    }
  });

  it('should leave exactly one theme stylesheet behind after many switches', () => {
    useThemeStore.getState().initialize('dark-modern');
    for (const theme of listThemes()) useThemeStore.getState().setTheme(theme.id);

    expect(document.querySelectorAll('style#causeway-theme')).toHaveLength(1);
  });

  it('should switch cleanly between every installed theme', () => {
    useThemeStore.getState().initialize('dark-modern');

    for (const theme of listThemes()) {
      useThemeStore.getState().setTheme(theme.id);

      expect(useThemeStore.getState().currentThemeId).toBe(theme.id);
      expect(document.documentElement.getAttribute('data-theme')).toBe(theme.id);
      expect(document.documentElement.getAttribute('data-theme-type')).toBe(theme.type);
    }
  });

  it('should not persist a preview', () => {
    useThemeStore.getState().initialize('dark-modern');
    useThemeStore.getState().previewTheme('crimson');

    expect(document.documentElement.getAttribute('data-theme')).toBe('crimson');
    expect(useThemeStore.getState().currentThemeId).toBe('dark-modern');
    expect(persisted).toHaveLength(0);
  });

  it('should restore the active theme when a preview is cancelled', () => {
    useThemeStore.getState().initialize('oceanic');
    useThemeStore.getState().previewTheme('crimson');
    useThemeStore.getState().previewTheme(null);

    expect(document.documentElement.getAttribute('data-theme')).toBe('oceanic');
    expect(useThemeStore.getState().previewThemeId).toBeNull();
  });

  it('should report a failure rather than leaving a half-applied theme', async () => {
    const { useNotificationStore } = await import('@renderer/store/notification-store');
    useNotificationStore.setState({ notifications: [] });

    useThemeStore.getState().initialize('dark-modern');
    useThemeStore.getState().setTheme('a-theme-that-does-not-exist');

    expect(useThemeStore.getState().currentThemeId).toBe('dark-modern');
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0]?.solution).toBeDefined();
  });

  it('should switch in well under the 100 ms budget', () => {
    useThemeStore.getState().initialize('dark-modern');

    const started = performance.now();
    useThemeStore.getState().setTheme('nordic');
    const elapsed = performance.now() - started;

    expect(elapsed).toBeLessThan(100);
  });
});
