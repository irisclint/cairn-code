# Security

## Reporting a vulnerability

Please report security issues privately through a
[GitHub security advisory](https://github.com/irisclint/causeway/security/advisories/new)
rather than a public issue.

Include what the issue is, how to reproduce it, and what an attacker could do
with it. You will get an acknowledgement within a few days and an assessment
within two weeks.

## Supported versions

While causeway is in alpha, only the latest release receives fixes.

## How causeway protects you

**The renderer cannot reach Node.** Context isolation is on and node
integration is off. The renderer talks to the system through a preload bridge
that exposes one function per allowlisted IPC channel and nothing else. There
is no `require`, no `process` and no raw `ipcRenderer` in the page; the end to
end tests assert this on every build.

**No remote code.** The renderer runs under a Content Security Policy that
allows scripts only from the application bundle. An extension or a theme cannot
pull code off the network into the editor.

**The custom protocol is scoped.** `causeway://` resolves only inside the opened
workspace and the application directory. A crafted URL cannot read arbitrary
files.

**Filesystem access is centralised.** Every read and write goes through one
service in the main process, so path handling and error reporting have a single
implementation to audit.

**External links leave the app.** Any `http` or `https` link opens in the
user's browser. In-place navigation is blocked, so the renderer cannot be
replaced by a remote page.

**No telemetry by default.** `telemetry.enabled` is false out of the box and
causeway sends nothing until it is switched on. The only other network request is
the update check, which is also disableable.

## What is not covered yet

The sandboxed extension host is not implemented. When it lands, extensions will
run in an isolated process with permissioned filesystem access. Until then,
causeway loads no third party code at all.
