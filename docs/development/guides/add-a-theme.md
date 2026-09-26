# Adding a theme

Adds a colour theme to causeway.

## Why themes are generated

A complete causeway theme defines about ninety workbench colours. Writing those by
hand for every theme guarantees drift: one theme ends up with a tab border
nobody else has, and a new UI surface is added to eleven themes but not the
twelfth.

Instead, each theme declares a palette of roughly twenty colours, and
`scripts/generate-themes.mjs` expands it through one shared derivation. Fixing
the derivation fixes every theme at once.

## Steps

### 1. Add the palette

In `scripts/generate-themes.mjs`, add an entry to `PALETTES`:

```js
{
  id: 'my-theme',              // kebab-case, unique
  name: 'My Theme',
  type: 'dark',                // dark | light | high-contrast-dark | high-contrast-light
  description: 'One sentence, shown on the theme card.',

  bg: '#101014',               // editor background
  bgAlt: '#0c0c10',            // sidebar and panel
  bgDeep: '#08080b',           // activity bar and title bar
  bgRaised: '#1a1a20',         // widgets, dropdowns, inactive tabs
  fg: '#d0d0d8',               // primary text
  fgMuted: '#7a7a88',          // secondary text
  border: '#24242c',
  accent: '#00b4d8',           // status bar, focus ring, active markers
  accentFg: '#08080b',         // text on the accent colour
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

  ansi: [
    /* 8 normal: black red green yellow blue magenta cyan white */
    /* 8 bright: the same order */
  ]
}
```

### 2. Generate

```bash
node scripts/generate-themes.mjs
```

This writes `src/renderer/theme-engine/themes/my-theme.json`.

### 3. Register

In `src/renderer/theme-engine/theme-registry.ts`:

```ts
import myTheme from './themes/my-theme.json';
// then add `myTheme as Theme` to BUILT_IN_THEMES
```

Place it in the list where it should appear in the picker.

### 4. Verify

```bash
npm test
```

`tests/unit/theme-engine/theme-engine.test.ts` runs over every registered
theme and checks the required keys, the complete ANSI palette and valid colour
values, so a mistake fails the suite rather than shipping.

Then look at it:

```bash
npm run dev
```

`Ctrl+K Ctrl+T`, hover the card to preview, and check all of these:

- Editor text against the editor background
- Selection is visible but does not hide the text under it
- The status bar, active tab and focus ring read as one accent
- Error, warning and info are distinguishable from each other and from normal
  text
- The terminal, which uses the ANSI palette, not the syntax colours
- The Problems panel, where the cause and fix text must stay readable

## Guidance on the palette

**Contrast.** Body text against its background should reach at least 4.5:1 for
a normal theme, and 7:1 for a high contrast one. Comments may go lower but stay
readable, around 3:1.

**Accent.** One accent, used consistently for the status bar, the focus ring
and the active tab marker. Two competing accents make the UI feel noisy.

**Syntax.** Keywords, strings, numbers and comments must be distinguishable
from each other, and none of them should compete with the error colour.
Reserve the most saturated colour in the palette for errors.

**Backgrounds.** Keep `bg`, `bgAlt`, `bgDeep` and `bgRaised` close together.
Large contrast between panels makes the window look assembled from parts.

**Test on real code**, not on a swatch grid. A palette that looks striking in
isolation often turns out to be exhausting over a file of TypeScript.
