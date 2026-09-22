import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as monaco from 'monaco-editor';
import { installBridge, state, listeners } from './bridge-mock';

import { TitleBar } from '@renderer/components/layout/TitleBar';
import { StatusBar } from '@renderer/components/layout/StatusBar';
import { EditorArea } from '@renderer/components/layout/EditorArea';
import { Panel } from '@renderer/components/layout/Panel';
import { EditorTabs } from '@renderer/components/editor/EditorTabs';
import { Breadcrumbs } from '@renderer/components/editor/Breadcrumbs';
import { WelcomeView } from '@renderer/components/editor/WelcomeView';
import { ProblemsPanel } from '@renderer/components/panels/ProblemsPanel';
import { OutputPanel } from '@renderer/components/panels/OutputPanel';
import { CommandPalette } from '@renderer/components/dialogs/CommandPalette';
import { QuickOpen } from '@renderer/components/dialogs/QuickOpen';
import { ThemePicker } from '@renderer/components/dialogs/ThemePicker';
import { AboutDialog } from '@renderer/components/dialogs/AboutDialog';
import { ShortcutsDialog } from '@renderer/components/dialogs/ShortcutsDialog';

import { useEditorStore } from '@renderer/store/editor-store';
import { useWorkspaceStore } from '@renderer/store/workspace-store';
import { useUiStore } from '@renderer/store/ui-store';
import { useThemeStore } from '@renderer/store/theme-store';
import { useSettingsStore, FALLBACK_SETTINGS } from '@renderer/store/settings-store';
import { useTerminalStore } from '@renderer/store/terminal-store';
import { diagnosticService } from '@renderer/services/diagnostic-service';
import { outputChannel } from '@renderer/services/output-channel';
import { registerBuiltInCommands, setActiveEditor } from '@renderer/services/register-commands';
import type { Diagnostic } from '@shared/types';

let disposeCommands: () => void;

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    code: 'TS2322',
    source: 'TypeScript',
    severity: 0,
    message: "Type 'string' is not assignable to type 'number'.",
    cause: 'A value of type string was assigned where number is required.',
    solution: 'Convert the value to number, or widen the target type.',
    uri: '/ws/src/app.ts',
    range: { startLineNumber: 12, startColumn: 7, endLineNumber: 12, endColumn: 20 },
    ...overrides
  };
}

beforeEach(() => {
  installBridge();
  disposeCommands?.();
  disposeCommands = registerBuiltInCommands();

  useEditorStore.setState({ editors: [], activePath: null });
  useWorkspaceStore.setState({ rootPath: null, name: null, tree: new Map(), expanded: new Set() });
  useUiStore.setState({
    sidebarVisible: true,
    sidebarView: 'explorer',
    panelVisible: false,
    panelView: 'terminal',
    dialog: 'none',
    dialogQuery: '',
    statusMessage: null
  });
  useSettingsStore.setState({ settings: { ...FALLBACK_SETTINGS }, loaded: true });
  useTerminalStore.setState({ tabs: [], activeId: null, shells: [] });
  useThemeStore.getState().initialize('dark-modern');
  diagnosticService.clearAll();
  outputChannel.clear();
  setActiveEditor(null);
});

afterEach(() => {
  for (const model of monaco.editor.getModels()) model.dispose();
});

/* -------------------------------------------------------------------------- */
/* Title bar                                                                   */
/* -------------------------------------------------------------------------- */

