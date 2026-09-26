# Theme API

A causeway theme is a JSON file. This page documents the format, how to add a
theme to the repository, and how a theme reaches the screen.

## How a theme reaches the screen

```
theme JSON ──> validateTheme ──> ThemeLoader ──┬──> CSS custom properties on :root
                     │                         ├──> Monaco theme (editor tokens)
                 rejects a                     └──> XTerm colour set (terminal)
              broken theme with
              the fields named
```

Applying a theme writes one `<style id="causeway-theme">` element containing
custom properties, and sets `data-theme` and `data-theme-type` on the document
element. Nothing in the UI reads a colour from JavaScript, which is why a theme
switch repaints in a single frame.

Each colour key becomes a custom property by lowercasing and inserting dashes:

| Colour key | CSS custom property |
| --- | --- |
| `editor.background` | `--editor-background` |
| `editor.lineHighlightBackground` | `--editor-line-highlight-background` |
| `focusBorder` | `--focus-border` |

## File format

```jsonc
{
  "$schema": "https://causeway.dev/schemas/theme.schema.json",
  "id": "midnight-violet",           // kebab-case, unique, used in CSS selectors
  "name": "Midnight Violet",         // shown in the picker
  "type": "dark",                    // dark | light | high-contrast-dark | high-contrast-light
  "description": "A saturated violet night theme.",
  "author": "Your Name",
  "license": "MIT",
  "semanticHighlighting": true,

  "colors": {
    "editor.background": "#17141f",
    "editor.foreground": "#d6d0e8"
    // ... see the key reference below
  },

  "tokenColors": [
    {
      "scope": ["comment", "punctuation.definition.comment"],
      "settings": { "foreground": "#6b5e8c", "fontStyle": "italic" }
    }
  ],

  "semanticTokenColors": {
    "function": "#60a5fa",
    "type": "#5eead4"
  }
}
```

### Colour values

Only hex is accepted: `#rgb`, `#rrggbb` or `#rrggbbaa`. Named colours,
`rgb()` and `hsl()` are rejected by the validator.

The alpha form is useful for overlays such as `list.hoverBackground`. It is
**not** usable for the ANSI palette: XTerm cannot blend a translucent colour
against scrolled output, so causeway truncates alpha there.

### Required keys

A theme is rejected if any of these is missing or invalid, because causeway has no
safe default for them and leaving one out would make part of the UI invisible:

```
editor.background          editor.foreground
activityBar.background     activityBar.foreground
sideBar.background         sideBar.foreground
statusBar.background       statusBar.foreground
titleBar.activeBackground  titleBar.activeForeground
terminal.background        terminal.foreground
```

### The ANSI palette

Sixteen keys, normal then bright:

```
terminal.ansiBlack    terminal.ansiRed     terminal.ansiGreen    terminal.ansiYellow
terminal.ansiBlue     terminal.ansiMagenta terminal.ansiCyan     terminal.ansiWhite
terminal.ansiBrightBlack   terminal.ansiBrightRed    terminal.ansiBrightGreen
terminal.ansiBrightYellow  terminal.ansiBrightBlue   terminal.ansiBrightMagenta
terminal.ansiBrightCyan    terminal.ansiBrightWhite
```

Define all sixteen or none. A partial palette mixes theme colours with defaults
in terminal output, so the validator reports it.

### Full colour key reference

Grouped by the surface they paint. Any key may be omitted unless it is in the
required list above.

**Editor**
`editor.background`, `editor.foreground`, `editor.lineHighlightBackground`,
`editor.lineHighlightBorder`, `editor.selectionBackground`,
`editor.selectionHighlightBackground`, `editor.inactiveSelectionBackground`,
`editor.wordHighlightBackground`, `editor.wordHighlightStrongBackground`,
`editor.findMatchBackground`, `editor.findMatchHighlightBackground`,
`editor.rangeHighlightBackground`, `editorCursor.foreground`,
`editorLineNumber.foreground`, `editorLineNumber.activeForeground`,
`editorIndentGuide.background`, `editorIndentGuide.activeBackground`,
`editorWhitespace.foreground`, `editorRuler.foreground`,
`editorBracketMatch.background`, `editorBracketMatch.border`

**Diagnostics**
`editorError.foreground`, `editorWarning.foreground`, `editorInfo.foreground`,
`editorHint.foreground`, `editorOverviewRuler.errorForeground`,
`editorOverviewRuler.warningForeground`, `editorOverviewRuler.infoForeground`,
`problemsErrorIcon.foreground`, `problemsWarningIcon.foreground`,
`problemsInfoIcon.foreground`

