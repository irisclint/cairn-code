# Changelog

All notable changes to cairn-code are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned

- A published extension registry, so the marketplace client has a catalogue to
  read rather than a setting pointing at your own
- Code signed builds for Windows and macOS
- Language Server Protocol clients, so the explanation layer reaches past the
  TypeScript family and whatever ESLint covers

## [1.0.0] - 2026-09-25

Everything the alpha promised as its next milestone has shipped, and the four
answers now come from the project's own lint configuration as well as from the
compiler.

### Added

- Source control: status, staging, commits, diffs and branch management, driven
  through the `git` command line so that your own configuration, hooks,
  credential helpers and signing keys apply exactly as they do in a terminal
- Debugging over the Debug Adapter Protocol, with breakpoints in the margin,
  stepping, the call stack and a variables panel. Adapters are resolved from the
  project rather than bundled, and `launch.json` is read from where projects
  already keep it
- A sandboxed extension host. Extension code runs with no Node, no filesystem
  and no network, behind a closed permission list shown before installing, and a
  test suite that tries to escape it and asserts that it cannot
- A marketplace client that verifies what it downloads. No registry has been
  published yet, and the panel says so rather than showing an empty store
- ESLint diagnostics from the workspace's own configuration, resolved from the
  project and run in a worker thread so the interface never waits on a lint pass

### Fixed

- The packaged application started, loaded its renderer and never showed a
  window. A window created hidden has no on screen surface, and the compositor
  does not reliably produce the first frame for one, so `ready-to-show` never
  arrived and it was the only path to showing the window
- The update check reported every failure as a connection problem, including
  the ones that never reached the network. `electron-updater` is CommonJS and
  the main process is bundled as CommonJS, so `autoUpdater` was reached through
  an interop shape the code did not handle and was `undefined`
- Three menu items carried two key sequences as accelerators. Electron has no
  representation for those, so it warned at every launch and registered nothing,
  leaving the items without shortcuts

## [1.0.0-alpha.1] - 2026-09-22

The first alpha. The editor, terminal, themes and diagnostics are usable.

### Added

- Electron application shell with a custom title bar, activity bar, sidebar,
  editor area, bottom panel and status bar
- Monaco editor integration with a single shared instance, per file models and
  preserved view state across tab switches
- 69 recognised languages, resolved by exact file name, extension or `#!` line
- Diagnostics that report cause and solution alongside the compiler message,
  with a catalog covering the common TypeScript codes and ESLint rules, message
  heuristics for everything else, and a Problems panel that shows all four
- Integrated terminal on XTerm with a real pseudo terminal through node-pty,
  shell detection per platform, multiple tabs and a documented fallback to
  piped child processes when the native module is unavailable
- Theme engine with 12 built-in themes across dark, light and high contrast,
  applied as CSS custom properties so a switch repaints in one frame
- Theme picker with live preview on hover, and a validator that rejects a
  broken theme with named fields rather than leaving the window unreadable
- Command palette, quick open and a searchable keyboard shortcut reference,
  all dispatching through one command registry shared with the native menu
- Workspace search across files with regular expression, case, whole word and
  glob filters, running in the main process
- File explorer with lazy directory loading, create, rename and delete, kept in
  sync by a debounced recursive filesystem watcher
- Settings persisted to JSON, with telemetry off by default
- Own visual identity: SVG logo master and a generator that produces every PNG
  size plus Windows ICO and macOS ICNS
- Desktop shortcut creation on all three platforms, from the Command Palette
  or Settings, plus a one-time offer on first run for builds that were
  unpacked rather than installed. Windows gets a .lnk, macOS a desktop alias,
  Linux a freedesktop entry that also registers in the launcher
- Cross platform packaging through electron-builder, and CI that lints,
  typechecks, tests, builds and size checks the installers
- File type icons for every recognised language, shown in the explorer and on
  the editor tabs, with a monogram derived from the language when an extension
  adds one the table does not know
- A download and marketing site in website/, built with Vite and React, whose
  claims are generated from one content module so they cannot drift

### Fixed

- Save As on an untitled buffer wrote an empty file. Untitled models were
  created under a file URI and read back under a parsed one, so the read found
  a different, empty model and the typed content was lost
- A single Ctrl+backquote started two shells, because both the command and the
  terminal panel created the first terminal
- The Problems panel kept showing errors that had already been fixed, because
  an empty marker set produced no entry to overwrite the old ones with
- Holding Ctrl cancelled a pending chord such as Ctrl+K Ctrl+T, since the
  auto-repeating modifier keydown was treated as an unmatched second key
- .tsx and .jsx files opened without syntax highlighting or diagnostics,
  because their cairn-code language ids have no tokenizer in Monaco, which serves
  both from its typescript and javascript grammars
- Clicking a problem could not reopen its file on Windows, because diagnostics
  recorded a URI path with a leading slash before the drive letter
- The end to end suite could not run at all. Playwright launches Electron with
  --inspect, which makes Electron parse the rest of the command line with the
  Node option parser and then reject --remote-debugging-port. The harness now
  starts the binary itself and attaches over the debugging port

### Changed

- Renamed from fcode to cairn-code, including the application id, the URL scheme,
  the preload global, the theme prefix, the icons and the website. A cairn is
  the stack of stones that marks a route when the path is not obvious, which
  is what the editor does with an error
- New mark: three stacked stones in the blue to violet pair, replacing the
  slanted f. It stays legible down to a 16 pixel favicon

### Security

- Context isolation on, node integration off, and a preload bridge that exposes
  one allowlisted method per IPC channel and nothing else
- Content Security Policy that forbids remote code in the renderer
- The `cairn://` protocol resolves only inside the opened workspace
