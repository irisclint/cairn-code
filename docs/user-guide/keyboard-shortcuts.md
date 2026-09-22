# Keyboard shortcuts

Every shortcut below is also available inside cairn-code under
**Help → Keyboard Shortcuts** (`Ctrl+K Ctrl+S`), where you can search them.
Both this table and that dialog come from the same registry in
`src/renderer/services/register-commands.ts`, so they cannot disagree.

**On macOS, use `Cmd` wherever this table says `Ctrl`.** cairn-code maps the command
key onto the same bindings, so there is one table for every platform.

A shortcut written with a space, such as `Ctrl+K Ctrl+T`, is a chord: press the
first combination, release it, then press the second. The status bar shows that
cairn-code is waiting for the second key.

## File

| Shortcut | Command |
| --- | --- |
| `Ctrl+N` | New File |
| `Ctrl+O` | Open File... |
| `Ctrl+K Ctrl+O` | Open Folder... |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As... |
| `Ctrl+K S` | Save All |
| `Ctrl+W` | Close Editor |
| - | Close Folder |

## Edit

| Shortcut | Command |
| --- | --- |
| `Ctrl+F` | Find |
| `Ctrl+H` | Replace |
| `Ctrl+/` | Toggle Line Comment |
| `Shift+Alt+A` | Toggle Block Comment |
| `Shift+Alt+F` | Format Document |
| `Shift+Alt+Down` | Duplicate Line Down |
| `Alt+Up` | Move Line Up |
| `Alt+Down` | Move Line Down |
| `Ctrl+Shift+K` | Delete Line |

## Selection

| Shortcut | Command |
| --- | --- |
| `Ctrl+D` | Add Selection To Next Find Match |
| `Ctrl+Shift+L` | Select All Occurrences |
| `Alt+Click` | Add a cursor at the click position |

## Navigate

| Shortcut | Command |
| --- | --- |
| `Ctrl+P` | Go to File... |
| `Ctrl+Shift+P` | Show All Commands |
| `Ctrl+G` | Go to Line/Column... |
| `F12` | Go to Definition |
| `Alt+F12` | Peek Definition |
| `F2` | Rename Symbol |
| `F8` | Go to Next Problem |
| `Shift+F8` | Go to Previous Problem |
| `Ctrl+.` | Quick Fix... |

## View

| Shortcut | Command |
| --- | --- |
| `Ctrl+B` | Toggle Sidebar |
| `Ctrl+J` | Toggle Panel |
| ``Ctrl+` `` | Toggle Terminal |
| `Ctrl+Shift+E` | Show Explorer |
| `Ctrl+Shift+F` | Show Search |
| `Ctrl+Shift+G` | Show Source Control |
| `Ctrl+Shift+X` | Show Extensions |
| `Ctrl+Shift+M` | Show Problems |
| `Ctrl+Shift+U` | Show Output |
| - | Zoom In |
| - | Zoom Out |
| - | Reset Zoom |

Zoom is also available with `Ctrl` and the mouse wheel inside the editor.

## Preferences

| Shortcut | Command |
| --- | --- |
| `Ctrl+,` | Open Settings |
| `Ctrl+K Ctrl+T` | Color Theme |

## Terminal

| Shortcut | Command |
| --- | --- |
| ``Ctrl+Shift+` `` | Create New Terminal |
| - | Kill Active Terminal |

While the terminal has focus, keys go to the shell, not to cairn-code. The
workbench shortcuts above still work.

## Help

| Shortcut | Command |
| --- | --- |
| `Ctrl+K Ctrl+S` | Keyboard Shortcuts Reference |
| - | About cairn-code |
| - | Check for Updates |

## Editor shortcuts from Monaco

The editor itself brings a large set of standard bindings that cairn-code does not
override, including:

| Shortcut | Action |
| --- | --- |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Home` / `End` | Start / end of line |
| `Ctrl+Home` / `Ctrl+End` | Start / end of file |
| `Ctrl+Shift+\` | Jump to the matching bracket |
| `Ctrl+]` / `Ctrl+[` | Indent / outdent |
| `Ctrl+Shift+[` / `Ctrl+Shift+]` | Fold / unfold |
| `Ctrl+Space` | Trigger suggestions |
| `Ctrl+Shift+Space` | Trigger parameter hints |
| `Alt+Shift+Up` / `Alt+Shift+Down` | Copy line up / down |

## Changing a shortcut

Custom keybindings are not configurable from the UI yet. The defaults live in
`register-commands.ts`, one `key` field per command, and a build from source
picks up any change there.
