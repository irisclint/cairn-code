import type * as monaco from 'monaco-editor';
import { commandService, type Command } from './command-service';
import { keyboardService, type Keybinding } from './keyboard-service';
import { useEditorStore } from '../store/editor-store';
import { useWorkspaceStore } from '../store/workspace-store';
import { useDebugStore } from '../store/debug-store';
import { useUiStore } from '../store/ui-store';
import { useTerminalStore } from '../store/terminal-store';
import { useSettingsStore } from '../store/settings-store';
import { useNotificationStore } from '../store/notification-store';

/** The editor instance currently on screen, set by the MonacoEditor component. */
let activeEditor: monaco.editor.IStandaloneCodeEditor | null = null;

export function setActiveEditor(editor: monaco.editor.IStandaloneCodeEditor | null): void {
  activeEditor = editor;
}

export function getActiveEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return activeEditor;
}

/** Runs a built-in Monaco action against the focused editor. */
function runEditorAction(actionId: string): void {
  const editor = activeEditor;
  if (!editor) return;
  editor.focus();
  void editor.getAction(actionId)?.run();
}

const hasEditor = (): boolean => useEditorStore.getState().editors.length > 0;

/**
 * Registers every built-in command and its default keybinding.
 *
 * Keybindings are listed next to their command so that the palette can show
 * them and docs/user-guide/keyboard-shortcuts.md can be generated from one
 * source of truth.
 */
