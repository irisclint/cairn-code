# Themes

causeway ships twelve colour themes and can load more at runtime.

## Switching themes

Press `Ctrl+K Ctrl+T`, or click the theme name in the status bar, or open
Settings with `Ctrl+,` and use the Color theme dropdown.

Hovering a card in the picker applies that theme immediately, so you can judge
it against your own code rather than against a preview image. Leaving the grid
or pressing `Escape` restores the theme you had. Clicking a card keeps it and
remembers the choice.

A theme change repaints in a single frame because causeway applies themes as CSS
custom properties rather than re-rendering the interface.

## The themes that ship with causeway

| Theme | Type | Character |
| --- | --- | --- |
| Dark Modern | dark | The signature theme. Neutral greys, blue to violet accent |
| Light Modern | light | The same identity on warm white |
| Midnight Violet | dark | Saturated violet, high chroma syntax |
| Nordic | dark | Cool arctic blues, low contrast for dim rooms |
| Oceanic | dark | Deep sea blues with coral highlights |
| Forest | dark | Green canopy tones with moss and bark accents |
| Crimson | dark | Near black with crimson and gold |
| Solar Dusk | dark | Warm amber and teal on deep brown |
| Solar Dawn | light | The light counterpart, on soft parchment |
| Monochrome | dark | Pure greyscale; syntax carried by weight alone |
| High Contrast Dark | high contrast | Maximum contrast on black, explicit borders |
| High Contrast Light | high contrast | Maximum contrast on white, WCAG AAA body text |

The two high contrast themes exist for accessibility, not for looks. They give
every surface an explicit border rather than relying on a background difference.

## Writing your own

A theme is a JSON file. The format, the full colour key reference and the
workflow for adding one to the repository are documented in
[docs/api/theme-api.md](../api/theme-api.md).

The short version: the built-in themes are generated from a compact palette of
about twenty colours by `scripts/generate-themes.mjs`, which expands them into
the roughly ninety workbench colours a complete theme defines. Adding a palette
there and rerunning the script is the least error prone way to make a new
theme, and it is how a theme contribution is reviewed.

## Porting a theme from another editor

The `colors` and `tokenColors` blocks of a VS Code theme are close enough to
copy directly. Four things usually need attention:

1. causeway requires twelve colour keys that VS Code lets you leave to defaults.
2. Add the sixteen `terminal.ansi*` keys if the source has none. A partial
   ANSI palette is rejected, because mixing theme colours with defaults in
   terminal output looks broken.
3. `type` is `high-contrast-dark` or `high-contrast-light`, where VS Code
   writes `hc` and `hc-light`.
4. Colours must be hex: `#rgb`, `#rrggbb` or `#rrggbbaa`.

If a theme fails to load, causeway tells you exactly which field is wrong, why it
matters and what to change, rather than applying it half way and leaving you
with an unreadable window.
