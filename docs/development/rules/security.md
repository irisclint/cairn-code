# Security rules

The user's code and their machine are what cairn-code is trusted with. These rules
are not negotiable in review.

## The renderer is untrusted

It runs the largest amount of third party code in the application: Monaco,
XTerm, React, and eventually extensions. Treat it as hostile.

- `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`
- No `require`, no `process`, no raw `ipcRenderer` in the page. The end to end
  suite asserts this on every build.
- The preload bridge exposes one function per allowlisted channel. It never
  forwards an arbitrary channel name supplied by the renderer.

## No remote code

The Content Security Policy in `src/renderer/index.html` allows scripts only
from the application bundle. Do not add a CDN, a web font link or an analytics
snippet. If a feature seems to need remote code, it needs a different design.

## Validate at the boundary

Anything crossing from the renderer into the main process is user input, even
when the renderer is the only caller today.

- Paths are resolved and checked before use.
- The `cairn://` protocol serves only what is inside the opened workspace or
  the application directory. A path outside that is a 403, and it is logged.
- Themes and other loaded JSON are validated before anything is applied.

## Shell commands

The terminal runs whatever the user types; that is its job. What cairn-code itself
runs is different:

- Use `execFile` with an argument array, never `exec` with an interpolated
  string.
- Never interpolate a path or a branch name into a shell command.
- `git-cli.ts` shells out with argument arrays for exactly this reason.

## Privacy

`telemetry.enabled` is false by default and nothing is sent until the user
turns it on. Do not add a call that reports usage, crash data or version
information without a setting the user controls and a line in the docs saying
what it sends.

The update check is the only other network request, and it is disableable.

## Dependencies

Every dependency is code that ships to users. Before adding one, ask whether
the twenty lines it replaces are worth its transitive tree. Prefer a small well
maintained package over a large convenient one, and check the licence is
compatible with MIT.

## Reporting

Security issues are reported privately through a GitHub security advisory. See
[SECURITY.md](../../SECURITY.md).
