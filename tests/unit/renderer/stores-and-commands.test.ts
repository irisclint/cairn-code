import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installBridge, removeBridge, state, listeners, calls } from './bridge-mock';

import { useSettingsStore, FALLBACK_SETTINGS, getSetting } from '@renderer/store/settings-store';
import { useTerminalStore } from '@renderer/store/terminal-store';
import { useWorkspaceStore } from '@renderer/store/workspace-store';
import { useUiStore } from '@renderer/store/ui-store';
import { useEditorStore } from '@renderer/store/editor-store';
import { useNotificationStore } from '@renderer/store/notification-store';
import { useThemeStore } from '@renderer/store/theme-store';
import { commandService } from '@renderer/services/command-service';
import {
  registerBuiltInCommands,
  listKeybindings,
  setActiveEditor
} from '@renderer/services/register-commands';
import { keyboardService } from '@renderer/services/keyboard-service';

let disposeCommands: () => void;

beforeEach(() => {
  installBridge();

  useSettingsStore.setState({ settings: { ...FALLBACK_SETTINGS }, loaded: false });
  useTerminalStore.setState({ tabs: [], activeId: null, shells: [] });
  useWorkspaceStore.setState({
    rootPath: null,
    name: null,
    tree: new Map(),
    expanded: new Set(),
    selectedPath: null,
    loading: false
  });
  useUiStore.setState({
    sidebarVisible: true,
    sidebarView: 'explorer',
    sidebarWidth: 280,
    panelVisible: false,
    panelView: 'terminal',
    panelHeight: 280,
    dialog: 'none',
    dialogQuery: '',
    statusMessage: null
  });
  useEditorStore.setState({ editors: [], activePath: null });
  useNotificationStore.setState({ notifications: [] });
  setActiveEditor(null);
});

/* -------------------------------------------------------------------------- */
/* Settings store                                                              */
/* -------------------------------------------------------------------------- */

