/** Type contract for cairn-code colour themes. */

export type ThemeType = 'dark' | 'light' | 'high-contrast-dark' | 'high-contrast-light';

export interface TokenColorSettings {
  foreground?: string;
  background?: string;
  fontStyle?: 'italic' | 'bold' | 'underline' | 'italic bold' | '';
}

export interface TokenColor {
  /** TextMate scope or list of scopes this rule applies to. */
  scope: string | string[];
  settings: TokenColorSettings;
}

/**
 * Every workbench colour key cairn-code understands.
 *
 * Keys follow the `area.property` convention. A theme may omit any key; the
 * loader fills gaps from the default theme of the same type, so a minimal
 * community theme with a dozen colours still produces a complete UI.
 */
export interface ThemeColors {
  [key: string]: string;
}

export interface Theme {
  $schema?: string;
  id: string;
  name: string;
  type: ThemeType;
  colors: ThemeColors;
  tokenColors: TokenColor[];
  semanticHighlighting?: boolean;
  semanticTokenColors?: Record<string, string>;
  description?: string;
  author?: string;
  license?: string;
  homepage?: string;
}

/** Colour keys a theme must define; the validator rejects a theme without them. */
export const REQUIRED_COLOR_KEYS: readonly string[] = [
  'editor.background',
  'editor.foreground',
  'activityBar.background',
  'activityBar.foreground',
  'sideBar.background',
  'sideBar.foreground',
  'statusBar.background',
  'statusBar.foreground',
  'titleBar.activeBackground',
  'titleBar.activeForeground',
  'terminal.background',
  'terminal.foreground'
];

/** The sixteen ANSI colours a terminal theme must provide. */
export const ANSI_COLOR_KEYS: readonly string[] = [
  'terminal.ansiBlack',
  'terminal.ansiRed',
  'terminal.ansiGreen',
  'terminal.ansiYellow',
  'terminal.ansiBlue',
  'terminal.ansiMagenta',
  'terminal.ansiCyan',
  'terminal.ansiWhite',
  'terminal.ansiBrightBlack',
  'terminal.ansiBrightRed',
  'terminal.ansiBrightGreen',
  'terminal.ansiBrightYellow',
  'terminal.ansiBrightBlue',
  'terminal.ansiBrightMagenta',
  'terminal.ansiBrightCyan',
  'terminal.ansiBrightWhite'
];

export interface ThemeValidationIssue {
  key: string;
  message: string;
  cause: string;
  solution: string;
}

export interface ThemeValidationResult {
  valid: boolean;
  issues: ThemeValidationIssue[];
}