export function registerBuiltInCommands(): () => void {
  const commands: Array<Command & { key?: string }> = [
    /* ------------------------------ File ------------------------------ */
    {
      id: 'file.new',
      title: 'New File',
      category: 'File',
      key: 'ctrl+n',
      run: () => useEditorStore.getState().newUntitled()
    },
    {
      id: 'file.open',
      title: 'Open File...',
      category: 'File',
      key: 'ctrl+o',
      run: () => useEditorStore.getState().openFileDialog()
    },
    {
      id: 'file.openFolder',
      title: 'Open Folder...',
      category: 'File',
      key: 'ctrl+k ctrl+o',
      run: () => useWorkspaceStore.getState().openFolderDialog()
    },
    {
      id: 'file.save',
      title: 'Save',
      category: 'File',
      key: 'ctrl+s',
      enabled: hasEditor,
      run: () => useEditorStore.getState().save()
    },
    {
      id: 'file.saveAs',
      title: 'Save As...',
      category: 'File',
      key: 'ctrl+shift+s',
      enabled: hasEditor,
      run: () => useEditorStore.getState().saveAs()
    },
    {
      id: 'file.saveAll',
      title: 'Save All',
      category: 'File',
      key: 'ctrl+k s',
      enabled: hasEditor,
      run: () => useEditorStore.getState().saveAll()
    },
    {
      id: 'file.closeEditor',
      title: 'Close Editor',
      category: 'File',
      key: 'ctrl+w',
      enabled: hasEditor,
      run: () => {
        const active = useEditorStore.getState().activePath;
        if (active) void useEditorStore.getState().close(active);
      }
    },
    {
      id: 'file.closeFolder',
      title: 'Close Folder',
      category: 'File',
      enabled: () => useWorkspaceStore.getState().rootPath !== null,
      run: () => useWorkspaceStore.getState().closeFolder()
    },

    /* ------------------------------ Edit ------------------------------ */
    {
      id: 'edit.find',
      title: 'Find',
      category: 'Edit',
      key: 'ctrl+f',
      enabled: hasEditor,
      run: () => runEditorAction('actions.find')
    },
    {
      id: 'edit.replace',
      title: 'Replace',
      category: 'Edit',
      key: 'ctrl+h',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.startFindReplaceAction')
    },
    {
      id: 'edit.toggleLineComment',
      title: 'Toggle Line Comment',
      category: 'Edit',
      key: 'ctrl+slash',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.commentLine')
    },
    {
      id: 'edit.toggleBlockComment',
      title: 'Toggle Block Comment',
      category: 'Edit',
      key: 'shift+alt+a',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.blockComment')
    },
    {
      id: 'edit.formatDocument',
      title: 'Format Document',
      category: 'Edit',
      key: 'shift+alt+f',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.formatDocument')
    },
    {
      id: 'edit.duplicateLine',
      title: 'Duplicate Line Down',
      category: 'Edit',
      key: 'shift+alt+down',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.copyLinesDownAction')
    },
    {
      id: 'edit.moveLineUp',
      title: 'Move Line Up',
      category: 'Edit',
      key: 'alt+up',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.moveLinesUpAction')
    },
    {
      id: 'edit.moveLineDown',
      title: 'Move Line Down',
      category: 'Edit',
      key: 'alt+down',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.moveLinesDownAction')
    },
    {
      id: 'edit.deleteLine',
      title: 'Delete Line',
      category: 'Edit',
      key: 'ctrl+shift+k',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.deleteLines')
    },

    /* ---------------------------- Selection --------------------------- */
    {
      id: 'selection.addNextOccurrence',
      title: 'Add Selection To Next Find Match',
      category: 'Selection',
      key: 'ctrl+d',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.addSelectionToNextFindMatch')
    },
    {
      id: 'selection.selectAllOccurrences',
      title: 'Select All Occurrences',
      category: 'Selection',
      key: 'ctrl+shift+l',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.selectHighlights')
    },

    /* ---------------------------- Navigate ---------------------------- */
    {
      id: 'view.quickOpen',
      title: 'Go to File...',
      category: 'Navigate',
      key: 'ctrl+p',
      run: () => useUiStore.getState().openDialog('quick-open')
    },
    {
      id: 'view.commandPalette',
      title: 'Show All Commands',
      category: 'Navigate',
      key: 'ctrl+shift+p',
      run: () => useUiStore.getState().openDialog('command-palette')
    },
    {
      id: 'navigate.goToLine',
      title: 'Go to Line/Column...',
      category: 'Navigate',
      key: 'ctrl+g',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.gotoLine')
    },
    {
      id: 'navigate.goToDefinition',
      title: 'Go to Definition',
      category: 'Navigate',
      key: 'f12',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.revealDefinition')
    },
    {
      id: 'navigate.peekDefinition',
      title: 'Peek Definition',
      category: 'Navigate',
      key: 'alt+f12',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.peekDefinition')
    },
    {
      id: 'navigate.renameSymbol',
      title: 'Rename Symbol',
      category: 'Navigate',
      key: 'f2',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.rename')
    },
    {
      id: 'navigate.nextProblem',
      title: 'Go to Next Problem',
      category: 'Navigate',
      key: 'f8',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.marker.next')
    },
    {
      id: 'navigate.previousProblem',
      title: 'Go to Previous Problem',
      category: 'Navigate',
      key: 'shift+f8',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.marker.prev')
    },
    {
      id: 'navigate.quickFix',
      title: 'Quick Fix...',
      category: 'Navigate',
      key: 'ctrl+period',
      enabled: hasEditor,
      run: () => runEditorAction('editor.action.quickFix')
    },

    /* ------------------------------ View ------------------------------ */
    {
      id: 'view.toggleSidebar',
      title: 'Toggle Sidebar',
      category: 'View',
      key: 'ctrl+b',
      run: () => useUiStore.getState().toggleSidebar()
    },
    {
      id: 'view.togglePanel',
      title: 'Toggle Panel',
      category: 'View',
      key: 'ctrl+j',
      run: () => useUiStore.getState().togglePanel()
    },
    {
      id: 'view.toggleTerminal',
      title: 'Toggle Terminal',
      category: 'View',
      key: 'ctrl+backquote',
      // Only reveals the panel. TerminalPanel starts the first terminal when
      // it mounts with none, so creating one here too would spawn two shells.
      run: () => useUiStore.getState().showPanelView('terminal')
    },
    {
      id: 'view.explorer',
      title: 'Show Explorer',
      category: 'View',
      key: 'ctrl+shift+e',
      run: () => useUiStore.getState().showSidebarView('explorer')
    },
    {
      id: 'view.search',
      title: 'Show Search',
      category: 'View',
      key: 'ctrl+shift+f',
      run: () => useUiStore.getState().showSidebarView('search')
    },
    {
      id: 'view.sourceControl',
      title: 'Show Source Control',
      category: 'View',
      key: 'ctrl+shift+g',
      run: () => useUiStore.getState().showSidebarView('source-control')
    },
    {
      id: 'view.debug',
      title: 'Show Run and Debug',
      category: 'View',
      key: 'ctrl+shift+d',
      run: () => useUiStore.getState().showSidebarView('debug')
    },
    {
      id: 'debug.start',
      title: 'Start Debugging',
      category: 'Debug',
      key: 'f5',
      run: () => {
        useUiStore.getState().showSidebarView('debug');
        return useDebugStore.getState().start();
      }
    },
    {
      id: 'debug.stop',
      title: 'Stop Debugging',
      category: 'Debug',
      key: 'shift+f5',
      run: () => useDebugStore.getState().stop()
    },
    {
      id: 'debug.stepOver',
      title: 'Step Over',
      category: 'Debug',
      key: 'f10',
      run: () => useDebugStore.getState().control('next')
    },
    {
      id: 'debug.stepInto',
      title: 'Step Into',
      category: 'Debug',
      key: 'f11',
      run: () => useDebugStore.getState().control('stepIn')
    },
    {
      id: 'debug.stepOut',
      title: 'Step Out',
      category: 'Debug',
      key: 'shift+f11',
      run: () => useDebugStore.getState().control('stepOut')
    },
    {
      id: 'view.extensions',
      title: 'Show Extensions',
      category: 'View',
      key: 'ctrl+shift+x',
      run: () => useUiStore.getState().showSidebarView('extensions')
    },
    {
      id: 'view.problems',
      title: 'Show Problems',
      category: 'View',
      key: 'ctrl+shift+m',
      run: () => useUiStore.getState().showPanelView('problems')
    },
    {
      id: 'view.output',
      title: 'Show Output',
      category: 'View',
      key: 'ctrl+shift+u',
      run: () => useUiStore.getState().showPanelView('output')
    },
    {
      id: 'view.settings',
      title: 'Open Settings',
      category: 'Preferences',
      key: 'ctrl+comma',
      run: () => useUiStore.getState().showSidebarView('settings')
    },
    {
      id: 'view.themePicker',
      title: 'Color Theme',
      category: 'Preferences',
      key: 'ctrl+k ctrl+t',
      run: () => useUiStore.getState().openDialog('theme-picker')
    },
    {
      id: 'view.zoomIn',
      title: 'Zoom In',
      category: 'View',
      run: () => {
        const size = useSettingsStore.getState().settings['editor.fontSize'];
        void useSettingsStore.getState().set('editor.fontSize', Math.min(size + 1, 40));
      }
    },
    {
      id: 'view.zoomOut',
      title: 'Zoom Out',
      category: 'View',
      run: () => {
        const size = useSettingsStore.getState().settings['editor.fontSize'];
        void useSettingsStore.getState().set('editor.fontSize', Math.max(size - 1, 8));
      }
    },
    {
      id: 'view.zoomReset',
      title: 'Reset Zoom',
      category: 'View',
      run: () => void useSettingsStore.getState().set('editor.fontSize', 14)
    },

    /* ---------------------------- Terminal ---------------------------- */
    {
      id: 'terminal.new',
      title: 'Create New Terminal',
      category: 'Terminal',
      key: 'ctrl+shift+backquote',
      run: () => {
        useUiStore.getState().showPanelView('terminal');
        void useTerminalStore.getState().create();
      }
    },
    {
      id: 'terminal.kill',
      title: 'Kill Active Terminal',
      category: 'Terminal',
      enabled: () => useTerminalStore.getState().activeId !== null,
      run: () => {
        const activeId = useTerminalStore.getState().activeId;
        if (activeId) useTerminalStore.getState().kill(activeId);
      }
    },

    /* --------------------------- Application --------------------------- */
    {
      id: 'app.createDesktopShortcut',
      title: 'Create Desktop Shortcut',
      category: 'Preferences',
      run: async () => {
        const { api, unwrap } = await import('./api');
        const notifications = useNotificationStore.getState();
        try {
          const path = await unwrap(api().shortcut.create());
          notifications.notify({
            severity: 'success',
            message: 'Desktop shortcut created',
            cause: 'It was written to ' + path + '.',
            solution: 'Double click it to open causeway.'
          });
        } catch (error) {
          notifications.notifyError(error, 'Could not create the desktop shortcut');
        }
      }
    },

    /* ------------------------------ Help ------------------------------ */
    {
      id: 'help.keyboardShortcuts',
      title: 'Keyboard Shortcuts Reference',
      category: 'Help',
      key: 'ctrl+k ctrl+s',
      run: () => useUiStore.getState().openDialog('shortcuts')
    },
    {
      id: 'help.about',
      title: 'About causeway',
      category: 'Help',
      run: () => useUiStore.getState().openDialog('about')
    },
    {
      id: 'help.checkForUpdates',
      title: 'Check for Updates',
      category: 'Help',
      run: async () => {
        const { api, unwrap } = await import('./api');
        try {
          const status = await unwrap(api().update.check());
          if (status.state === 'error') {
            useNotificationStore.getState().notify({
              severity: 'info',
              message: 'Update check unavailable',
              cause: status.message,
              solution: 'Download the latest release manually from the causeway releases page.'
            });
          }
        } catch (error) {
          useNotificationStore.getState().notifyError(error, 'Could not check for updates');
        }
      }
    }
  ];

  const dispose = commandService.registerAll(
    commands.map(({ key: _key, ...command }) => ({
      ...command,
      keybinding: commands.find((entry) => entry.id === command.id)?.key
    }))
  );

  const bindings: Keybinding[] = commands
    .filter((command): command is Command & { key: string } => typeof command.key === 'string')
    .map((command) => ({ key: command.key, commandId: command.id }));

  keyboardService.bind(bindings);

  return dispose;
}

/** Lists every command that has a keybinding, for the shortcuts reference. */
export function listKeybindings(): Array<{ key: string; title: string; category: string }> {
  return commandService
    .list()
    .filter((command) => command.keybinding)
    .map((command) => ({
      key: command.keybinding as string,
      title: command.title,
      category: command.category
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));
}
