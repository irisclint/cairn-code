import type * as monaco from 'monaco-editor';
import type { Theme, TokenColor } from './types';

/** Monaco rejects colours with an alpha channel in `rules`, only `colors` accepts them. */
function toOpaqueHex(color: string | undefined): string | undefined {
  if (!color) return undefined;
  return color.length === 9 ? color.slice(0, 7) : color;
}

/**
 * Maps a TextMate scope onto the token type Monaco emits.
 *
 * Monaco's built-in tokenizers produce coarse token names ("keyword", "string",
 * "type.identifier") rather than full TextMate scopes. Translating the leading
 * scope segment covers those, and any remaining scope is passed through so that
 * themes still work with languages registered by extensions.
 */
function scopeToMonacoToken(scope: string): string {
  const mapping: Record<string, string> = {
    comment: 'comment',
    'punctuation.definition.comment': 'comment',
    keyword: 'keyword',
    'keyword.control': 'keyword.control',
    'keyword.operator': 'operator',
    'storage.type': 'keyword',
    'storage.modifier': 'keyword',
    string: 'string',
    'string.quoted': 'string',
    'string.template': 'string',
    'string.regexp': 'regexp',
    'constant.numeric': 'number',
    'constant.language': 'constant',
    'constant.character.escape': 'string.escape',
    variable: 'variable',
    'variable.parameter': 'variable.parameter',
    'variable.other.property': 'variable.name',
    'entity.name.function': 'function',
    'support.function': 'function',
    'entity.name.type': 'type',
    'entity.name.class': 'type',
    'support.type': 'type',
    'support.class': 'type',
    'entity.name.tag': 'tag',
    'entity.other.attribute-name': 'attribute.name',
    'meta.object-literal.key': 'key',
    punctuation: 'delimiter',
    'meta.brace': 'delimiter.bracket',
    invalid: 'invalid',
    'markup.heading': 'keyword',
    'markup.bold': 'strong',
    'markup.italic': 'emphasis',
    'markup.underline.link': 'string.link'
  };
  return mapping[scope] ?? scope;
}

function toRules(tokenColors: TokenColor[]): monaco.editor.ITokenThemeRule[] {
  const rules: monaco.editor.ITokenThemeRule[] = [];

  for (const entry of tokenColors) {
    const scopes = Array.isArray(entry.scope) ? entry.scope : [entry.scope];
    for (const scope of scopes) {
      const foreground = toOpaqueHex(entry.settings.foreground);
      const background = toOpaqueHex(entry.settings.background);
      const rule: monaco.editor.ITokenThemeRule = { token: scopeToMonacoToken(scope) };
      // Monaco expects hex without the leading hash in token rules.
      if (foreground) rule.foreground = foreground.replace('#', '');
      if (background) rule.background = background.replace('#', '');
      if (entry.settings.fontStyle) rule.fontStyle = entry.settings.fontStyle;
      rules.push(rule);
    }
  }

  return rules;
}

/** Workbench colour keys Monaco understands directly. */
const MONACO_COLOR_KEYS = [
  'editor.background',
  'editor.foreground',
  'editor.lineHighlightBackground',
  'editor.lineHighlightBorder',
  'editor.selectionBackground',
  'editor.selectionHighlightBackground',
  'editor.inactiveSelectionBackground',
  'editor.wordHighlightBackground',
  'editor.wordHighlightStrongBackground',
  'editor.findMatchBackground',
  'editor.findMatchHighlightBackground',
  'editor.rangeHighlightBackground',
  'editorCursor.foreground',
  'editorLineNumber.foreground',
  'editorLineNumber.activeForeground',
  'editorIndentGuide.background',
  'editorIndentGuide.activeBackground',
  'editorWhitespace.foreground',
  'editorRuler.foreground',
  'editorBracketMatch.background',
  'editorBracketMatch.border',
  'editorError.foreground',
  'editorWarning.foreground',
  'editorInfo.foreground',
  'editorHint.foreground',
  'editorGutter.addedBackground',
  'editorGutter.modifiedBackground',
  'editorGutter.deletedBackground',
  'editorOverviewRuler.errorForeground',
  'editorOverviewRuler.warningForeground',
  'editorOverviewRuler.infoForeground',
  'editorOverviewRuler.border',
  'editorWidget.background',
  'editorWidget.foreground',
  'editorWidget.border',
  'editorSuggestWidget.background',
  'editorSuggestWidget.border',
  'editorSuggestWidget.foreground',
  'editorSuggestWidget.selectedBackground',
  'editorSuggestWidget.highlightForeground',
  'editorHoverWidget.background',
  'editorHoverWidget.border',
  'scrollbarSlider.background',
  'scrollbarSlider.hoverBackground',
  'scrollbarSlider.activeBackground',
  'minimap.background',
  'minimapSlider.background',
  'focusBorder',
  'foreground',
  'input.background',
  'input.foreground',
  'input.border',
  'list.activeSelectionBackground',
  'list.activeSelectionForeground',
  'list.hoverBackground',
  'widget.shadow'
] as const;

/** Converts a cairn-code theme into the Monaco theme data structure. */
export function toMonacoTheme(theme: Theme): monaco.editor.IStandaloneThemeData {
  const colors: Record<string, string> = {};
  for (const key of MONACO_COLOR_KEYS) {
    const value = theme.colors[key];
    if (value) colors[key] = value;
  }

  const base: monaco.editor.BuiltinTheme =
    theme.type === 'light'
      ? 'vs'
      : theme.type === 'high-contrast-light'
        ? 'hc-light'
        : theme.type === 'high-contrast-dark'
          ? 'hc-black'
          : 'vs-dark';

  return {
    base,
    inherit: true,
    rules: toRules(theme.tokenColors ?? []),
    colors
  };
}

/** The Monaco theme name cairn-code registers for a given theme id. */
export function monacoThemeName(themeId: string): string {
  return `cairn-${themeId}`;
}
