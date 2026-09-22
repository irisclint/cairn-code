# Architecture overview

cairn-code is an Electron application with three processes and one rule that shapes
everything else: **the renderer never touches Node directly.**

```
┌──────────────────────────────────────────────────────────────────────┐
│                          MAIN PROCESS (Node)                         │
│                                                                      │
│  WindowManager    Menu    ProtocolHandler    UpdateService           │
│                                                                      │
│  FileSystemService   SearchService   PtyService   SettingsStore      │
│  FileWatcherService  GitCliService                                   │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ ipcMain.handle / webContents.send
                                │ every payload is an IpcResult envelope
┌───────────────────────────────┴──────────────────────────────────────┐
│                      PRELOAD (contextBridge)                         │
│                                                                      │
│  window.cairn = { app, window, dialog, fs, workspace, search,        │
│                   terminal, settings, update, menu }                 │
│                                                                      │
│  One function per allowlisted channel. Nothing else is exposed.      │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────┴──────────────────────────────────────┐
│                     RENDERER PROCESS (Chromium)                      │
│                                                                      │
│  React components ── Zustand stores ── Services                      │
│       │                    │               │                         │
│       │                    │               ├── CommandService        │
│       │                    │               ├── KeyboardService       │
│       │                    │               ├── DiagnosticService     │
│       │                    │               └── OutputChannelService  │
│       │                    │                                         │
│       ├── Monaco editor (language workers in web workers)            │
│       ├── XTerm terminal                                             │
│       └── Theme engine (CSS custom properties)                       │
└──────────────────────────────────────────────────────────────────────┘
```

## Why the boundary sits there

Electron's default is to let the renderer `require` anything. cairn-code does not,
because the renderer is the process that runs the largest amount of third party
code: Monaco, XTerm, React, and eventually extensions. Keeping Node out of it
means a bug in any of them cannot read the user's home directory.

The cost is that every filesystem operation is an IPC round trip. In practice
this is not a bottleneck: reads are already asynchronous, and the alternative
would be blocking the UI thread on disk.

## The IPC contract

Handlers in the main process never throw across the boundary. Error classes and
stack traces do not survive serialisation, so every handler returns an envelope:

```ts
type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string; cause?: string; solution?: string } };
```

`guarded()` in `src/shared/errors.ts` wraps a handler body and produces this
automatically. On the renderer side `unwrap()` turns a failed envelope back into
a throwable `ApiError` that still carries the cause and the solution, so callers
use ordinary `try`/`catch` and the notification system can show the user
something actionable.

Channel names live in one place, `src/shared/ipc-channels.ts`, so the preload
allowlist, the main handlers and the renderer client cannot drift apart.

## Main process

| Module | Responsibility |
| --- | --- |
| `index.ts` | Bootstrap, single instance lock, lifecycle |
| `windows.ts` | BrowserWindow creation, window state broadcasts |
| `menu.ts` | Native menu; dispatches command ids, never acts directly |
| `ipc.ts` | Every handler, wrapped in `guarded()` |
| `protocol.ts` | `cairn://` scheme, scoped to the workspace |
| `updater.ts` | electron-updater, lazily imported and never fatal |
| `services/fs-service.ts` | All filesystem access |
| `services/search-service.ts` | File name and content search |
| `services/pty-service.ts` | Terminal processes, with a documented fallback |
| `services/file-watcher.ts` | Recursive watcher with debounced coalescing |
| `services/settings-store.ts` | JSON settings with a serialised write queue |
| `services/shell-detector.ts` | Finds the shells actually installed |
| `services/git-cli.ts` | Thin wrapper over the git command line |

Windows are created hidden and shown on `ready-to-show`. That is what keeps
perceived startup under the two second budget: the user never sees an unpainted
frame.

The main bundle is emitted as CommonJS. Electron cannot resolve named imports
from the built-in `electron` module when the main entry is ESM, so the format
is pinned in `electron.vite.config.ts`. The renderer stays ESM.

## Renderer

### State

Zustand, split by concern so that a change in one area does not re-render
another:

| Store | Holds |
| --- | --- |
| `editor-store` | Open editors, active tab, dirty state, save |
| `workspace-store` | Root folder, directory tree, expansion, selection |
| `terminal-store` | Terminal sessions and tabs |
| `theme-store` | Active theme, preview state |
| `settings-store` | Settings mirrored from the main process |
| `ui-store` | Layout, panel and dialog visibility |
| `notification-store` | Toasts, including every error the user sees |

The layout store is deliberately separate from the editor store: dragging the
panel splitter must not re-render Monaco.

### Commands

Every action has exactly one implementation, registered in
`services/register-commands.ts`. The native menu, the command palette and the
keyboard bindings all dispatch a command id through `CommandService`. Adding a
command to the palette and to the menu is therefore one change, not three, and
they cannot disagree about what a command does.

`KeyboardService` handles chords such as `Ctrl+K Ctrl+T` with a short lived
pending prefix. It ignores bare modifier keydowns, because holding a modifier
auto repeats its keydown and would otherwise cancel the pending chord.

### Editor

One Monaco instance for the whole application. Switching tabs swaps the model
and restores the saved view state. One editor per tab would multiply the cost
of view zones and decorations, which is the largest single contributor to
renderer memory at this scale.

Models are keyed by path and kept alive across tab switches, so undo history,
folding state and diagnostics survive.

Files above 4 MB open with the minimap, folding, occurrence highlighting and
bracket colourisation disabled. Each of those walks the whole model on every
edit.

### Diagnostics

```
Monaco language worker ──┐
ESLint worker (planned) ─┼──> DiagnosticService ──┬──> Monaco markers (squiggles)
LSP client (planned) ────┘         │              └──> Problems panel
                                   │
                          diagnostic-explainer
                        (adds cause and solution)
```

`DiagnosticService` is the single source of truth. It merges per file and per
source, so clearing TypeScript problems does not wipe ESLint ones. It tracks
which sources the last import produced, because a source that reported problems
and now reports none has to be cleared explicitly: an empty marker set produces
no entry to overwrite the old ones with.

Diagnostic URIs are OS paths (`uri.fsPath`), not Monaco URI paths, so that
clicking a problem can reopen the file.

### Theme engine

A theme is a JSON file of workbench colours and TextMate token rules. Applying
one writes a single `<style>` element of CSS custom properties on `:root` and
sets `data-theme` on the document. Nothing in the UI reads a colour from
JavaScript, which is why a theme change repaints in one frame instead of
re-rendering the component tree.

The same theme is converted twice more: into a Monaco theme
(`monaco-theme.ts`) and into an XTerm colour set (`terminal-theme.ts`), so the
editor and the terminal match the workbench.

Themes are validated before they are applied. A broken theme is rejected with
the failing fields named, rather than leaving the user with an unreadable
window.

## Build

`electron-vite` drives three Vite builds. The renderer splits Monaco, XTerm and
React into separate chunks so the initial chunk stays small. Monaco's language
services run in web workers, which keeps tokenization and type checking of a
50,000 line file off the UI thread.

## Testing

| Layer | Tool | What it covers |
| --- | --- | --- |
| Unit | Vitest + Testing Library | Services, stores, utilities, components |
| Integration | Vitest | Flows across modules, against real Monaco |
| End to end | Playwright | The built application, driven as a user |

The end to end suite asserts that `require` and `ipcRenderer` are undefined in
the renderer, so a regression in the security boundary fails the build.
