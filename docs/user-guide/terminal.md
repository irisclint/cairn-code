# Terminal

cairn-code embeds a real terminal, not a command runner. It is XTerm in the
renderer, connected to a pseudo terminal in the main process, so interactive
programs, colours and control sequences all behave as they do in your normal
terminal.

## Opening one

| Shortcut | Action |
| --- | --- |
| ``Ctrl+` `` | Show or hide the terminal panel |
| ``Ctrl+Shift+` `` | Open another terminal |

The first terminal opens automatically when you show the panel. Each one is a
tab; switching tabs keeps the scrollback and leaves the process running.

Terminals start in the open workspace folder, or in your home directory when no
folder is open.

## Which shell you get

cairn-code detects the shells actually installed and uses the first it finds:

**Windows**: PowerShell 7, then Windows PowerShell, then Git Bash, then WSL,
then Command Prompt.

**macOS and Linux**: your login shell from `$SHELL`, then zsh, bash, fish, sh.

The dropdown next to the plus button lists every shell that was found, so you
can start a specific one.

## The "without a pseudo terminal" warning

If cairn-code shows this notification, the native `node-pty` module could not be
loaded for your build of Electron. The terminal falls back to a plain piped
child process:

- Running commands and reading their output works
- Full screen programs such as `vim`, `htop` or `less` will not render
- Programs that check whether they are attached to a terminal may behave
  differently

To fix it, install the build tooling for your platform and rebuild the native
module:

```bash
npx electron-rebuild -f -w node-pty
```

- **Windows**: Visual Studio Build Tools with the C++ workload
- **macOS**: `xcode-select --install`
- **Linux**: `build-essential` and `python3`

The tab title says `(no pty)` while the fallback is in use, so you always know
which mode you are in.

## Closing a terminal

Type `exit`, or use the close button on the tab. cairn-code kills every terminal
process when the window closes, so nothing is left running in the background.
