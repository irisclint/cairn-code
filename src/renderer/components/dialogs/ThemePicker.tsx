import { useCallback, useEffect, useMemo, useState, type JSX } from 'react';
import { useUiStore } from '../../store/ui-store';
import { useThemeStore } from '../../store/theme-store';
import type { Theme } from '../../theme-engine/types';

const TYPE_LABEL: Record<Theme['type'], string> = {
  dark: 'Dark',
  light: 'Light',
  'high-contrast-dark': 'High Contrast Dark',
  'high-contrast-light': 'High Contrast Light'
};

/** Miniature of the workbench painted in a theme's own colours. */
function ThemeSwatch({ theme }: { theme: Theme }): JSX.Element {
  const color = (key: string, fallback: string): string => theme.colors[key] ?? fallback;

  return (
    <div
      className="theme-swatch"
      style={{
        background: color('editor.background', '#1e1e1e'),
        borderColor: color('sideBar.border', '#333')
      }}
      aria-hidden="true"
    >
      <div
        className="theme-swatch__activity"
        style={{ background: color('activityBar.background', '#333') }}
      />
      <div className="theme-swatch__sidebar" style={{ background: color('sideBar.background', '#252526') }} />
      <div className="theme-swatch__editor">
        <span className="theme-swatch__line" style={{ background: color('editor.foreground', '#d4d4d4') }} />
        <span
          className="theme-swatch__line theme-swatch__line--short"
          style={{ background: theme.tokenColors?.[1]?.settings.foreground ?? '#569cd6' }}
        />
        <span
          className="theme-swatch__line theme-swatch__line--medium"
          style={{ background: theme.tokenColors?.[4]?.settings.foreground ?? '#ce9178' }}
        />
      </div>
      <div
        className="theme-swatch__status"
        style={{ background: color('statusBar.background', '#007acc') }}
      />
    </div>
  );
}

/**
 * Grid of installed themes with live preview.
 *
 * Hovering applies the theme immediately so the choice can be judged against
 * the user's own code; leaving the grid or pressing Escape restores the theme
 * that was active before the dialog opened.
 */
export function ThemePicker(): JSX.Element {
  const closeDialog = useUiStore((state) => state.closeDialog);
  const themes = useThemeStore((state) => state.themes);
  const currentThemeId = useThemeStore((state) => state.currentThemeId);
  const setTheme = useThemeStore((state) => state.setTheme);
  const previewTheme = useThemeStore((state) => state.previewTheme);
  const [query, setQuery] = useState('');

  const cancel = useCallback(() => {
    previewTheme(null);
    closeDialog();
  }, [previewTheme, closeDialog]);

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
      }
    };
    globalThis.addEventListener('keydown', handler);
    return () => globalThis.removeEventListener('keydown', handler);
  }, [cancel]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return themes;
    return themes.filter(
      (theme) =>
        theme.name.toLowerCase().includes(needle) ||
        theme.id.includes(needle) ||
        TYPE_LABEL[theme.type].toLowerCase().includes(needle)
    );
  }, [themes, query]);

  return (
    <div className="dialog-overlay" role="presentation" onMouseDown={cancel}>
      <div
        className="theme-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Select a color theme"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="theme-picker__header">
          <h2 className="theme-picker__title">Color Theme</h2>
          <input
            className="input"
            autoFocus
            placeholder="Search themes"
            aria-label="Search themes"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="theme-picker__grid" onMouseLeave={() => previewTheme(null)}>
          {filtered.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={'theme-card' + (theme.id === currentThemeId ? ' theme-card--active' : '')}
              onMouseEnter={() => previewTheme(theme.id)}
              onFocus={() => previewTheme(theme.id)}
              onClick={() => {
                setTheme(theme.id);
                closeDialog();
              }}
            >
              <ThemeSwatch theme={theme} />
              <span className="theme-card__name">{theme.name}</span>
              <span className="theme-card__type">{TYPE_LABEL[theme.type]}</span>
              {theme.description ? (
                <span className="theme-card__description">{theme.description}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="theme-picker__footer">
          <span>
            {filtered.length} of {themes.length} themes
          </span>
          <button type="button" className="button" onClick={cancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
