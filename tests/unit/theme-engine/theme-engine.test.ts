import { describe, it, expect, beforeEach } from 'vitest';
import {
  ThemeLoader,
  colorKeyToCssVariable,
  generateCssVariables
} from '@renderer/theme-engine/theme-loader';
import {
  listThemes,
  getTheme,
  getFallbackTheme,
  registerTheme,
  unregisterTheme
} from '@renderer/theme-engine/theme-registry';
import { validateTheme, isValidColor } from '@renderer/theme-engine/theme-validator';
import { toMonacoTheme, monacoThemeName } from '@renderer/theme-engine/monaco-theme';
import { toTerminalTheme } from '@renderer/terminal/terminal-theme';
import { REQUIRED_COLOR_KEYS, ANSI_COLOR_KEYS, type Theme } from '@renderer/theme-engine/types';

describe('theme registry', () => {
  it('should ship at least the ten themes the product promises', () => {
    expect(listThemes().length).toBeGreaterThanOrEqual(10);
  });

  it('should give every theme a unique id', () => {
    const ids = listThemes().map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should include both a light and a high contrast theme', () => {
    const types = new Set(listThemes().map((theme) => theme.type));
    expect(types.has('light')).toBe(true);
    expect(types.has('high-contrast-dark')).toBe(true);
    expect(types.has('high-contrast-light')).toBe(true);
  });

  it('should resolve a theme by id', () => {
    expect(getTheme('dark-modern')?.name).toBe('Dark Modern');
  });

  it('should return undefined for an unknown id', () => {
    expect(getTheme('does-not-exist')).toBeUndefined();
  });

  it('should fall back to a dark or light default', () => {
    expect(getFallbackTheme().type).toBe('dark');
    expect(getFallbackTheme(true).type).toBe('light');
  });

  it('should register and unregister a runtime theme', () => {
    const custom = { ...(getTheme('dark-modern') as Theme), id: 'custom-test', name: 'Custom Test' };
    registerTheme(custom);
    expect(getTheme('custom-test')?.name).toBe('Custom Test');

    expect(unregisterTheme('custom-test')).toBe(true);
    expect(getTheme('custom-test')).toBeUndefined();
  });

  it('should refuse to unregister a built-in theme', () => {
    expect(unregisterTheme('dark-modern')).toBe(false);
    expect(getTheme('dark-modern')).toBeDefined();
  });
});

describe('built-in theme completeness', () => {
  it.each(listThemes().map((theme) => [theme.id, theme] as const))(
    'theme %s should define every required colour',
    (_id, theme) => {
      for (const key of REQUIRED_COLOR_KEYS) {
        expect(theme.colors[key], key + ' is missing').toBeDefined();
        expect(isValidColor(theme.colors[key])).toBe(true);
      }
    }
  );

  it.each(listThemes().map((theme) => [theme.id, theme] as const))(
    'theme %s should define the full ANSI palette',
    (_id, theme) => {
      for (const key of ANSI_COLOR_KEYS) {
        expect(theme.colors[key], key + ' is missing').toBeDefined();
      }
    }
  );

  it.each(listThemes().map((theme) => [theme.id, theme] as const))(
    'theme %s should pass validation',
    (_id, theme) => {
      expect(validateTheme(theme)).toEqual({ valid: true, issues: [] });
    }
  );

  it.each(listThemes().map((theme) => [theme.id, theme] as const))(
    'theme %s should use only valid colour values',
    (_id, theme) => {
      for (const [key, value] of Object.entries(theme.colors)) {
        expect(isValidColor(value), key + ' = ' + value).toBe(true);
      }
    }
  );
});