describe('TitleBar', () => {
  it('should show the application name when nothing is open', async () => {
    const { container } = render(<TitleBar />);
    await waitFor(() => expect(container.querySelector('.title-bar__title')).toHaveTextContent('cairn-code'));
  });

  it('should include the file, the workspace and the app in the title', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'my-project' });
    state.files.set('/ws/app.ts', { content: 'x', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/ws/app.ts');

    render(<TitleBar />);
    await waitFor(() => expect(screen.getByText('app.ts - my-project - cairn-code')).toBeInTheDocument());
  });

  it('should mark an unsaved file with an asterisk', async () => {
    state.files.set('/ws/app.ts', { content: 'x', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/ws/app.ts');
    act(() => useEditorStore.getState().markDirty('/ws/app.ts', true));

    render(<TitleBar />);
    await waitFor(() => expect(screen.getByText(/app\.ts \*/)).toBeInTheDocument());
  });

  it('should drive the window controls through the bridge', async () => {
    render(<TitleBar />);

    await userEvent.click(screen.getByLabelText('Minimize window'));
    await userEvent.click(screen.getByLabelText('Maximize window'));
    await userEvent.click(screen.getByLabelText('Close window'));

    expect(globalThis.window.cairn.window.minimize).toHaveBeenCalled();
    expect(globalThis.window.cairn.window.toggleMaximize).toHaveBeenCalled();
    expect(globalThis.window.cairn.window.close).toHaveBeenCalled();
  });

  it('should follow the window state reported by the main process', async () => {
    render(<TitleBar />);
    await waitFor(() => expect(listeners.windowState.length).toBeGreaterThan(0));

    act(() => {
      for (const listener of listeners.windowState) {
        listener({ isMaximized: true, isFullScreen: false, isFocused: true });
      }
    });

    expect(screen.getByLabelText('Restore window')).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Status bar                                                                  */
/* -------------------------------------------------------------------------- */

describe('StatusBar', () => {
  it('should say when no folder is open', () => {
    render(<StatusBar />);
    expect(screen.getByText('No Folder Opened')).toBeInTheDocument();
  });

  it('should show the workspace name once a folder is open', () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'my-project' });
    render(<StatusBar />);

    expect(screen.getByText('my-project')).toBeInTheDocument();
  });

  it('should show the error and warning counts', () => {
    diagnosticService.setDiagnostics('/ws/a.ts', 'TypeScript', [
      makeDiagnostic({ severity: 0 }),
      makeDiagnostic({ severity: 1 }),
      makeDiagnostic({ severity: 1 })
    ]);

    render(<StatusBar />);
    const problems = screen.getByTitle('Show Problems');

    expect(problems).toHaveTextContent('1');
    expect(problems).toHaveTextContent('2');
  });

  it('should open the Problems panel when the counts are clicked', async () => {
    render(<StatusBar />);

    await userEvent.click(screen.getByTitle('Show Problems'));
    expect(useUiStore.getState().panelView).toBe('problems');
  });

  it('should show the detected language of the active file', async () => {
    state.files.set('/ws/app.py', { content: 'print(1)', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/ws/app.py');

    render(<StatusBar />);
    expect(screen.getByText('Python')).toBeInTheDocument();
  });

  it('should show the indentation setting', async () => {
    state.files.set('/ws/a.ts', { content: 'x', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/ws/a.ts');

    render(<StatusBar />);
    expect(screen.getByText('Spaces: 4')).toBeInTheDocument();
  });

  it('should show the active theme and open the picker', async () => {
    render(<StatusBar />);

    expect(screen.getByText('Dark Modern')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('Select Color Theme'));
    expect(useUiStore.getState().dialog).toBe('theme-picker');
  });

  it('should show a transient status message', () => {
    useUiStore.setState({ statusMessage: 'CTRL+K was pressed' });
    render(<StatusBar />);

    expect(screen.getByText('CTRL+K was pressed')).toBeInTheDocument();
  });

  it('should toggle the terminal from the status bar', async () => {
    render(<StatusBar />);

    await userEvent.click(screen.getByTitle('Toggle Terminal'));
    expect(useUiStore.getState().panelView).toBe('terminal');
  });
});

/* -------------------------------------------------------------------------- */
/* Editor area                                                                 */
/* -------------------------------------------------------------------------- */

describe('EditorTabs', () => {
  beforeEach(async () => {
    for (const name of ['a.ts', 'b.ts']) {
      state.files.set('/ws/' + name, { content: name, modifiedAt: 1 });
      await useEditorStore.getState().openFile('/ws/' + name);
    }
  });

  it('should render nothing when no editor is open', () => {
    useEditorStore.setState({ editors: [], activePath: null });
    const { container } = render(<EditorTabs />);

    expect(container.firstChild).toBeNull();
  });

  it('should render one tab per open editor', () => {
    render(<EditorTabs />);

    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByText('a.ts')).toBeInTheDocument();
  });

  it('should mark the active tab as selected', () => {
    render(<EditorTabs />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('should activate a tab on click', async () => {
    render(<EditorTabs />);

    await userEvent.click(screen.getByText('a.ts'));
    expect(useEditorStore.getState().activePath).toBe('/ws/a.ts');
  });

  it('should close a tab from its close button', async () => {
    render(<EditorTabs />);

    await userEvent.click(screen.getByLabelText('Close a.ts'));
    await waitFor(() => expect(useEditorStore.getState().editors).toHaveLength(1));
  });

  it('should mark an unsaved tab as dirty', () => {
    act(() => useEditorStore.getState().markDirty('/ws/a.ts', true));
    const { container } = render(<EditorTabs />);

    expect(container.querySelector('.editor-tab--dirty')).toBeInTheDocument();
  });
});

describe('Breadcrumbs', () => {
  it('should render nothing when no editor is open', () => {
    const { container } = render(<Breadcrumbs />);
    expect(container.firstChild).toBeNull();
  });

  it('should show the path relative to the workspace root', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    state.files.set('/ws/src/deep/app.ts', { content: 'x', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/ws/src/deep/app.ts');

    render(<Breadcrumbs />);

    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('deep')).toBeInTheDocument();
    expect(screen.getByText('app.ts')).toBeInTheDocument();
  });

  it('should show only the name for an untitled buffer', () => {
    act(() => useEditorStore.getState().newUntitled());
    render(<Breadcrumbs />);

    expect(screen.getByText('Untitled-1')).toBeInTheDocument();
  });
});

describe('WelcomeView', () => {
  it('should offer the starting actions with their shortcuts', () => {
    render(<WelcomeView />);

    expect(screen.getByRole('button', { name: 'New File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeInTheDocument();
    expect(screen.getByText('Ctrl+N')).toBeInTheDocument();
  });

  it('should report how many languages and themes are installed', () => {
    render(<WelcomeView />);
    expect(screen.getByText(/languages recognised, \d+ color themes installed/)).toBeInTheDocument();
  });

  it('should run a command when a link is clicked', async () => {
    render(<WelcomeView />);

    await userEvent.click(screen.getByRole('button', { name: 'New File' }));
    await waitFor(() => expect(useEditorStore.getState().editors).toHaveLength(1));
  });
});

describe('EditorArea', () => {
  it('should show the welcome view when nothing is open', () => {
    render(<EditorArea />);
    expect(screen.getByText('Fast. Beautiful. For every language.')).toBeInTheDocument();
  });

  it('should show the editor once a file is open', async () => {
    state.files.set('/ws/a.ts', { content: 'x', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/ws/a.ts');

    render(<EditorArea />);
    expect(screen.getByTestId('monaco-host')).toBeInTheDocument();
  });

  it('should hide the breadcrumbs when the setting is off', async () => {
    state.files.set('/ws/a.ts', { content: 'x', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/ws/a.ts');
    useSettingsStore.setState({
      settings: { ...FALLBACK_SETTINGS, 'workbench.showBreadcrumbs': false },
      loaded: true
    });

    const { container } = render(<EditorArea />);
    expect(container.querySelector('.breadcrumbs')).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Problems panel                                                              */
/* -------------------------------------------------------------------------- */

describe('ProblemsPanel', () => {
  it('should say so when there is nothing wrong', () => {
    render(<ProblemsPanel />);
    expect(screen.getByText('No problems have been detected in the open files.')).toBeInTheDocument();
  });

  it('should list a problem with its message, source and position', () => {
    diagnosticService.setDiagnostics('/ws/src/app.ts', 'TypeScript', [makeDiagnostic()]);
    render(<ProblemsPanel />);

    expect(screen.getByText(/not assignable to type/)).toBeInTheDocument();
    expect(screen.getByText(/TypeScript/)).toBeInTheDocument();
    expect(screen.getByText(/Ln 12, Col 7/)).toBeInTheDocument();
  });

  it('should reveal the cause and the fix when a row is expanded', async () => {
    diagnosticService.setDiagnostics('/ws/src/app.ts', 'TypeScript', [makeDiagnostic()]);
    render(<ProblemsPanel />);

    expect(screen.queryByText('Why')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Show cause and fix'));

    expect(screen.getByText('Where')).toBeInTheDocument();
    expect(screen.getByText('Why')).toBeInTheDocument();
    expect(screen.getByText('Fix')).toBeInTheDocument();
    expect(screen.getByText(/A value of type string was assigned/)).toBeInTheDocument();
    expect(screen.getByText(/Convert the value to number/)).toBeInTheDocument();
  });

  it('should collapse an expanded row again', async () => {
    diagnosticService.setDiagnostics('/ws/src/app.ts', 'TypeScript', [makeDiagnostic()]);
    render(<ProblemsPanel />);

    await userEvent.click(screen.getByLabelText('Show cause and fix'));
    await userEvent.click(screen.getByLabelText('Hide details'));

    expect(screen.queryByText('Why')).not.toBeInTheDocument();
  });

  it('should show related information when the diagnostic has it', async () => {
    diagnosticService.setDiagnostics('/ws/src/app.ts', 'TypeScript', [
      makeDiagnostic({
        relatedInformation: [
          {
            location: {
              uri: '/ws/src/other.ts',
              range: { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 2 }
            },
            message: 'First declaration is here.'
          }
        ]
      })
    ]);

    render(<ProblemsPanel />);
    await userEvent.click(screen.getByLabelText('Show cause and fix'));

    expect(screen.getByText('Related')).toBeInTheDocument();
    expect(screen.getByText(/First declaration is here/)).toBeInTheDocument();
  });

  it('should link to the rule documentation when there is one', async () => {
    diagnosticService.setDiagnostics('/ws/src/app.ts', 'ESLint', [
      makeDiagnostic({
        source: 'ESLint',
        code: 'no-unused-vars',
        documentationUrl: 'https://eslint.org/docs/latest/rules/no-unused-vars'
      })
    ]);

    render(<ProblemsPanel />);
    await userEvent.click(screen.getByLabelText('Show cause and fix'));

    expect(screen.getByRole('link', { name: 'Read the rule documentation' })).toHaveAttribute(
      'href',
      'https://eslint.org/docs/latest/rules/no-unused-vars'
    );
  });

  it('should filter the list', async () => {
    diagnosticService.setDiagnostics('/ws/a.ts', 'TypeScript', [
      makeDiagnostic({ uri: '/ws/a.ts', message: 'first problem' })
    ]);
    diagnosticService.setDiagnostics('/ws/b.ts', 'TypeScript', [
      makeDiagnostic({ uri: '/ws/b.ts', message: 'second problem' })
    ]);

    render(<ProblemsPanel />);
    expect(screen.getByText('2 of 2')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Filter problems'), 'first');

    expect(screen.getByText('1 of 2')).toBeInTheDocument();
    expect(screen.queryByText('second problem')).not.toBeInTheDocument();
  });

  it('should say when a filter matches nothing', async () => {
    diagnosticService.setDiagnostics('/ws/a.ts', 'TypeScript', [makeDiagnostic({ uri: '/ws/a.ts' })]);
    render(<ProblemsPanel />);

    await userEvent.type(screen.getByLabelText('Filter problems'), 'zzzz');
    expect(screen.getByText('No problem matches this filter.')).toBeInTheDocument();
  });

  it('should open the file when a problem is clicked', async () => {
    state.files.set('/ws/src/app.ts', { content: 'const x: number = "s";', modifiedAt: 1 });
    diagnosticService.setDiagnostics('/ws/src/app.ts', 'TypeScript', [makeDiagnostic()]);

    render(<ProblemsPanel />);
    await userEvent.click(screen.getByText(/not assignable to type/));

    await waitFor(() => expect(useEditorStore.getState().editors).toHaveLength(1));
  });
});

/* -------------------------------------------------------------------------- */
/* Output panel                                                                */
/* -------------------------------------------------------------------------- */

describe('OutputPanel', () => {
  it('should say when nothing has been logged', () => {
    render(<OutputPanel />);
    expect(screen.getByText('Nothing has been logged yet.')).toBeInTheDocument();
  });

  it('should show log entries with their channel', () => {
    outputChannel.append('cairn', 'Workbench ready');
    render(<OutputPanel />);

    expect(screen.getByText('Workbench ready')).toBeInTheDocument();
    expect(screen.getByText('[cairn]')).toBeInTheDocument();
  });

  it('should filter by channel', async () => {
    outputChannel.append('cairn', 'from cairn');
    outputChannel.append('git', 'from git');

    render(<OutputPanel />);
    await userEvent.selectOptions(screen.getByLabelText('Output channel'), 'git');

    expect(screen.getByText('from git')).toBeInTheDocument();
    expect(screen.queryByText('from cairn')).not.toBeInTheDocument();
  });

  it('should clear the log', async () => {
    outputChannel.append('cairn', 'noise');
    render(<OutputPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Nothing has been logged yet.')).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Panel container                                                             */
/* -------------------------------------------------------------------------- */

describe('Panel', () => {
  it('should offer the three panel views', () => {
    render(<Panel />);

    expect(screen.getByRole('tab', { name: /Problems/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Terminal' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Output' })).toBeInTheDocument();
  });

  it('should switch the visible view', async () => {
    render(<Panel />);

    await userEvent.click(screen.getByRole('tab', { name: 'Output' }));
    expect(useUiStore.getState().panelView).toBe('output');
  });

  it('should badge the Problems tab with the count', () => {
    diagnosticService.setDiagnostics('/ws/a.ts', 'TypeScript', [
      makeDiagnostic({ uri: '/ws/a.ts', severity: 0 }),
      makeDiagnostic({ uri: '/ws/a.ts', severity: 1 })
    ]);

    render(<Panel />);
    expect(screen.getByRole('tab', { name: /Problems/ })).toHaveTextContent('2');
  });

  it('should close the panel from its close button', async () => {
    useUiStore.setState({ panelVisible: true });
    render(<Panel />);

    await userEvent.click(screen.getByLabelText('Close panel'));
    expect(useUiStore.getState().panelVisible).toBe(false);
  });

  it('should keep the terminal mounted while another view is shown', () => {
    useUiStore.setState({ panelView: 'problems' });
    const { container } = render(<Panel />);

    // Hidden rather than unmounted, so the shell and its scrollback survive.
    const terminalPane = container.querySelector('.panel__pane[hidden]');
    expect(terminalPane).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Dialogs                                                                     */
/* -------------------------------------------------------------------------- */

describe('CommandPalette', () => {
  it('should list commands and filter as the user types', async () => {
    render(<CommandPalette />);

    expect(screen.getAllByRole('option').length).toBeGreaterThan(10);

    await userEvent.type(screen.getByRole('combobox'), 'color theme');
    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveTextContent('Color Theme'));
  });

  it('should show the keybinding next to a command', async () => {
    render(<CommandPalette />);
    await userEvent.type(screen.getByRole('combobox'), 'color theme');

    expect(screen.getByText('Ctrl+K Ctrl+T')).toBeInTheDocument();
  });

  it('should run the chosen command and close', async () => {
    render(<CommandPalette />);

    await userEvent.type(screen.getByRole('combobox'), 'new file');
    await userEvent.keyboard('{Enter}');

    expect(useUiStore.getState().dialog).toBe('none');
    await waitFor(() => expect(useEditorStore.getState().editors).toHaveLength(1));
  });

  it('should say when nothing matches', async () => {
    render(<CommandPalette />);
    await userEvent.type(screen.getByRole('combobox'), 'zzzzzzzz');

    expect(screen.getByText('No command matches this search')).toBeInTheDocument();
  });
});

describe('QuickOpen', () => {
  it('should list the open editors when no folder is open', async () => {
    state.files.set('/ws/a.ts', { content: 'x', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/ws/a.ts');

    render(<QuickOpen />);
    expect(screen.getByText('a.ts')).toBeInTheDocument();
  });

  it('should search workspace files once a folder is open', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    state.searchNames = ['/ws/src/index.ts', '/ws/src/app.tsx'];

    render(<QuickOpen />);

    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument());
    expect(screen.getByText('app.tsx')).toBeInTheDocument();
  });

  it('should open the chosen file and close', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    state.searchNames = ['/ws/src/index.ts'];
    state.files.set('/ws/src/index.ts', { content: 'x', modifiedAt: 1 });

    render(<QuickOpen />);
    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument());
    await userEvent.keyboard('{Enter}');

    expect(useUiStore.getState().dialog).toBe('none');
    await waitFor(() => expect(useEditorStore.getState().editors).toHaveLength(1));
  });

  it('should tell the user to open a folder when there is nothing to search', () => {
    render(<QuickOpen />);
    expect(screen.getByText('Open a folder to search all files')).toBeInTheDocument();
  });
});

describe('ThemePicker', () => {
  it('should show a card for every installed theme', () => {
    render(<ThemePicker />);

    const cards = screen.getAllByRole('button').filter((button) => button.className.includes('theme-card'));
    expect(cards.length).toBe(useThemeStore.getState().themes.length);
  });

  it('should filter the themes', async () => {
    render(<ThemePicker />);

    await userEvent.type(screen.getByLabelText('Search themes'), 'nordic');
    expect(screen.getByText('Nordic')).toBeInTheDocument();
    expect(screen.queryByText('Crimson')).not.toBeInTheDocument();
  });

  it('should preview a theme on hover without committing it', async () => {
    render(<ThemePicker />);

    await userEvent.hover(screen.getByText('Nordic'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('nordic');
    expect(useThemeStore.getState().currentThemeId).toBe('dark-modern');
  });

  it('should apply a theme on click and close', async () => {
    render(<ThemePicker />);

    await userEvent.click(screen.getByText('Forest'));

    expect(useThemeStore.getState().currentThemeId).toBe('forest');
    expect(useUiStore.getState().dialog).toBe('none');
  });

  it('should restore the previous theme when cancelled', async () => {
    render(<ThemePicker />);

    await userEvent.hover(screen.getByText('Nordic'));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark-modern');
    expect(useUiStore.getState().dialog).toBe('none');
  });

  it('should close on Escape', async () => {
    render(<ThemePicker />);

    await userEvent.keyboard('{Escape}');
    expect(useUiStore.getState().dialog).toBe('none');
  });

  it('should report how many themes match', async () => {
    render(<ThemePicker />);
    const total = useThemeStore.getState().themes.length;

    expect(screen.getByText(total + ' of ' + total + ' themes')).toBeInTheDocument();
  });
});

describe('AboutDialog', () => {
  it('should report the versions from the main process', async () => {
    render(<AboutDialog />);

    await waitFor(() => expect(screen.getByText('1.0.0-test')).toBeInTheDocument());
    expect(screen.getByText('44.0.0')).toBeInTheDocument();
  });

  it('should state the licence and the telemetry position', () => {
    render(<AboutDialog />);
    expect(screen.getByText(/MIT license.*Telemetry is off/)).toBeInTheDocument();
  });

  it('should close', async () => {
    render(<AboutDialog />);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useUiStore.getState().dialog).toBe('none');
  });
});

describe('ShortcutsDialog', () => {
  it('should list the shortcuts in a table', () => {
    render(<ShortcutsDialog />);

    expect(screen.getByRole('columnheader', { name: 'Command' })).toBeInTheDocument();
    expect(screen.getAllByRole('row').length).toBeGreaterThan(20);
  });

  it('should filter by command, category or key', async () => {
    render(<ShortcutsDialog />);

    await userEvent.type(screen.getByLabelText('Search shortcuts'), 'terminal');
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeLessThan(20);
  });

  it('should say when a filter matches nothing', async () => {
    render(<ShortcutsDialog />);

    await userEvent.type(screen.getByLabelText('Search shortcuts'), 'zzzzzz');
    expect(screen.getByText('No shortcut matches.')).toBeInTheDocument();
  });

  it('should close', async () => {
    render(<ShortcutsDialog />);

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useUiStore.getState().dialog).toBe('none');
  });
});
