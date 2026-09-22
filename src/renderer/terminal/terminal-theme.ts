import type { ITheme } from '@xterm/xterm';
import type { Theme } from '../theme-engine/types';

/** Falls back to the editor colour when a terminal-specific key is absent. */
function pick(theme: Theme, key: string, fallbackKey: string, fallback: string): string {
  return theme.colors[key] ?? theme.colors[fallbackKey] ?? fallback;
}

/**
 * Converts a cairn-code theme into the XTerm colour set.
 *
 * XTerm needs plain six-digit hex values for the ANSI palette; values carrying
 * an alpha channel are truncated because a translucent ANSI colour would blend
 * with whatever scrolled past underneath.
 */
export function toTerminalTheme(theme: Theme): ITheme {
  const opaque = (value: string | undefined, fallback: string): string => {
    if (!value) return fallback;
    return value.length === 9 ? value.slice(0, 7) : value;
  };

  return {
    background: pick(theme, 'terminal.background', 'editor.background', '#1e1e1e'),
    foreground: pick(theme, 'terminal.foreground', 'editor.foreground', '#d4d4d4'),
    cursor: pick(theme, 'terminalCursor.foreground', 'editorCursor.foreground', '#ffffff'),
    cursorAccent: pick(theme, 'terminal.background', 'editor.background', '#1e1e1e'),
    selectionBackground: opaque(
      theme.colors['terminal.selectionBackground'] ?? theme.colors['editor.selectionBackground'],
      '#264f78'
    ),

    black: opaque(theme.colors['terminal.ansiBlack'], '#000000'),
    red: opaque(theme.colors['terminal.ansiRed'], '#cd3131'),
    green: opaque(theme.colors['terminal.ansiGreen'], '#0dbc79'),
    yellow: opaque(theme.colors['terminal.ansiYellow'], '#e5e510'),
    blue: opaque(theme.colors['terminal.ansiBlue'], '#2472c8'),
    magenta: opaque(theme.colors['terminal.ansiMagenta'], '#bc3fbc'),
    cyan: opaque(theme.colors['terminal.ansiCyan'], '#11a8cd'),
    white: opaque(theme.colors['terminal.ansiWhite'], '#e5e5e5'),

    brightBlack: opaque(theme.colors['terminal.ansiBrightBlack'], '#666666'),
    brightRed: opaque(theme.colors['terminal.ansiBrightRed'], '#f14c4c'),
    brightGreen: opaque(theme.colors['terminal.ansiBrightGreen'], '#23d18b'),
    brightYellow: opaque(theme.colors['terminal.ansiBrightYellow'], '#f5f543'),
    brightBlue: opaque(theme.colors['terminal.ansiBrightBlue'], '#3b8eea'),
    brightMagenta: opaque(theme.colors['terminal.ansiBrightMagenta'], '#d670d6'),
    brightCyan: opaque(theme.colors['terminal.ansiBrightCyan'], '#29b8db'),
    brightWhite: opaque(theme.colors['terminal.ansiBrightWhite'], '#ffffff')
  };
}