describe('theme validator', () => {
  const validTheme = (): Theme => JSON.parse(JSON.stringify(getTheme('dark-modern'))) as Theme;

  it('should reject a value that is not an object', () => {
    const result = validateTheme('not a theme');
    expect(result.valid).toBe(false);
    expect(result.issues[0]?.key).toBe('$root');
  });

  it('should reject a theme without an id', () => {
    const theme = validTheme();
    delete (theme as Partial<Theme>).id;
    const result = validateTheme(theme);
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.key === 'id')).toBe(true);
  });

  it('should reject an id that is not kebab-case', () => {
    const theme = { ...validTheme(), id: 'Not Kebab Case' };
    const result = validateTheme(theme);
    expect(result.issues.some((issue) => issue.key === 'id')).toBe(true);
  });

  it('should reject an unknown theme type', () => {
    const theme = { ...validTheme(), type: 'sepia' } as unknown;
    const result = validateTheme(theme);
    expect(result.issues.some((issue) => issue.key === 'type')).toBe(true);
  });

  it('should report a missing required colour', () => {
    const theme = validTheme();
    delete theme.colors['editor.background'];
    const result = validateTheme(theme);

    const issue = result.issues.find((entry) => entry.key === 'editor.background');
    expect(issue).toBeDefined();
    expect(issue?.cause.length).toBeGreaterThan(0);
    expect(issue?.solution.length).toBeGreaterThan(0);
  });

  it('should report an invalid colour value', () => {
    const theme = validTheme();
    theme.colors['editor.background'] = 'rebeccapurple';
    const result = validateTheme(theme);
    expect(result.issues.some((issue) => issue.key === 'editor.background')).toBe(true);
  });

  it('should report a partially defined ANSI palette', () => {
    const theme = validTheme();
    delete theme.colors['terminal.ansiRed'];
    const result = validateTheme(theme);
    expect(result.issues.some((issue) => issue.key === 'terminal.ansi*')).toBe(true);
  });

  it('should give every issue a cause and a solution', () => {
    const result = validateTheme({ id: 'x', colors: {} });
    expect(result.valid).toBe(false);
    for (const issue of result.issues) {
      expect(issue.cause.length).toBeGreaterThan(0);
      expect(issue.solution.length).toBeGreaterThan(0);
    }
  });
});

describe('isValidColor', () => {
  it.each(['#fff', '#ffffff', '#FFFFFF', '#ffffff80'])('should accept %s', (value) => {
    expect(isValidColor(value)).toBe(true);
  });

  it.each(['fff', '#ff', '#gggggg', 'red', 'rgb(0,0,0)', '', null, 42])('should reject %s', (value) => {
    expect(isValidColor(value)).toBe(false);
  });
});

describe('colorKeyToCssVariable', () => {
  it('should convert a dotted key into a kebab-case custom property', () => {
    expect(colorKeyToCssVariable('editor.background')).toBe('--editor-background');
  });

  it('should split camelCase segments', () => {
    expect(colorKeyToCssVariable('editor.lineHighlightBackground')).toBe(
      '--editor-line-highlight-background'
    );
  });

  it('should handle a key with no dot', () => {
    expect(colorKeyToCssVariable('focusBorder')).toBe('--focus-border');
  });
});

describe('generateCssVariables', () => {
  it('should emit one declaration per colour', () => {
    const css = generateCssVariables({ 'editor.background': '#000000', focusBorder: '#ffffff' });
    expect(css).toContain('--editor-background: #000000;');
    expect(css).toContain('--focus-border: #ffffff;');
  });
});