**Widgets**
`editorWidget.background`, `editorWidget.foreground`, `editorWidget.border`,
`editorSuggestWidget.background`, `editorSuggestWidget.border`,
`editorSuggestWidget.selectedBackground`,
`editorSuggestWidget.highlightForeground`, `editorHoverWidget.background`,
`editorHoverWidget.border`

**Workbench chrome**
`activityBar.*`, `activityBarBadge.*`, `sideBar.*`, `sideBarTitle.foreground`,
`sideBarSectionHeader.*`, `statusBar.*`, `statusBarItem.*`, `titleBar.*`,
`tab.*`, `editorGroupHeader.*`, `panel.*`, `panelTitle.*`, `breadcrumb.*`

**Controls**
`input.*`, `inputOption.activeBorder`, `inputValidation.*`, `dropdown.*`,
`button.*`, `badge.*`, `list.*`, `scrollbarSlider.*`, `notifications.*`

**Git decorations**
`gitDecoration.modifiedResourceForeground`,
`gitDecoration.addedResourceForeground`,
`gitDecoration.deletedResourceForeground`,
`gitDecoration.untrackedResourceForeground`,
`gitDecoration.conflictingResourceForeground`,
`gitDecoration.ignoredResourceForeground`

**Global**
`foreground`, `focusBorder`, `descriptionForeground`, `errorForeground`,
`widget.shadow`, `contrastBorder`, `selection.background`

### Token colours

TextMate scopes mapped onto colours. causeway translates the leading scope segment
onto the token names Monaco emits, so common scopes work out of the box:

```jsonc
{
  "scope": ["keyword", "storage.type", "storage.modifier"],
  "settings": { "foreground": "#c084fc" }
}
```

`settings` accepts `foreground`, `background` and `fontStyle`, where
`fontStyle` is `italic`, `bold`, `underline`, a space separated combination, or
an empty string to clear an inherited style.

Monaco rejects alpha in token rules, so causeway truncates it there too.

## Adding a theme to causeway

The built-in themes are generated, not hand written. A full theme defines about
ninety colours; writing those by hand for twelve themes would guarantee drift,
so each theme declares only its palette and one shared derivation expands it.

1. Add a palette to `PALETTES` in `scripts/generate-themes.mjs`:

```js
{
  id: 'my-theme',
  name: 'My Theme',
  type: 'dark',
  description: 'One sentence shown on the theme card.',
  bg: '#101014',        // editor background
  bgAlt: '#0c0c10',     // sidebar and panel
  bgDeep: '#08080b',    // activity bar and title bar
  bgRaised: '#1a1a20',  // widgets, dropdowns, inactive tabs
  fg: '#d0d0d8',
  fgMuted: '#7a7a88',
  border: '#24242c',
  accent: '#00b4d8',
  accentFg: '#08080b',
  selection: '#1f4a5a',
  lineHl: '#1a1a20',
  error: '#f4606a',
  warning: '#e0af68',
  info: '#00b4d8',
  success: '#10b981',
  syntax: {
    keyword: '#00b4d8', control: '#48cae4', string: '#90be6d',
    number: '#f9c74f', comment: '#5a5a66', function: '#90e0ef',
    type: '#48cae4', variable: '#d0d0d8', parameter: '#f9c74f',
    property: '#90e0ef', constant: '#f9c74f', tag: '#f4606a',
    attribute: '#90be6d', operator: '#48cae4', regexp: '#90be6d'
  },
  ansi: [ /* 16 colours, normal then bright */ ]
}
```

2. Regenerate: `node scripts/generate-themes.mjs`

3. Register it in `src/renderer/theme-engine/theme-registry.ts`:

```ts
import myTheme from './themes/my-theme.json';
// ... add `myTheme as Theme` to BUILT_IN_THEMES
```

4. Run the tests. `tests/unit/theme-engine/theme-engine.test.ts` checks every
   registered theme for required keys, a complete ANSI palette and valid colour
   values, so a mistake fails the suite rather than shipping.

## Loading a theme at runtime

```ts
import { themeLoader } from '@renderer/theme-engine/theme-loader';

const json = JSON.parse(await readThemeFile());
try {
  themeLoader.applyCustomTheme(json); // validates, registers and applies
} catch (error) {
  // ThemeError, with every failing field named in its cause
}
```

`applyCustomTheme` refuses an invalid theme rather than applying it partially.
Each validation issue carries the key, what is wrong, why it matters and what
to change.

## Porting a VS Code theme

The `colors` and `tokenColors` blocks are close enough to copy directly. What
usually needs attention:

- causeway requires the twelve keys listed above; a VS Code theme that relies on
  defaults for any of them needs those filled in.
- Add the sixteen ANSI keys if the source theme has none.
- `type` uses `high-contrast-dark` and `high-contrast-light` where VS Code
  writes `hc` and `hc-light`.
- Colours must be hex.
