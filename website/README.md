# cairn-code website

The marketing and download site for [cairn-code](../README.md).

## Running it

```bash
npm install
npm run dev      # http://localhost:5180
npm run build    # typecheck, then build to dist/
npm run preview  # serve the built output
```

## What is where

```
src/
  pages/       Home, About, Download
  components/  Header, Footer, the editor still, feature grid, comparison, FAQ
  data/        content.ts, every fact the site states about cairn-code
  hooks/       usePlatform, which picks the default download
  styles/      base (tokens and reset), components, preview, pages
```

**`src/data/content.ts` is the single source of truth.** The language count,
the theme count, the version and the download file names all live there, so a
claim on the site cannot quietly drift from the product. When cairn-code gains a
language or a theme, update that file rather than the page that displays it.

## The editor still in the hero

`components/EditorPreview.tsx` is the cairn-code window rebuilt in markup, painted
with the Dark Modern theme's real colours. It is not a screenshot: a screenshot
would be a large image, soft on a high density display, and stale the moment
the interface changed. The markup version stays sharp at any size, costs a few
kilobytes, and keeps the Problems panel legible, which is the part that has to
be readable for the page to make its point.

## Deploying

The build is static. `vercel.json` covers Vercel, `public/_redirects` covers
Netlify, and both do the same thing: serve `index.html` for every path so that
client side routes such as `/download` work when opened directly.

For GitHub Pages, copy `dist/index.html` to `dist/404.html` after building.

The site is live at <https://cairn-theta-wine.vercel.app>.

That deployment was uploaded directly rather than built from this repository,
so it is a snapshot: pushing here does not update it, and it is missing the two
PNG assets, which means the icon falls back to the SVG and a link preview shows
no image. Connecting the repository as below replaces it with a deployment that
tracks `main` and carries every asset.

### Vercel, the first time

The site lives in a subdirectory of a private repository, so two settings
matter and the rest is detected:

1. Install the Vercel GitHub app on the account that owns the repository, and
   grant it access to this repository. Vercel cannot see a private repository
   it was never given access to, and the import will report that the repository
   does not exist.
2. Import the repository and set **Root Directory** to `website`. Without it
   Vercel builds the repository root, which is the Electron application and has
   no web output.

Framework preset (Vite), build command and output directory come from
`vercel.json`, so leave them untouched. Every push to `main` then redeploys.

### Before announcing a release

`src/data/content.ts` exports `RELEASES_PUBLISHED`, which is `false` while no
release has been tagged. It is what makes the download buttons render disabled
rather than linking to assets that would 404. Flip it to `true` in the same
commit that publishes the release, and set `SOURCE_IS_PUBLIC` when the
repository stops being private.
