import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installBridge, state } from './bridge-mock';

import { ExplorerView } from '@renderer/components/views/ExplorerView';
import { SearchView } from '@renderer/components/views/SearchView';
import { SettingsView } from '@renderer/components/views/SettingsView';
import { SourceControlView } from '@renderer/components/views/SourceControlView';
import { ExtensionsView } from '@renderer/components/views/ExtensionsView';
import { SideBar } from '@renderer/components/layout/SideBar';
import { ActivityBar } from '@renderer/components/layout/ActivityBar';

import { useWorkspaceStore } from '@renderer/store/workspace-store';
import { useEditorStore } from '@renderer/store/editor-store';
import { useSettingsStore, FALLBACK_SETTINGS } from '@renderer/store/settings-store';
import { useUiStore } from '@renderer/store/ui-store';
import { useThemeStore } from '@renderer/store/theme-store';
import { useNotificationStore } from '@renderer/store/notification-store';
import { commandService } from '@renderer/services/command-service';
import { registerBuiltInCommands } from '@renderer/services/register-commands';

let disposeCommands: () => void;

beforeEach(() => {
  installBridge();
  disposeCommands?.();
  disposeCommands = registerBuiltInCommands();

  useWorkspaceStore.setState({
    rootPath: null,
    name: null,
    tree: new Map(),
    expanded: new Set(),
    selectedPath: null,
    loading: false
  });
  useEditorStore.setState({ editors: [], activePath: null });
  useSettingsStore.setState({ settings: { ...FALLBACK_SETTINGS }, loaded: true });
  useUiStore.setState({ sidebarVisible: true, sidebarView: 'explorer', dialog: 'none' });
  useNotificationStore.setState({ notifications: [] });
});

/* -------------------------------------------------------------------------- */
/* Explorer                                                                    */
/* -------------------------------------------------------------------------- */

