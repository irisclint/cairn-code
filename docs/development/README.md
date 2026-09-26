# Development guide

Start here before changing anything in this repository.

## What causeway is

A cross platform code editor built on Electron, Monaco and XTerm. It opens a
folder, highlights 69 languages, runs a real terminal, and reports every
problem with a cause and a fix rather than just a compiler message.

MIT licensed, no telemetry by default, Windows / macOS / Linux.

## Commands

```bash
npm run dev            # start with hot reload
npm run build          # typecheck and build all three Electron targets
npm test               # unit and integration tests
npm run test:coverage  # with thresholds enforced
npm run test:e2e       # end to end, needs npm run build first
npm run lint           # ESLint, zero warnings allowed
npm run typecheck      # both the node and the web TypeScript projects
npm run assets:icons   # regenerate every raster icon from the SVG master
```

Themes are regenerated with `node scripts/generate-themes.mjs`.

## Architecture in short

Three processes, one rule: **the renderer never touches Node.**

- **Main** (`src/main`): windows, native menu, filesystem, search, terminals,
  settings, file watching. Built as CommonJS, because Electron cannot resolve
  named imports from the built-in `electron` module in an ESM main bundle.
- **Preload** (`src/preload`): the only bridge. One function per allowlisted
  IPC channel, nothing else.
- **Renderer** (`src/renderer`): React, Monaco, XTerm, theme engine, Zustand
  stores. ESM.
- **Shared** (`src/shared`): types, errors, helpers. The only module both sides
  import.

Full picture, including why the boundaries sit where they do:
[../architecture/overview.md](../architecture/overview.md).

## The rules

Detailed and enforced in review:

- [rules/architecture.md](rules/architecture.md)
- [rules/coding-style.md](rules/coding-style.md)
- [rules/testing.md](rules/testing.md)
- [rules/security.md](rules/security.md)

The two that come up most often:

**Every error tells the user what to do.** Message, cause, solution. Use
`CausewayError` in the main process and `notifyError` in the renderer. An error
with no cause and no fix is a defect.

**Never hard code a colour.** All colours come from CSS custom properties that
the theme engine injects. A hard coded colour is wrong in eleven of the twelve
themes.

## Common tasks

| Task | Guide |
| --- | --- |
| Add a language | [guides/add-a-language.md](guides/add-a-language.md) |
| Add a theme | [guides/add-a-theme.md](guides/add-a-theme.md) |
| Explain a diagnostic | [guides/add-a-diagnostic-explanation.md](guides/add-a-diagnostic-explanation.md) |
| Add an IPC channel | [rules/architecture.md](rules/architecture.md) |

## Where things live

```
src/main/index.ts                        bootstrap and lifecycle
src/main/ipc.ts                          every IPC handler
src/main/services/                       fs, search, pty, watcher, settings, git
src/preload/index.ts                     the bridge
src/renderer/App.tsx                     workbench layout and startup
src/renderer/services/register-commands.ts   every command and keybinding
src/renderer/services/diagnostic-service.ts  every problem currently shown
src/renderer/editor/diagnostic-explainer.ts  cause and solution catalog
src/renderer/editor/language-support.ts      the language table
src/renderer/theme-engine/                   loader, validator, registry, themes
src/renderer/store/                          Zustand stores, one per concern
src/shared/                                  types, errors, ipc channels, utils
scripts/generate-themes.mjs              expands palettes into theme JSON
scripts/generate-icons.mjs               SVG master into PNG, ICO, ICNS
website/                                 the marketing and download site
```

## Gotchas

**Monaco language ids are not always causeway language ids.** `.tsx` is
tokenized by Monaco's `typescript` grammar, `.jsx` by `javascript`, single file
component formats by `html`. Always use `toMonacoLanguageId()` when creating a
model. An id Monaco does not know has no tokenizer, and the file opens
unhighlighted.

**Monaco 0.56 moved the TypeScript API.** It is `monaco.typescript.*`, not
`monaco.languages.typescript.*`, which is now a deprecated stub.

**Monaco worker imports go through the package exports map.** Use
`monaco-editor/editor/editor.worker?worker`, not the `esm/vs/...` path, which
does not resolve.

**Diagnostic URIs are OS paths.** `uri.fsPath`, not `uri.path`. The latter has
a leading slash before the drive letter on Windows, which makes the file
unopenable when a problem is clicked.

**Clearing diagnostics needs an explicit call.** An empty marker set produces
no entry to overwrite the old ones with, so `DiagnosticService` tracks which
sources the last import produced and clears the ones that vanished.

**A bare modifier keydown must not cancel a chord.** Holding Ctrl auto repeats
its keydown between the halves of `Ctrl+K Ctrl+T`.

**Playwright cannot launch Electron directly.** `_electron.launch` passes
`--inspect`, which flips Electron into Node option parsing and makes it reject
`--remote-debugging-port`. The e2e harness in `tests/e2e/launch.ts` spawns the
binary itself and attaches with `chromium.connectOverCDP`.

**`ELECTRON_RUN_AS_NODE` may be set in the shell.** If Electron starts as plain
Node and `require('electron').protocol` is undefined, clear that variable:
`env -u ELECTRON_RUN_AS_NODE`.

## Publishing a release

Two things about the Windows build bite every time, so they are written down
rather than rediscovered.

**electron-builder emits an installer you are not publishing.** Building nsis
for both architectures produces `causeway-<version>-x64-setup.exe`,
`-arm64-setup.exe` and a third, `-setup.exe`, which carries both and is roughly
the size of the two together. The generated `latest.yml` names that third file
in its top level `path`, so uploading the manifest unchanged while publishing
only the per-architecture installers gives the updater a manifest it can read
and a file it cannot fetch. Either publish the combined installer too, or edit
`latest.yml` so `path` and its `sha512` name the x64 installer. The second is
preferred: it makes an update download 114 MB instead of 220 MB.

**Upload `latest.yml`.** Without it the update check fails with "Cannot find
latest.yml in the latest release artifacts", and the release also has to be a
production release rather than a prerelease, or the check fails earlier with
"please ensure a production release exists".

**A failed check is cached.** electron-updater keeps its state in
`%LOCALAPPDATA%\causeway-updater`. After correcting a release, delete that
directory before testing again, or the application will keep reporting the
error it saw the first time even though the release is now correct.

## Status

Version 1.1.0. The editor, terminal, themes, search, command palette,
diagnostics, source control, the debugger and the sandboxed extension host all
work, and every one of them is covered by tests that run on each build.

Two things are not done, and the editor says so where you would look for them
rather than leaving you to find out: no extension registry has been published,
so the marketplace client has nothing to browse, and the builds are not code
signed. Binaries are published for Windows; macOS and Linux have to be built
on macOS and Linux, and can be built from source today.