describe('ThemeLoader', () => {
  let loader: ThemeLoader;

  beforeEach(() => {
    document.head.innerHTML = '';
    document.documentElement.removeAttribute('data-theme');
    loader = new ThemeLoader(document);
  });

  it('should inject a stylesheet and mark the document', () => {
    const theme = loader.apply('dark-modern');

    expect(theme.id).toBe('dark-modern');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark-modern');
    expect(document.documentElement.getAttribute('data-theme-type')).toBe('dark');

    const style = document.getElementById('causeway-theme');
    expect(style).toBeInstanceOf(HTMLStyleElement);
    expect(style?.textContent).toContain('--editor-background');
  });

  it('should reuse one style element across theme changes', () => {
    loader.apply('dark-modern');
    loader.apply('nordic');
    expect(document.querySelectorAll('style#causeway-theme')).toHaveLength(1);
    expect(document.documentElement.getAttribute('data-theme')).toBe('nordic');
  });

  it('should set the colour scheme so platform controls match', () => {
    loader.apply('light-modern');
    expect(document.documentElement.style.colorScheme).toBe('light');
    loader.apply('dark-modern');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('should throw an actionable error for an unknown theme', () => {
    expect(() => loader.apply('nope')).toThrowError(/not installed/);
  });

  it('should fall back to the default theme instead of throwing', () => {
    const theme = loader.applyOrFallback('nope');
    expect(theme.id).toBe('dark-modern');
  });

  it('should fall back to the light default when asked', () => {
    expect(loader.applyOrFallback(null, true).id).toBe('light-modern');
  });

  it('should notify listeners on every change', () => {
    const seen: string[] = [];
    const unsubscribe = loader.onDidChangeTheme((theme) => seen.push(theme.id));

    loader.apply('dark-modern');
    loader.apply('nordic');
    unsubscribe();
    loader.apply('forest');

    expect(seen).toEqual(['dark-modern', 'nordic']);
  });

  it('should restore the active theme after a cancelled preview', () => {
    loader.apply('dark-modern');
    loader.preview('nordic');
    expect(document.documentElement.getAttribute('data-theme')).toBe('nordic');

    loader.cancelPreview();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark-modern');
    expect(loader.current?.id).toBe('dark-modern');
  });

  it('should not change the active theme during a preview', () => {
    loader.apply('dark-modern');
    loader.preview('nordic');
    expect(loader.current?.id).toBe('dark-modern');
  });

  it('should reject an invalid custom theme with the failing fields named', () => {
    expect(() => loader.applyCustomTheme({ id: 'broken', colors: {} })).toThrowError(/invalid/i);
  });

  it('should register and apply a valid custom theme', () => {
    const custom = { ...(getTheme('nordic') as Theme), id: 'my-custom', name: 'My Custom' };
    const applied = loader.applyCustomTheme(custom);

    expect(applied.id).toBe('my-custom');
    expect(getTheme('my-custom')).toBeDefined();
    unregisterTheme('my-custom');
  });
});

describe('Monaco theme conversion', () => {
  it('should namespace the Monaco theme name', () => {
    expect(monacoThemeName('dark-modern')).toBe('causeway-dark-modern');
  });

  it('should map the causeway theme type onto a Monaco base', () => {
    expect(toMonacoTheme(getTheme('dark-modern') as Theme).base).toBe('vs-dark');
    expect(toMonacoTheme(getTheme('light-modern') as Theme).base).toBe('vs');
    expect(toMonacoTheme(getTheme('high-contrast-dark') as Theme).base).toBe('hc-black');
    expect(toMonacoTheme(getTheme('high-contrast-light') as Theme).base).toBe('hc-light');
  });

  it('should emit token rules without a leading hash', () => {
    const converted = toMonacoTheme(getTheme('dark-modern') as Theme);
    expect(converted.rules.length).toBeGreaterThan(0);
    for (const rule of converted.rules) {
      if (rule.foreground) expect(rule.foreground.startsWith('#')).toBe(false);
    }
  });

  it('should carry the editor colours through', () => {
    const converted = toMonacoTheme(getTheme('nordic') as Theme);
    expect(converted.colors['editor.background']).toBe(getTheme('nordic')?.colors['editor.background']);
  });
});

describe('terminal theme conversion', () => {
  it('should provide all sixteen ANSI colours', () => {
    const terminalTheme = toTerminalTheme(getTheme('dark-modern') as Theme);
    const keys = [
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite'
    ] as const;

    for (const key of keys) {
      expect(terminalTheme[key], key).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('should strip alpha from the ANSI palette, which XTerm cannot blend', () => {
    const theme = JSON.parse(JSON.stringify(getTheme('dark-modern'))) as Theme;
    theme.colors['terminal.ansiRed'] = '#ff000080';
    expect(toTerminalTheme(theme).red).toBe('#ff0000');
  });

  it('should fall back to the editor colours when terminal keys are absent', () => {
    const theme = JSON.parse(JSON.stringify(getTheme('dark-modern'))) as Theme;
    delete theme.colors['terminal.background'];
    expect(toTerminalTheme(theme).background).toBe(theme.colors['editor.background']);
  });
});