describe('settings store', () => {
  it('should load settings from the main process', async () => {
    state.settings = { ...FALLBACK_SETTINGS, 'editor.fontSize': 22 };

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().loaded).toBe(true);
    expect(useSettingsStore.getState().settings['editor.fontSize']).toBe(22);
  });

  it('should finish loading even without the bridge, so the UI still renders', async () => {
    removeBridge();
    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().loaded).toBe(true);
    expect(useSettingsStore.getState().settings).toEqual(FALLBACK_SETTINGS);

    installBridge();
  });

  it('should apply a change locally before the write is confirmed', async () => {
    const promise = useSettingsStore.getState().set('editor.fontSize', 18);
    expect(useSettingsStore.getState().settings['editor.fontSize']).toBe(18);
    await promise;
  });

  it('should report a failed write', async () => {
    const bridge = globalThis.window.causeway;
    vi.mocked(bridge.settings.set).mockResolvedValueOnce({
      ok: false,
      error: { code: 'X', message: 'nope', cause: 'c', solution: 's' }
    });

    await useSettingsStore.getState().set('editor.fontSize', 18);
    expect(useNotificationStore.getState().notifications[0]?.severity).toBe('error');
  });

  it('should reset through the main process', async () => {
    state.settings = { ...FALLBACK_SETTINGS };
    await useSettingsStore.getState().reset();
    expect(useSettingsStore.getState().settings).toEqual(FALLBACK_SETTINGS);
  });

  it('should read one setting without a subscription', () => {
    expect(getSetting('editor.tabSize')).toBe(FALLBACK_SETTINGS['editor.tabSize']);
  });

  it('should keep telemetry off in the fallback settings', () => {
    expect(FALLBACK_SETTINGS['telemetry.enabled']).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Terminal store                                                              */
/* -------------------------------------------------------------------------- */

describe('terminal store', () => {
  it('should load the available shells', async () => {
    await useTerminalStore.getState().loadShells();
    expect(useTerminalStore.getState().shells).toHaveLength(2);
  });

  it('should create a terminal and make it active', async () => {
    const id = await useTerminalStore.getState().create();

    expect(id).toBe('term-1');
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
    expect(useTerminalStore.getState().activeId).toBe('term-1');
    expect(useTerminalStore.getState().tabs[0]?.title).toBe('PowerShell 7');
  });

  it('should number additional terminals of the same shell', async () => {
    await useTerminalStore.getState().create();
    await useTerminalStore.getState().create();

    expect(useTerminalStore.getState().tabs[1]?.title).toBe('PowerShell 7 (2)');
  });

  it('should warn when the terminal runs without a pseudo terminal', async () => {
    const bridge = globalThis.window.causeway;
    vi.mocked(bridge.terminal.create).mockResolvedValueOnce({
      ok: true,
      value: { id: 'term-x', pid: 1, shellLabel: 'sh (no pty)', cwd: '/', hasPty: false }
    });

    await useTerminalStore.getState().create();

    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.severity).toBe('warning');
    expect(notification?.solution).toContain('electron-rebuild');
  });

  it('should report a failure to start a terminal', async () => {
    const bridge = globalThis.window.causeway;
    vi.mocked(bridge.terminal.create).mockResolvedValueOnce({
      ok: false,
      error: { code: 'TERM_NO_SHELL', message: 'no shell', cause: 'c', solution: 's' }
    });

    expect(await useTerminalStore.getState().create()).toBeNull();
    expect(useNotificationStore.getState().notifications[0]?.severity).toBe('error');
  });

  it('should kill a terminal and activate the neighbour', async () => {
    await useTerminalStore.getState().create();
    await useTerminalStore.getState().create();
    await useTerminalStore.getState().create();

    useTerminalStore.getState().activate('term-2');
    useTerminalStore.getState().kill('term-2');

    expect(calls.terminalDispose).toContain('term-2');
    expect(useTerminalStore.getState().tabs).toHaveLength(2);
    expect(useTerminalStore.getState().activeId).toBe('term-3');
  });

  it('should kill every terminal', async () => {
    await useTerminalStore.getState().create();
    await useTerminalStore.getState().create();

    useTerminalStore.getState().killAll();

    expect(useTerminalStore.getState().tabs).toHaveLength(0);
    expect(useTerminalStore.getState().activeId).toBeNull();
    expect(calls.terminalDispose).toHaveLength(2);
  });

  it('should record the exit code of a finished process', async () => {
    await useTerminalStore.getState().create();
    useTerminalStore.getState().markExited('term-1', 130);

    expect(useTerminalStore.getState().tabs[0]?.exitCode).toBe(130);
  });

  it('should rename a terminal tab', async () => {
    await useTerminalStore.getState().create();
    useTerminalStore.getState().rename('term-1', 'build');

    expect(useTerminalStore.getState().tabs[0]?.title).toBe('build');
  });

  it('should start only one shell when two callers race for the first terminal', async () => {
    const [first, second] = await Promise.all([
      useTerminalStore.getState().create(),
      useTerminalStore.getState().create()
    ]);

    expect(first).toBe(second);
    expect(useTerminalStore.getState().tabs).toHaveLength(1);
    expect(globalThis.window.causeway.terminal.create).toHaveBeenCalledTimes(1);
  });

  it('should still open a second terminal when one is already running', async () => {
    await useTerminalStore.getState().create();
    await useTerminalStore.getState().create();

    expect(useTerminalStore.getState().tabs).toHaveLength(2);
  });

  it('should ignore an activate for a terminal that is gone', async () => {
    await useTerminalStore.getState().create();
    useTerminalStore.getState().activate('term-999');

    expect(useTerminalStore.getState().activeId).toBe('term-1');
  });
});

/* -------------------------------------------------------------------------- */
/* Workspace store                                                             */
/* -------------------------------------------------------------------------- */

describe('workspace store', () => {
  beforeEach(() => {
    state.directories.set('/ws', [
      { name: 'src', isDirectory: true },
      { name: 'README.md', isDirectory: false }
    ]);
    state.directories.set('/ws/src', [{ name: 'index.ts', isDirectory: false }]);
  });

  it('should open a folder and load its top level', async () => {
    await useWorkspaceStore.getState().openFolder('/ws');

    expect(useWorkspaceStore.getState().rootPath).toBe('/ws');
    expect(useWorkspaceStore.getState().name).toBe('ws');
    expect(useWorkspaceStore.getState().tree.get('/ws')).toHaveLength(2);
    expect(useWorkspaceStore.getState().expanded.has('/ws')).toBe(true);
  });

  it('should open the folder the picker returned', async () => {
    state.dialogFolderResult = '/ws';
    await useWorkspaceStore.getState().openFolderDialog();

    expect(useWorkspaceStore.getState().rootPath).toBe('/ws');
  });

  it('should do nothing when the folder picker is cancelled', async () => {
    state.dialogFolderResult = null;
    await useWorkspaceStore.getState().openFolderDialog();

    expect(useWorkspaceStore.getState().rootPath).toBeNull();
  });

  it('should report a failure to open a folder', async () => {
    const bridge = globalThis.window.causeway;
    vi.mocked(bridge.workspace.open).mockResolvedValueOnce({
      ok: false,
      error: { code: 'FS_ENOENT', message: 'gone', cause: 'c', solution: 's' }
    });

    await useWorkspaceStore.getState().openFolder('/nope');

    expect(useWorkspaceStore.getState().loading).toBe(false);
    expect(useNotificationStore.getState().notifications[0]?.severity).toBe('error');
  });

  it('should close the folder and clear the tree', async () => {
    await useWorkspaceStore.getState().openFolder('/ws');
    await useWorkspaceStore.getState().closeFolder();

    expect(useWorkspaceStore.getState().rootPath).toBeNull();
    expect(useWorkspaceStore.getState().tree.size).toBe(0);
  });

  it('should cache a directory listing and reload it on force', async () => {
    const bridge = globalThis.window.causeway;
    await useWorkspaceStore.getState().loadDirectory('/ws');
    await useWorkspaceStore.getState().loadDirectory('/ws');
    expect(vi.mocked(bridge.fs.readDirectory)).toHaveBeenCalledTimes(1);

    await useWorkspaceStore.getState().loadDirectory('/ws', true);
    expect(vi.mocked(bridge.fs.readDirectory)).toHaveBeenCalledTimes(2);
  });

  it('should load a directory the first time it is expanded', async () => {
    await useWorkspaceStore.getState().toggleExpanded('/ws/src');

    expect(useWorkspaceStore.getState().expanded.has('/ws/src')).toBe(true);
    expect(useWorkspaceStore.getState().tree.get('/ws/src')).toHaveLength(1);
  });

  it('should collapse an expanded directory', async () => {
    await useWorkspaceStore.getState().toggleExpanded('/ws/src');
    await useWorkspaceStore.getState().toggleExpanded('/ws/src');

    expect(useWorkspaceStore.getState().expanded.has('/ws/src')).toBe(false);
  });

  it('should refresh only the directories touched by watcher events', async () => {
    await useWorkspaceStore.getState().openFolder('/ws');
    const bridge = globalThis.window.causeway;
    vi.mocked(bridge.fs.readDirectory).mockClear();

    await useWorkspaceStore.getState().applyFileEvents([
      { kind: 'created', path: '/ws/new.ts' },
      { kind: 'changed', path: '/elsewhere/other.ts' }
    ]);

    expect(vi.mocked(bridge.fs.readDirectory)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(bridge.fs.readDirectory)).toHaveBeenCalledWith('/ws');
  });

  it('should create a file and report its path', async () => {
    await useWorkspaceStore.getState().openFolder('/ws');
    const created = await useWorkspaceStore.getState().createEntry('/ws', 'new.ts', false);

    expect(created).toBe('/ws/new.ts');
    expect(state.files.has('/ws/new.ts')).toBe(true);
  });

  it('should create a directory', async () => {
    await useWorkspaceStore.getState().openFolder('/ws');
    await useWorkspaceStore.getState().createEntry('/ws', 'lib', true);

    expect(state.directories.has('/ws/lib')).toBe(true);
  });

  it('should report a failed create', async () => {
    const bridge = globalThis.window.causeway;
    vi.mocked(bridge.fs.createFile).mockResolvedValueOnce({
      ok: false,
      error: { code: 'FS_EEXIST', message: 'exists', cause: 'c', solution: 's' }
    });

    expect(await useWorkspaceStore.getState().createEntry('/ws', 'dup.ts', false)).toBeNull();
    expect(useNotificationStore.getState().notifications[0]?.severity).toBe('error');
  });

  it('should rename an entry', async () => {
    state.files.set('/ws/old.ts', { content: 'x', modifiedAt: 1 });
    const renamed = await useWorkspaceStore.getState().renameEntry('/ws/old.ts', 'new.ts');

    expect(renamed).toBe('/ws/new.ts');
    expect(state.files.has('/ws/new.ts')).toBe(true);
  });

  it('should delete an entry only after confirmation', async () => {
    state.files.set('/ws/gone.ts', { content: 'x', modifiedAt: 1 });

    state.dialogConfirmResult = false;
    expect(await useWorkspaceStore.getState().deleteEntry('/ws/gone.ts')).toBe(false);
    expect(state.files.has('/ws/gone.ts')).toBe(true);

    state.dialogConfirmResult = true;
    expect(await useWorkspaceStore.getState().deleteEntry('/ws/gone.ts')).toBe(true);
    expect(state.files.has('/ws/gone.ts')).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Commands                                                                    */
/* -------------------------------------------------------------------------- */

describe('built-in commands', () => {
  beforeEach(() => {
    disposeCommands = registerBuiltInCommands();
  });

  it('should register every command the menu can dispatch', () => {
    const ids = commandService.list().map((command) => command.id);

    for (const id of [
      'file.new',
      'file.open',
      'file.openFolder',
      'file.save',
      'view.commandPalette',
      'view.quickOpen',
      'view.themePicker',
      'view.toggleTerminal',
      'terminal.new',
      'help.about'
    ]) {
      expect(ids, id).toContain(id);
    }

    disposeCommands();
  });

  it('should expose a keybinding for the commands that have one', () => {
    expect(commandService.get('view.commandPalette')?.keybinding).toBe('ctrl+shift+p');
    expect(commandService.get('view.themePicker')?.keybinding).toBe('ctrl+k ctrl+t');
    disposeCommands();
  });

  it('should list keybindings sorted for the reference dialog', () => {
    const bindings = listKeybindings();

    expect(bindings.length).toBeGreaterThan(30);
    expect(bindings.every((binding) => binding.key.length > 0)).toBe(true);

    const categories = bindings.map((binding) => binding.category);
    expect([...categories]).toEqual([...categories].sort());

    disposeCommands();
  });

  it('should open a new untitled buffer', async () => {
    await commandService.execute('file.new');
    expect(useEditorStore.getState().editors).toHaveLength(1);
    disposeCommands();
  });

  it('should open dialogs through the ui store', async () => {
    await commandService.execute('view.commandPalette');
    expect(useUiStore.getState().dialog).toBe('command-palette');

    await commandService.execute('view.quickOpen');
    expect(useUiStore.getState().dialog).toBe('quick-open');

    await commandService.execute('view.themePicker');
    expect(useUiStore.getState().dialog).toBe('theme-picker');

    await commandService.execute('help.about');
    expect(useUiStore.getState().dialog).toBe('about');

    await commandService.execute('help.keyboardShortcuts');
    expect(useUiStore.getState().dialog).toBe('shortcuts');

    disposeCommands();
  });

  it('should switch sidebar views', async () => {
    await commandService.execute('view.search');
    expect(useUiStore.getState().sidebarView).toBe('search');

    await commandService.execute('view.sourceControl');
    expect(useUiStore.getState().sidebarView).toBe('source-control');

    await commandService.execute('view.extensions');
    expect(useUiStore.getState().sidebarView).toBe('extensions');

    disposeCommands();
  });

  it('should toggle the sidebar and the panel', async () => {
    await commandService.execute('view.toggleSidebar');
    expect(useUiStore.getState().sidebarVisible).toBe(false);

    await commandService.execute('view.togglePanel');
    expect(useUiStore.getState().panelVisible).toBe(true);

    disposeCommands();
  });

  it('should reveal the terminal panel without starting a shell itself', async () => {
    await commandService.execute('view.toggleTerminal');

    expect(useUiStore.getState().panelView).toBe('terminal');
    expect(useUiStore.getState().panelVisible).toBe(true);
    // TerminalPanel owns creating the first terminal. Creating one here too is
    // what used to spawn two shells for a single keypress.
    expect(useTerminalStore.getState().tabs).toHaveLength(0);

    disposeCommands();
  });

  it('should change the font size through the zoom commands', async () => {
    await commandService.execute('view.zoomIn');
    expect(useSettingsStore.getState().settings['editor.fontSize']).toBe(15);

    await commandService.execute('view.zoomOut');
    await commandService.execute('view.zoomOut');
    expect(useSettingsStore.getState().settings['editor.fontSize']).toBe(13);

    await commandService.execute('view.zoomReset');
    expect(useSettingsStore.getState().settings['editor.fontSize']).toBe(14);

    disposeCommands();
  });

  it('should disable editor commands while nothing is open', () => {
    expect(commandService.get('file.save')?.enabled?.()).toBe(false);
    expect(commandService.get('edit.find')?.enabled?.()).toBe(false);

    useEditorStore.getState().newUntitled();
    expect(commandService.get('file.save')?.enabled?.()).toBe(true);

    disposeCommands();
  });

  it('should disable close folder until one is open', () => {
    expect(commandService.get('file.closeFolder')?.enabled?.()).toBe(false);

    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    expect(commandService.get('file.closeFolder')?.enabled?.()).toBe(true);

    disposeCommands();
  });

  it('should run a Monaco action against the focused editor', async () => {
    const run = vi.fn();
    const fakeEditor = {
      focus: vi.fn(),
      getAction: vi.fn(() => ({ run }))
    } as unknown as Parameters<typeof setActiveEditor>[0];

    setActiveEditor(fakeEditor);
    useEditorStore.getState().newUntitled();

    await commandService.execute('edit.find');

    expect(fakeEditor?.getAction).toHaveBeenCalledWith('actions.find');
    expect(run).toHaveBeenCalled();

    disposeCommands();
  });

  it('should be a no-op when an editor command runs with no editor on screen', async () => {
    setActiveEditor(null);
    useEditorStore.getState().newUntitled();

    await expect(commandService.execute('edit.formatDocument')).resolves.toBe(true);

    disposeCommands();
  });

  it('should kill the active terminal', async () => {
    await useTerminalStore.getState().create();
    await commandService.execute('terminal.kill');

    expect(useTerminalStore.getState().tabs).toHaveLength(0);
    disposeCommands();
  });

  it('should bind every command that declares a key', async () => {
    const bindings = listKeybindings();
    keyboardService.bind(bindings.map((binding) => ({ key: binding.key, commandId: 'view.explorer' })));

    const handled = keyboardService.handleKeyDown({
      key: 'b',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn()
    } as unknown as KeyboardEvent);

    expect(handled).toBe(true);
    disposeCommands();
  });
});

/* -------------------------------------------------------------------------- */
/* Bridge event plumbing                                                       */
/* -------------------------------------------------------------------------- */

describe('bridge subscriptions', () => {
  it('should deliver a workspace change to its listener', () => {
    const received: unknown[] = [];
    const unsubscribe = globalThis.window.causeway.workspace.onChanged((info) => received.push(info));

    for (const listener of listeners.workspaceChanged) listener({ rootPath: '/ws', name: 'ws' });
    expect(received).toHaveLength(1);

    unsubscribe();
    for (const listener of listeners.workspaceChanged) listener({ rootPath: null, name: null });
    expect(received).toHaveLength(1);
  });

  it('should deliver terminal data and exit events', () => {
    const data: unknown[] = [];
    const exits: unknown[] = [];
    globalThis.window.causeway.terminal.onData((event) => data.push(event));
    globalThis.window.causeway.terminal.onExit((event) => exits.push(event));

    for (const listener of listeners.terminalData) listener({ id: 'term-1', data: 'hello' });
    for (const listener of listeners.terminalExit) listener({ id: 'term-1', exitCode: 0 });

    expect(data).toHaveLength(1);
    expect(exits).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Theme store against the real loader                                         */
/* -------------------------------------------------------------------------- */

describe('theme store', () => {
  it('should apply and remember a theme', async () => {
    useThemeStore.getState().initialize('dark-modern');
    useThemeStore.getState().setTheme('forest');

    expect(useThemeStore.getState().currentThemeId).toBe('forest');
    await vi.waitFor(() => expect(state.settings['workbench.theme']).toBe('forest'));
  });

  it('should list every installed theme', () => {
    expect(useThemeStore.getState().themes.length).toBeGreaterThanOrEqual(10);
  });

  it('should refresh the list after a theme is registered at runtime', () => {
    useThemeStore.getState().refreshThemes();
    expect(useThemeStore.getState().themes.length).toBeGreaterThanOrEqual(10);
  });
});
