# Contributing to causeway

Thanks for wanting to help. This document covers how to set causeway up, what the
code has to look like, and how changes get reviewed.

## Good first contributions

Three kinds of change are self contained and genuinely useful:

- **A diagnostic explanation.** Add an entry to
  `src/renderer/editor/diagnostic-explainer.ts` for a compiler code or lint
  rule that currently falls back to the generic message. Two lines of content
  plus a test.
- **A language.** Add an entry to `src/renderer/editor/language-support.ts`
  with the extensions, comment tokens and icon key. See
  [Adding a language](#adding-a-language).
- **A theme.** Add a palette to `scripts/generate-themes.mjs` and regenerate.
  See [docs/api/theme-api.md](api/theme-api.md).

## Setup

```bash
git clone https://github.com/irisclint/causeway.git
cd causeway
npm install
npm run assets:icons
npm run dev
```

You need Node.js 22.12 or newer. `node-pty` is a native module; if it fails to
build, everything still runs and the terminal falls back to piped child
processes with a notification saying so. To fix it properly:

- **Windows**: install Visual Studio Build Tools with the C++ workload
- **macOS**: `xcode-select --install`
- **Linux**: `sudo apt install build-essential python3`

Then `npx electron-rebuild -f -w node-pty`.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app with hot reload |
| `npm run build` | Typecheck and build all three Electron targets |
| `npm test` | Unit and integration tests |
| `npm run test:watch` | The same, in watch mode |
| `npm run test:coverage` | Tests with the coverage thresholds enforced |
| `npm run test:e2e` | End to end tests against the built app |
| `npm run lint` | ESLint, zero warnings allowed |
| `npm run typecheck` | TypeScript for both the node and the web project |
| `npm run format` | Prettier |
| `npm run assets:icons` | Regenerate every raster icon from the SVG master |

`npm run test:e2e` needs a build first: run `npm run build`. The suite launches
the built app and attaches over the Chromium debugging port; it does not use
Playwright's Electron launcher, which is incompatible with current Electron.

## Architecture in one paragraph

Three processes. **Main** (Node) owns windows, the native menu, the filesystem,
search and terminal processes. **Renderer** (Chromium) owns the entire UI:
React components, Monaco, XTerm, the theme engine and the Zustand stores.
**Preload** is the only bridge between them, exposing one function per
allowlisted IPC channel. The renderer never touches Node directly. Read
[docs/architecture/overview.md](architecture/overview.md) before making a
structural change.

## Code style

The rules are enforced by ESLint and Prettier, so run them before pushing.
What the tooling cannot check:

**Every error tells the user what to do.** This is the rule that makes causeway
different, and it is not negotiable. An error carries a message, a cause and a
solution. Use `CausewayError` and its subclasses in the main process,
`notifyError` in the renderer. A message like "Failed to open file" without a
cause and a fix will be sent back in review.

```ts
// Yes
throw new FileSystemError({
  code: 'FS_EACCES',
  message: `Permission denied: ${path}`,
  cause: 'The operating system refused access because the process lacks the required rights.',
  solution: 'Adjust the file permissions, or reopen the folder from a location you own.'
});

// No
throw new Error('could not open file');
```

**Comments explain why, not what.** `// increment i` is noise. A comment
earns its place when it records a decision, a constraint or a non-obvious
consequence.

**TypeScript is strict.** No `any` without an inline
`// eslint-disable-next-line` and a comment saying why. Every exported function
has explicit parameter and return types. Prefer `unknown` plus narrowing.

**React components are functions.** Props go in an interface, never inline.
Global state lives in a Zustand store, local state in `useState`. Keep a
component under about 200 lines; past that, split it.

**Styles are SCSS with BEM.** All colours come from CSS custom properties that
the theme engine injects. Never hard code a colour: if it cannot be themed, it
is a bug.

**Async is async/await.** No `.then()` chains.

## Tests

Every change needs tests. The thresholds in `vitest.config.ts` are enforced in
CI and are not to be lowered to make a change pass.

- **Unit tests** for services, stores, utilities and components, in
  `tests/unit/`
- **Integration tests** for flows that cross module boundaries, such as a theme
  change travelling from the store through the loader to the document, in
  `tests/integration/`
- **End to end tests** for user flows against the real built app, in
  `tests/e2e/`

Test names describe behaviour, not implementation:

```ts
// Yes
it('should clear the panel once the file compiles again', ...)

// No
it('calls setDiagnostics with empty array', ...)
```

Mock only what you cannot run: the filesystem where a real temp directory would
be slower, the network, Electron APIs. Do not mock the code under test.

## Adding a language

1. Add an entry to `LANGUAGES` in
   `src/renderer/editor/language-support.ts`:

```ts
{ id: 'mylang', label: 'My Language', extensions: ['ml2'], lineComment: '#', icon: 'mylang' }
```

2. If Monaco already ships a grammar that fits, point `monacoId` at it. Monaco
   bundles one grammar for several languages: `.tsx` is tokenized by
   `typescript`, `.jsx` by `javascript`, single file components by `html`. An
   id Monaco does not know has **no tokenizer**, so the file would open with no
   highlighting at all. Check
   `node_modules/monaco-editor/esm/vs/languages/definitions/` for the list.

3. Add a test case to `tests/unit/services/language-support.test.ts`.

4. Add an icon to `resources/icons/file-types/` if you have one.

## Pull requests

- Branch from `main`, one logical change per pull request.
- Write a commit message that says what changed and why. The subject line is
  imperative and under 72 characters.
- Fill in the pull request template, including what you tested by hand.
- CI has to be green: format, lint, typecheck, tests with coverage, build on
  all three platforms, and the end to end suite.

Reviews look at correctness first, then at whether the change fits the
architecture, then at style. Expect questions; they are about the code.

## Releasing

Maintainers only. Tag `vX.Y.Z` on `main`, which triggers
`.github/workflows/release.yml`: it verifies, builds on all three platforms and
publishes a draft release. Update `CHANGELOG.md` in the same commit as the
version bump.