describe('ExplorerView', () => {
  const openWorkspace = (): void => {
    useWorkspaceStore.setState({
      rootPath: '/ws',
      name: 'my-project',
      expanded: new Set(['/ws']),
      tree: new Map([
        [
          '/ws',
          [
            {
              path: '/ws/src',
              name: 'src',
              isDirectory: true,
              isSymbolicLink: false,
              size: 0,
              modifiedAt: 0
            },
            {
              path: '/ws/README.md',
              name: 'README.md',
              isDirectory: false,
              isSymbolicLink: false,
              size: 10,
              modifiedAt: 0
            }
          ]
        ],
        [
          '/ws/src',
          [
            {
              path: '/ws/src/index.ts',
              name: 'index.ts',
              isDirectory: false,
              isSymbolicLink: false,
              size: 5,
              modifiedAt: 0
            }
          ]
        ]
      ])
    });
  };

  it('should offer to open a folder when none is open', async () => {
    render(<ExplorerView />);

    expect(screen.getByText('No folder is open yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Folder' })).toBeInTheDocument();
  });

  it('should run the open folder command from the empty state', async () => {
    state.dialogFolderResult = '/ws';
    state.directories.set('/ws', []);
    render(<ExplorerView />);

    await userEvent.click(screen.getByRole('button', { name: 'Open Folder' }));
    await waitFor(() => expect(useWorkspaceStore.getState().rootPath).toBe('/ws'));
  });

  it('should show the workspace name and its entries', () => {
    openWorkspace();
    render(<ExplorerView />);

    expect(screen.getByText('my-project')).toBeInTheDocument();
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('should expose the tree with accessible roles', () => {
    openWorkspace();
    render(<ExplorerView />);

    expect(screen.getByRole('tree', { name: 'Files' })).toBeInTheDocument();
    expect(screen.getAllByRole('treeitem').length).toBeGreaterThan(0);
  });

  it('should mark a directory as expanded and list its children', () => {
    openWorkspace();
    useWorkspaceStore.setState({ expanded: new Set(['/ws', '/ws/src']) });
    render(<ExplorerView />);

    expect(screen.getByText('index.ts')).toBeInTheDocument();
  });

  it('should open a file when its row is clicked', async () => {
    openWorkspace();
    state.files.set('/ws/README.md', { content: '# readme', modifiedAt: 1 });
    render(<ExplorerView />);

    await userEvent.click(screen.getByText('README.md'));

    await waitFor(() => expect(useEditorStore.getState().editors).toHaveLength(1));
    expect(useEditorStore.getState().editors[0]?.name).toBe('README.md');
  });

  it('should toggle a directory when its row is clicked', async () => {
    openWorkspace();
    render(<ExplorerView />);

    await userEvent.click(screen.getByText('src'));
    await waitFor(() => expect(useWorkspaceStore.getState().expanded.has('/ws/src')).toBe(true));
  });

  it('should activate a row from the keyboard', async () => {
    openWorkspace();
    state.files.set('/ws/README.md', { content: '# readme', modifiedAt: 1 });
    render(<ExplorerView />);

    const row = screen.getByText('README.md').closest('[role="treeitem"]') as HTMLElement;
    row.focus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(useEditorStore.getState().editors).toHaveLength(1));
  });

  it('should create a file from the toolbar', async () => {
    openWorkspace();
    render(<ExplorerView />);

    await userEvent.click(screen.getByLabelText('New File'));
    const input = screen.getByLabelText('New file name');
    await userEvent.type(input, 'created.ts{Enter}');

    await waitFor(() => expect(state.files.has('/ws/created.ts')).toBe(true));
  });

  it('should create a folder from the toolbar', async () => {
    openWorkspace();
    render(<ExplorerView />);

    await userEvent.click(screen.getByLabelText('New Folder'));
    await userEvent.type(screen.getByLabelText('New folder name'), 'lib{Enter}');

    await waitFor(() => expect(state.directories.has('/ws/lib')).toBe(true));
  });

  it('should abandon the draft on Escape', async () => {
    openWorkspace();
    render(<ExplorerView />);

    await userEvent.click(screen.getByLabelText('New File'));
    await userEvent.type(screen.getByLabelText('New file name'), 'abandoned.ts{Escape}');

    expect(screen.queryByLabelText('New file name')).not.toBeInTheDocument();
    expect(state.files.has('/ws/abandoned.ts')).toBe(false);
  });

  it('should reload the tree from the refresh button', async () => {
    openWorkspace();
    state.directories.set('/ws', []);
    render(<ExplorerView />);

    await userEvent.click(screen.getByLabelText('Refresh Explorer'));
    await waitFor(() => expect(globalThis.window.cairn.fs.readDirectory).toHaveBeenCalledWith('/ws'));
  });

  it('should say so when the folder is empty', () => {
    useWorkspaceStore.setState({
      rootPath: '/ws',
      name: 'empty',
      expanded: new Set(['/ws']),
      tree: new Map([['/ws', []]])
    });
    render(<ExplorerView />);

    expect(screen.getByText('This folder is empty.')).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Search                                                                      */
/* -------------------------------------------------------------------------- */

describe('SearchView', () => {
  it('should ask for a folder before searching', () => {
    render(<SearchView />);
    expect(screen.getByText('Open a folder to search across files.')).toBeInTheDocument();
  });

  it('should disable the button until a folder is open', () => {
    render(<SearchView />);
    expect(screen.getByRole('button', { name: 'Search' })).toBeDisabled();
  });

  it('should run a search and list the matches', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    vi.mocked(globalThis.window.cairn.search.inFiles).mockResolvedValueOnce({
      ok: true,
      value: [
        {
          path: '/ws/src/index.ts',
          matches: [{ lineNumber: 3, column: 6, length: 6, lineText: 'const needle = 1;' }]
        }
      ]
    });

    render(<SearchView />);
    await userEvent.type(screen.getByLabelText('Search text'), 'needle{Enter}');

    await waitFor(() => expect(screen.getByText('index.ts')).toBeInTheDocument());
    expect(screen.getByText('1 result in 1 file')).toBeInTheDocument();
    expect(screen.getByText('needle')).toBeInTheDocument();
  });

  it('should pass the search toggles through to the query', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    render(<SearchView />);

    await userEvent.click(screen.getByTitle('Match Case'));
    await userEvent.click(screen.getByTitle('Match Whole Word'));
    await userEvent.click(screen.getByTitle('Use Regular Expression'));
    await userEvent.type(screen.getByLabelText('Search text'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(globalThis.window.cairn.search.inFiles).toHaveBeenCalledWith(
        expect.objectContaining({ matchCase: true, wholeWord: true, isRegex: true })
      )
    );
  });

  it('should pass the include glob through', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    render(<SearchView />);

    await userEvent.type(screen.getByLabelText('Search text'), 'x');
    await userEvent.type(screen.getByLabelText('Files to include'), 'src/**/*.ts');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() =>
      expect(globalThis.window.cairn.search.inFiles).toHaveBeenCalledWith(
        expect.objectContaining({ includeGlob: 'src/**/*.ts' })
      )
    );
  });

  it('should report a failed search', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    vi.mocked(globalThis.window.cairn.search.inFiles).mockResolvedValueOnce({
      ok: false,
      error: { code: 'SEARCH_BAD_REGEX', message: 'bad pattern', cause: 'c', solution: 's' }
    });

    render(<SearchView />);
    const input = screen.getByLabelText('Search text');
    await userEvent.click(input);
    await userEvent.paste('([');
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(useNotificationStore.getState().notifications).toHaveLength(1));
  });

  it('should not search for an empty query', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    render(<SearchView />);

    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(globalThis.window.cairn.search.inFiles).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Settings                                                                    */
/* -------------------------------------------------------------------------- */

describe('SettingsView', () => {
  it('should group the settings into sections', () => {
    render(<SettingsView />);

    for (const section of ['Appearance', 'Workbench', 'Editor', 'Terminal', 'Diagnostics']) {
      expect(screen.getByText(section)).toBeInTheDocument();
    }
  });

  it('should list every installed theme in the dropdown', () => {
    render(<SettingsView />);

    const select = screen.getByLabelText('Color theme') as HTMLSelectElement;
    expect(select.options.length).toBe(useThemeStore.getState().themes.length);
  });

  it('should apply a theme chosen from the dropdown', async () => {
    useThemeStore.getState().initialize('dark-modern');
    render(<SettingsView />);

    await userEvent.selectOptions(screen.getByLabelText('Color theme'), 'nordic');
    expect(useThemeStore.getState().currentThemeId).toBe('nordic');
  });

  it('should toggle a boolean setting', async () => {
    render(<SettingsView />);

    await userEvent.click(screen.getByLabelText('Show minimap'));
    await waitFor(() => expect(useSettingsStore.getState().settings['workbench.showMinimap']).toBe(false));
  });

  it('should change a numeric setting', async () => {
    render(<SettingsView />);

    const input = screen.getByLabelText('Font size', { selector: '#setting-editor-fontSize' });
    await userEvent.clear(input);
    await userEvent.type(input, '20');

    await waitFor(() => expect(useSettingsStore.getState().settings['editor.fontSize']).toBe(20));
  });

  it('should change a select setting', async () => {
    render(<SettingsView />);

    await userEvent.selectOptions(screen.getByLabelText('Word wrap'), 'on');
    await waitFor(() => expect(useSettingsStore.getState().settings['editor.wordWrap']).toBe('on'));
  });

  it('should show telemetry as opt-in', () => {
    render(<SettingsView />);

    expect(screen.getByLabelText('Send anonymous usage data')).not.toBeChecked();
    expect(screen.getByText(/never sends anything until this is switched on/)).toBeInTheDocument();
  });

  it('should reset every setting', async () => {
    render(<SettingsView />);

    await userEvent.click(screen.getByRole('button', { name: 'Reset all settings' }));
    await waitFor(() => expect(globalThis.window.cairn.settings.reset).toHaveBeenCalled());
  });
});

/* -------------------------------------------------------------------------- */
/* Placeholder views                                                           */
/* -------------------------------------------------------------------------- */

describe('SourceControlView', () => {
  it('should say the feature is not built yet rather than showing dead controls', () => {
    render(<SourceControlView />);
    expect(screen.getByText(/Open a folder to see its repository status/)).toBeInTheDocument();
  });

  it('should point at the terminal once a folder is open', () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    render(<SourceControlView />);

    expect(screen.getByText(/Git integration arrives in the next milestone/)).toBeInTheDocument();
    expect(screen.getByText(/integrated terminal/)).toBeInTheDocument();
  });
});

describe('ExtensionsView', () => {
  it('should list what is already built in', () => {
    render(<ExtensionsView />);

    expect(screen.getByText(/languages with syntax highlighting/)).toBeInTheDocument();
    expect(screen.getByText(/color themes/)).toBeInTheDocument();
    expect(screen.getByText(/planned for the next milestone/)).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Sidebar and activity bar                                                    */
/* -------------------------------------------------------------------------- */

describe('SideBar', () => {
  it.each([
    ['explorer', 'Explorer'],
    ['search', 'Search'],
    ['source-control', 'Source Control'],
    ['extensions', 'Extensions'],
    ['settings', 'Settings']
  ] as const)('should render the %s view', (view, title) => {
    useUiStore.setState({ sidebarView: view });
    render(<SideBar />);

    expect(
      within(screen.getByRole('complementary')).getByRole('heading', { name: title })
    ).toBeInTheDocument();
  });
});

describe('ActivityBar', () => {
  it('should offer every primary view plus settings', () => {
    render(<ActivityBar />);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(5);
  });

  it('should show the keyboard shortcut in the tooltip', () => {
    render(<ActivityBar />);
    expect(screen.getByLabelText('Explorer (Ctrl+Shift+E)')).toBeInTheDocument();
  });

  it('should mark the active view as pressed', () => {
    useUiStore.setState({ sidebarView: 'search', sidebarVisible: true });
    render(<ActivityBar />);

    expect(screen.getByLabelText(/^Search/)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText(/^Explorer/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('should switch views on click', async () => {
    render(<ActivityBar />);

    await userEvent.click(screen.getByLabelText(/^Search/));
    expect(useUiStore.getState().sidebarView).toBe('search');
  });

  it('should collapse the sidebar when the active view is clicked again', async () => {
    useUiStore.setState({ sidebarView: 'explorer', sidebarVisible: true });
    render(<ActivityBar />);

    await userEvent.click(screen.getByLabelText(/^Explorer/));
    expect(useUiStore.getState().sidebarVisible).toBe(false);
  });

  it('should open the settings view', async () => {
    render(<ActivityBar />);

    await userEvent.click(screen.getByLabelText('Settings'));
    expect(useUiStore.getState().sidebarView).toBe('settings');
  });
});

describe('command registration for the views', () => {
  it('should leave the registry clean after disposal', () => {
    const before = commandService.list().length;
    const dispose = registerBuiltInCommands();
    dispose();

    expect(commandService.list().length).toBeLessThanOrEqual(before);
  });
});
