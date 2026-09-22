import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as monaco from 'monaco-editor';
import { installBridge, state, listeners } from './bridge-mock';

import { App } from '@renderer/App';
import { useUiStore } from '@renderer/store/ui-store';
import { useEditorStore } from '@renderer/store/editor-store';
import { useWorkspaceStore } from '@renderer/store/workspace-store';
import { useSettingsStore, FALLBACK_SETTINGS } from '@renderer/store/settings-store';
import { useTerminalStore } from '@renderer/store/terminal-store';
import { useThemeStore } from '@renderer/store/theme-store';
import { useNotificationStore } from '@renderer/store/notification-store';
import { useFileProblems, useProblems } from '@renderer/hooks/useProblems';
import { diagnosticService } from '@renderer/services/diagnostic-service';
import { renderHook } from '@testing-library/react';
import type { Diagnostic } from '@shared/types';
import type * as MonacoSetup from '@renderer/editor/monaco-setup';

type MonacoSetupModule = typeof MonacoSetup;

// Monaco's worker setup cannot run under jsdom, and the App calls it on mount.
vi.mock('@renderer/editor/monaco-setup', async () => {
  const actual = await vi.importActual<MonacoSetupModule>('@renderer/editor/monaco-setup');
  return {
    ...actual,
    setupMonaco: vi.fn(),
    applyMonacoTheme: vi.fn(),
    registerThemes: vi.fn()
  };
});

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    code: 'TS2322',
    source: 'TypeScript',
    severity: 0,
    message: 'Type mismatch',
    cause: 'why',
    solution: 'how',
    uri: '/ws/a.ts',
    range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 },
    ...overrides
  };
}

beforeEach(() => {
  installBridge();
  state.settings = { ...FALLBACK_SETTINGS };

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
  useWorkspaceStore.setState({ rootPath: null, name: null, tree: new Map(), expanded: new Set() });
  useSettingsStore.setState({ settings: { ...FALLBACK_SETTINGS }, loaded: false });
  useTerminalStore.setState({ tabs: [], activeId: null, shells: [] });
  useNotificationStore.setState({ notifications: [] });
  diagnosticService.clearAll();
});

afterEach(() => {
  for (const model of monaco.editor.getModels()) model.dispose();
});

describe('App startup', () => {
  it('should show a loading state until settings arrive', () => {
    render(<App />);
    expect(screen.getByText('Starting cairn-code...')).toBeInTheDocument();
  });

  it('should render the whole workbench once settings have loaded', async () => {
    render(<App />);

    await waitFor(() => expect(screen.queryByText('Starting cairn-code...')).not.toBeInTheDocument());

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByLabelText('Editor')).toBeInTheDocument();
  });

  it('should apply the stored theme on startup', async () => {
    state.settings = { ...FALLBACK_SETTINGS, 'workbench.theme': 'nordic' };
    render(<App />);

    await waitFor(() => expect(useThemeStore.getState().currentThemeId).toBe('nordic'));
    expect(document.documentElement.getAttribute('data-theme')).toBe('nordic');
  });

  it('should subscribe to menu commands from the main process', async () => {
    render(<App />);
    await waitFor(() => expect(listeners.menuCommand.length).toBeGreaterThan(0));

    act(() => {
      for (const listener of listeners.menuCommand) listener('view.commandPalette');
    });

    await waitFor(() => expect(useUiStore.getState().dialog).toBe('command-palette'));
  });

  it('should adopt a workspace opened elsewhere', async () => {
    render(<App />);
    await waitFor(() => expect(listeners.workspaceChanged.length).toBeGreaterThan(0));

    state.directories.set('/ws', []);
    act(() => {
      for (const listener of listeners.workspaceChanged) listener({ rootPath: '/ws', name: 'ws' });
    });

    await waitFor(() => expect(useWorkspaceStore.getState().rootPath).toBe('/ws'));
  });
});

describe('App layout', () => {
  const renderReady = async (): Promise<void> => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Starting cairn-code...')).not.toBeInTheDocument());
  };

  it('should hide the sidebar when it is toggled off', async () => {
    await renderReady();

    act(() => useUiStore.getState().toggleSidebar());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('should show the panel when it is toggled on', async () => {
    await renderReady();

    act(() => useUiStore.getState().togglePanel());
    expect(screen.getByLabelText('Panel')).toBeInTheDocument();
  });

  it('should offer a resizer for the sidebar', async () => {
    await renderReady();
    expect(screen.getByRole('separator', { name: 'Resize sidebar' })).toBeInTheDocument();
  });

  it('should offer a resizer for the panel when it is open', async () => {
    await renderReady();

    act(() => useUiStore.getState().togglePanel());
    expect(screen.getByRole('separator', { name: 'Resize panel' })).toBeInTheDocument();
  });

  it('should resize the sidebar from its separator', async () => {
    await renderReady();

    const separator = screen.getByRole('separator', { name: 'Resize sidebar' });
    separator.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(useUiStore.getState().sidebarWidth).toBe(288);
  });
});

describe('App dialogs', () => {
  const renderReady = async (): Promise<void> => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Starting cairn-code...')).not.toBeInTheDocument());
  };

  it.each([
    ['command-palette', 'Command Palette'],
    ['quick-open', 'Go to File'],
    ['theme-picker', 'Select a color theme'],
    ['about', 'About cairn-code'],
    ['shortcuts', 'Keyboard shortcuts']
  ] as const)('should render the %s dialog', async (dialog, label) => {
    await renderReady();

    act(() => useUiStore.getState().openDialog(dialog));
    await waitFor(() => expect(screen.getByRole('dialog', { name: label })).toBeInTheDocument());
  });

  it('should render no dialog by default', async () => {
    await renderReady();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('App notifications', () => {
  it('should surface a notification over the workbench', async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Starting cairn-code...')).not.toBeInTheDocument());

    act(() => {
      useNotificationStore.getState().notify({
        severity: 'error',
        message: 'Could not save',
        cause: 'The file is read-only.',
        solution: 'Remove the read-only flag.'
      });
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Could not save')).toBeInTheDocument();
  });
});

describe('problem hooks', () => {
  it('should report the counts and update as diagnostics change', () => {
    const { result } = renderHook(() => useProblems());
    expect(result.current).toHaveLength(0);

    act(() => {
      diagnosticService.setDiagnostics('/ws/a.ts', 'TypeScript', [makeDiagnostic()]);
    });

    expect(result.current).toHaveLength(1);
  });

  it('should report the diagnostics of one file', () => {
    diagnosticService.setDiagnostics('/ws/a.ts', 'TypeScript', [makeDiagnostic()]);
    diagnosticService.setDiagnostics('/ws/b.ts', 'TypeScript', [makeDiagnostic({ uri: '/ws/b.ts' })]);

    const { result } = renderHook(() => useFileProblems('/ws/a.ts'));
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.uri).toBe('/ws/a.ts');
  });

  it('should report nothing when no file is given', () => {
    diagnosticService.setDiagnostics('/ws/a.ts', 'TypeScript', [makeDiagnostic()]);

    const { result } = renderHook(() => useFileProblems(null));
    expect(result.current).toHaveLength(0);
  });

  it('should follow a change to the watched file', () => {
    const { result } = renderHook(() => useFileProblems('/ws/a.ts'));

    act(() => {
      diagnosticService.setDiagnostics('/ws/a.ts', 'TypeScript', [makeDiagnostic()]);
    });
    expect(result.current).toHaveLength(1);

    act(() => {
      diagnosticService.setDiagnostics('/ws/a.ts', 'TypeScript', []);
    });
    expect(result.current).toHaveLength(0);
  });
});
