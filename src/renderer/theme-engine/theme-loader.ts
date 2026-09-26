import type { Theme, ThemeColors } from './types';
import { getFallbackTheme, getTheme, registerTheme } from './theme-registry';
import { formatValidationIssues, validateTheme } from './theme-validator';
import { ThemeError } from '@shared/errors';
import { createLogger } from '@shared/logger';

const log = createLogger('theme-loader');

const STYLE_ELEMENT_ID = 'causeway-theme';

/**
 * Translates a workbench colour key into the CSS custom property causeway uses.
 *
 * `editor.lineHighlightBackground` becomes `--editor-line-highlight-background`,
 * so SCSS can reference every theme colour without a lookup table.
 */
export function colorKeyToCssVariable(key: string): string {
  const kebab = key
    .replace(/\./g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
  return `--${kebab}`;
}

/** Builds the `:root` custom property block for a theme. */
export function generateCssVariables(colors: ThemeColors): string {
  return Object.entries(colors)
    .map(([key, value]) => `  ${colorKeyToCssVariable(key)}: ${value};`)
    .join('\n');
}

/**
 * Applies colour themes to the document.
 *
 * Themes are applied by swapping one stylesheet of CSS custom properties, which
 * is why a theme change repaints in a single frame instead of re-rendering the
 * component tree. Nothing in the UI reads theme colours from JavaScript.
 */
export class ThemeLoader {
  #currentTheme: Theme | null = null;
  #styleElement: HTMLStyleElement | null = null;
  #listeners = new Set<(theme: Theme) => void>();

  constructor(private readonly document: Document = globalThis.document) {}

  get current(): Theme | null {
    return this.#currentTheme;
  }

  /** Subscribes to theme changes. Returns an unsubscribe function. */
  onDidChangeTheme(listener: (theme: Theme) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Applies a registered theme by id.
   *
   * Throws ThemeError when the id is unknown so that callers can decide between
   * falling back and surfacing the problem; `applyOrFallback` does the former.
   */
  apply(themeId: string): Theme {
    const theme = getTheme(themeId);
    if (!theme) {
      throw new ThemeError({
        code: 'THEME_NOT_FOUND',
        message: `The theme "${themeId}" is not installed`,
        cause: 'The stored theme id does not match any built-in or registered theme.',
        solution: 'Pick a different theme from the theme picker, or reinstall the extension that provided it.'
      });
    }
    return this.#applyTheme(theme);
  }

  /** Applies a theme, silently falling back to the default when it is unknown. */
  applyOrFallback(themeId: string | null | undefined, preferLight = false): Theme {
    const theme = themeId ? getTheme(themeId) : undefined;
    if (!theme) {
      if (themeId) log.warn(`Theme "${themeId}" is not installed, falling back to the default theme`);
      return this.#applyTheme(getFallbackTheme(preferLight));
    }
    return this.#applyTheme(theme);
  }

  /**
   * Validates, registers and applies a theme provided at runtime, for example
   * from a user-authored JSON file.
   */
  applyCustomTheme(candidate: unknown): Theme {
    const result = validateTheme(candidate);
    if (!result.valid) {
      throw new ThemeError({
        code: 'THEME_INVALID',
        message: 'The theme could not be loaded because it is invalid',
        cause: formatValidationIssues(result.issues),
        solution: 'Fix the listed fields in the theme file and load it again.'
      });
    }
    const theme = candidate as Theme;
    registerTheme(theme);
    return this.#applyTheme(theme);
  }

  /** Previews a theme without persisting it, used for picker hover previews. */
  preview(themeId: string): void {
    const theme = getTheme(themeId);
    if (!theme) return;
    this.#injectStyles(theme);
  }

  /** Restores the active theme after a preview was cancelled. */
  cancelPreview(): void {
    if (this.#currentTheme) this.#injectStyles(this.#currentTheme);
  }

  #applyTheme(theme: Theme): Theme {
    this.#injectStyles(theme);
    this.#currentTheme = theme;
    for (const listener of this.#listeners) listener(theme);
    log.info(`Applied theme ${theme.id}`);
    return theme;
  }

  #injectStyles(theme: Theme): void {
    const root = this.document.documentElement;

    this.#styleElement = this.#createStyleElement();
    this.#styleElement.textContent = `:root {\n${generateCssVariables(theme.colors)}\n}\n`;

    root.setAttribute('data-theme', theme.id);
    root.setAttribute('data-theme-type', theme.type);
    // Tells the platform which scrollbar and form control rendering to use.
    root.style.colorScheme = theme.type.includes('light') ? 'light' : 'dark';
  }

  /**
   * Returns the theme stylesheet, creating or re-attaching it as needed.
   *
   * The cached element can end up detached from the document, for example when
   * something else replaces the head. Writing to a detached node would leave
   * the window unstyled with no error anywhere, so its connection is checked
   * every time rather than only on first use.
   */
  #createStyleElement(): HTMLStyleElement {
    if (this.#styleElement?.isConnected) return this.#styleElement;

    const existing = this.document.getElementById(STYLE_ELEMENT_ID);
    if (existing instanceof HTMLStyleElement) return existing;

    const element = this.#styleElement ?? this.document.createElement('style');
    element.id = STYLE_ELEMENT_ID;
    this.document.head.appendChild(element);
    return element;
  }
}

/** The loader instance used by the application. */
export const themeLoader = new ThemeLoader();
