# Getting started

This page takes about five minutes and covers everything you need to use causeway
day to day.

## 1. Open a folder

causeway works on a folder, not on loose files. Open one with `Ctrl+K Ctrl+O`, or
the **Open Folder** button in the Explorer when nothing is open yet.

Once a folder is open you get the file tree, workspace search, and terminals
that start in the right directory.

You can also open single files with `Ctrl+O` and edit them without a folder.

## 2. Move around

| What you want | How |
| --- | --- |
| Jump to a file by name | `Ctrl+P`, then type part of the name |
| Run any command | `Ctrl+Shift+P` |
| Go to a line | `Ctrl+G` |
| Jump to a definition | `F12` |
| Look at a definition without leaving | `Alt+F12` |
| Search the whole workspace | `Ctrl+Shift+F` |

`Ctrl+P` and `Ctrl+Shift+P` both use fuzzy matching: `cmdp` finds
"Command Palette", `srcapp` finds `src/App.tsx`. Matched letters are
highlighted so you can see why something ranked where it did.

The command palette is the fastest way to discover causeway. Every command lives
there with its keyboard shortcut next to it.

## 3. Edit

The editor is Monaco, the same engine that powers VS Code's editor, so the
editing shortcuts you already know work:

- `Ctrl+D` selects the next occurrence of the current selection, press again to
  add more
- `Alt+Click` puts a cursor wherever you click
- `Alt+Up` and `Alt+Down` move the current line
- `Ctrl+/` comments and uncomments, using the right token for the language
- `Shift+Alt+F` formats the document
- `F2` renames a symbol everywhere it is used

The status bar shows the detected language on the right. causeway recognises 69
languages by extension, by exact file name for things like `Dockerfile` and
`Makefile`, and by the `#!` line for scripts with no extension at all.

## 4. Read your problems

Press `Ctrl+Shift+M` to open the Problems panel, or click the error and warning
counts at the left of the status bar.

Each row shows the message, the source, and the file and position. Click the
arrow on the left to expand it, and you get three more things:

- **Where** the file, line and column
- **Why** what actually caused it, in plain language
- **Fix** the concrete change to make

This is the part of causeway that differs most from other editors. A message like
"Type 'string' is not assignable to type 'number'" tells you a fact; the Why
and Fix lines tell you what to do about it.

`F8` and `Shift+F8` jump between problems without leaving the keyboard, and
`Ctrl+.` offers a quick fix where one exists.

## 5. Use the terminal

Press ``Ctrl+` ``. The terminal opens in the bottom panel, starting in your
workspace folder, running your normal shell:

- PowerShell 7 if installed, otherwise Windows PowerShell, on Windows
- Your `$SHELL` on macOS and Linux

The plus button opens another terminal, and the dropdown next to it starts one
with a specific shell when you have more than one. Each terminal is a tab, and
tabs keep their scrollback when you switch away.

If causeway ever tells you the terminal is running "without a pseudo terminal", the
native `node-pty` module could not be loaded for your build. Commands and output
still work; full screen programs such as `vim` will not render. The notification
includes the command that fixes it.

## 6. Make it yours

Press `Ctrl+K Ctrl+T` for the theme picker. Hovering a theme applies it
immediately so you can judge it against your own code, and leaving the grid or
pressing `Escape` puts back what you had. Twelve themes ship with causeway: six
dark, two light, two warm and two high contrast.

`Ctrl+,` opens Settings in the sidebar. The ones worth knowing:

| Setting | What it does |
| --- | --- |
| `editor.fontSize` | Editor text size; `Ctrl` plus the wheel also works |
| `editor.fontFamily` | Font stack; the first installed font wins |
| `editor.wordWrap` | Whether long lines wrap |
| `editor.tabSize` / `editor.insertSpaces` | Indentation |
| `workbench.showMinimap` | The overview strip on the right |
| `terminal.fontSize` | Terminal text size |
| `telemetry.enabled` | Off by default, and nothing is sent until it is on |

Settings are stored as JSON in the causeway user data folder:
`%APPDATA%/causeway` on Windows, `~/Library/Application Support/causeway` on macOS,
`~/.config/causeway` on Linux.

## 7. Shape the layout

| Shortcut | Effect |
| --- | --- |
| `Ctrl+B` | Show or hide the sidebar |
| `Ctrl+J` | Show or hide the bottom panel |
| ``Ctrl+` `` | Show or hide the terminal specifically |

Drag the divider between regions to resize, or focus it with `Tab` and use the
arrow keys. Clicking the active activity bar icon collapses the sidebar, which
is the quickest way to get the full width for the editor.

## Where to go next

- [Keyboard shortcuts](keyboard-shortcuts.md), the full table
- [Themes](themes.md), including how to write your own
- [Architecture overview](../architecture/overview.md), if you want to
  contribute
