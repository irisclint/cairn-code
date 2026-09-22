import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUiStore, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, MIN_PANEL_HEIGHT } from '@renderer/store/ui-store';
import { useNotificationStore } from '@renderer/store/notification-store';
import { useWorkspaceStore, joinPath } from '@renderer/store/workspace-store';
import { ApiError } from '@renderer/services/api';
import { OutputChannelService } from '@renderer/services/output-channel';
import { DiagnosticService } from '@renderer/services/diagnostic-service';
import type { Diagnostic } from '@shared/types';

function makeDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
  return {
    code: 'TS2322',
    source: 'TypeScript',
    severity: 0,
    message: 'Type mismatch',
    cause: 'because',
    solution: 'do this',
    uri: '/workspace/a.ts',
    range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 5 },
    ...overrides
  };
}

describe('ui store', () => {
  beforeEach(() => {
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
  });

  it('should toggle the sidebar', () => {
    useUiStore.getState().toggleSidebar();
    expect(useUiStore.getState().sidebarVisible).toBe(false);
  });

  it('should switch to another sidebar view and reveal the sidebar', () => {
    useUiStore.setState({ sidebarVisible: false });
    useUiStore.getState().showSidebarView('search');

    expect(useUiStore.getState().sidebarView).toBe('search');
    expect(useUiStore.getState().sidebarVisible).toBe(true);
  });

  it('should collapse the sidebar when the active view is selected again', () => {
    useUiStore.getState().showSidebarView('explorer');
    expect(useUiStore.getState().sidebarVisible).toBe(false);
  });

  it('should clamp the sidebar width to its bounds', () => {
    useUiStore.getState().setSidebarWidth(10);
    expect(useUiStore.getState().sidebarWidth).toBe(MIN_SIDEBAR_WIDTH);

    useUiStore.getState().setSidebarWidth(99_999);
    expect(useUiStore.getState().sidebarWidth).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('should clamp the panel height to its bounds', () => {
    useUiStore.getState().setPanelHeight(1);
    expect(useUiStore.getState().panelHeight).toBe(MIN_PANEL_HEIGHT);
  });

  it('should show a panel view and collapse it when reselected', () => {
    useUiStore.getState().showPanelView('problems');
    expect(useUiStore.getState().panelVisible).toBe(true);
    expect(useUiStore.getState().panelView).toBe('problems');

    useUiStore.getState().showPanelView('problems');
    expect(useUiStore.getState().panelVisible).toBe(false);
  });

  it('should open and close a dialog with its query', () => {
    useUiStore.getState().openDialog('quick-open', 'index');
    expect(useUiStore.getState().dialog).toBe('quick-open');
    expect(useUiStore.getState().dialogQuery).toBe('index');

    useUiStore.getState().closeDialog();
    expect(useUiStore.getState().dialog).toBe('none');
    expect(useUiStore.getState().dialogQuery).toBe('');
  });

  it('should set and clear the status message', () => {
    useUiStore.getState().setStatusMessage('waiting');
    expect(useUiStore.getState().statusMessage).toBe('waiting');

    useUiStore.getState().setStatusMessage(null);
    expect(useUiStore.getState().statusMessage).toBeNull();
  });
});

describe('notification store', () => {
  beforeEach(() => useNotificationStore.setState({ notifications: [] }));

  it('should add a notification and return its id', () => {
    const id = useNotificationStore.getState().notify({ severity: 'info', message: 'hello' });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe(id);
  });

  it('should never auto dismiss an error', () => {
    useNotificationStore.getState().notify({ severity: 'error', message: 'bad' });
    expect(useNotificationStore.getState().notifications[0]?.timeoutMs).toBe(0);
  });

  it('should auto dismiss lower severities', () => {
    useNotificationStore.getState().notify({ severity: 'info', message: 'fyi' });
    expect(useNotificationStore.getState().notifications[0]?.timeoutMs).toBeGreaterThan(0);
  });

  it('should honour an explicit timeout', () => {
    useNotificationStore.getState().notify({ severity: 'info', message: 'fyi', timeoutMs: 1234 });
    expect(useNotificationStore.getState().notifications[0]?.timeoutMs).toBe(1234);
  });

  it('should carry the cause and solution of an ApiError', () => {
    useNotificationStore
      .getState()
      .notifyError(new ApiError('FS_ENOENT', 'not found', 'the path is gone', 'check the path'));

    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.message).toBe('not found');
    expect(notification?.cause).toBe('the path is gone');
    expect(notification?.solution).toBe('check the path');
  });

  it('should still produce a cause and solution for an unknown error', () => {
    useNotificationStore.getState().notifyError(new Error('boom'));

    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.message).toBe('boom');
    expect(notification?.cause?.length).toBeGreaterThan(0);
    expect(notification?.solution?.length).toBeGreaterThan(0);
  });

  it('should use the fallback message for a non-Error throw', () => {
    useNotificationStore.getState().notifyError('oops', 'Could not do the thing');
    expect(useNotificationStore.getState().notifications[0]?.message).toBe('Could not do the thing');
  });

  it('should dismiss one notification and all of them', () => {
    const first = useNotificationStore.getState().notify({ severity: 'info', message: 'a' });
    useNotificationStore.getState().notify({ severity: 'info', message: 'b' });

    useNotificationStore.getState().dismiss(first);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    useNotificationStore.getState().dismissAll();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});

describe('joinPath', () => {
  it('should use the separator style of the parent path', () => {
    expect(joinPath('/home/user', 'file.ts')).toBe('/home/user/file.ts');
    expect(joinPath('C:\\Users\\dev', 'file.ts')).toBe('C:\\Users\\dev\\file.ts');
  });

  it('should not double a trailing separator', () => {
    expect(joinPath('/home/user/', 'file.ts')).toBe('/home/user/file.ts');
    expect(joinPath('C:\\Users\\dev\\', 'file.ts')).toBe('C:\\Users\\dev\\file.ts');
  });
});

describe('workspace store', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      rootPath: null,
      name: null,
      tree: new Map(),
      expanded: new Set(),
      selectedPath: null,
      loading: false
    });
  });

  it('should adopt a workspace reported by the main process', async () => {
    const readDirectory = vi.fn().mockResolvedValue({ ok: true, value: [] });
    vi.stubGlobal('window', { cairn: { fs: { readDirectory } } });

    await useWorkspaceStore.getState().syncWorkspace({ rootPath: '/ws', name: 'ws' });

    expect(useWorkspaceStore.getState().rootPath).toBe('/ws');
    expect(useWorkspaceStore.getState().name).toBe('ws');
    expect(useWorkspaceStore.getState().expanded.has('/ws')).toBe(true);
    expect(readDirectory).toHaveBeenCalledWith('/ws');

    vi.unstubAllGlobals();
  });

  it('should clear the tree when the workspace is closed elsewhere', async () => {
    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws', expanded: new Set(['/ws']) });
    await useWorkspaceStore.getState().syncWorkspace({ rootPath: null, name: null });

    expect(useWorkspaceStore.getState().rootPath).toBeNull();
    expect(useWorkspaceStore.getState().expanded.size).toBe(0);
  });

  it('should ignore a broadcast for the folder that is already open', async () => {
    const readDirectory = vi.fn().mockResolvedValue({ ok: true, value: [] });
    vi.stubGlobal('window', { cairn: { fs: { readDirectory } } });

    useWorkspaceStore.setState({ rootPath: '/ws', name: 'ws' });
    await useWorkspaceStore.getState().syncWorkspace({ rootPath: '/ws', name: 'ws' });

    expect(readDirectory).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('should select a path', () => {
    useWorkspaceStore.getState().select('/ws/file.ts');
    expect(useWorkspaceStore.getState().selectedPath).toBe('/ws/file.ts');
  });
});

describe('OutputChannelService', () => {
  let output: OutputChannelService;

  beforeEach(() => {
    output = new OutputChannelService();
  });

  it('should append and read back entries', () => {
    output.append('git', 'fetching');
    expect(output.entries()).toHaveLength(1);
    expect(output.entries()[0]?.message).toBe('fetching');
  });

  it('should filter by channel', () => {
    output.append('git', 'a');
    output.append('lint', 'b');

    expect(output.entries('git')).toHaveLength(1);
    expect(output.channels()).toEqual(['git', 'lint']);
  });

  it('should clear one channel or everything', () => {
    output.append('git', 'a');
    output.append('lint', 'b');

    output.clear('git');
    expect(output.entries()).toHaveLength(1);

    output.clear();
    expect(output.entries()).toHaveLength(0);
  });

  it('should notify listeners on change', () => {
    const listener = vi.fn();
    const unsubscribe = output.onDidChange(listener);

    output.append('git', 'a');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    output.append('git', 'b');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should drop the oldest entries past the cap', () => {
    for (let i = 0; i < 2100; i += 1) output.append('bulk', 'line ' + i);

    const entries = output.entries();
    expect(entries.length).toBeLessThanOrEqual(2000);
    expect(entries[entries.length - 1]?.message).toBe('line 2099');
  });
});

describe('DiagnosticService', () => {
  let service: DiagnosticService;

  beforeEach(() => {
    service = new DiagnosticService();
  });

  it('should store diagnostics per file', () => {
    service.setDiagnostics('/a.ts', 'TypeScript', [makeDiagnostic()]);
    expect(service.get('/a.ts')).toHaveLength(1);
    expect(service.get('/b.ts')).toHaveLength(0);
  });

  it('should replace only the diagnostics of the same source', () => {
    service.setDiagnostics('/a.ts', 'TypeScript', [makeDiagnostic({ code: 'TS1' })]);
    service.setDiagnostics('/a.ts', 'ESLint', [makeDiagnostic({ code: 'no-undef', source: 'ESLint' })]);
    expect(service.get('/a.ts')).toHaveLength(2);

    service.setDiagnostics('/a.ts', 'TypeScript', []);
    expect(service.get('/a.ts')).toHaveLength(1);
    expect(service.get('/a.ts')[0]?.source).toBe('ESLint');
  });

  it('should sort diagnostics of a file by position', () => {
    service.setDiagnostics('/a.ts', 'TypeScript', [
      makeDiagnostic({ range: { startLineNumber: 10, startColumn: 1, endLineNumber: 10, endColumn: 2 } }),
      makeDiagnostic({ range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 2 } })
    ]);

    expect(service.get('/a.ts')[0]?.range.startLineNumber).toBe(2);
  });

  it('should count by severity', () => {
    service.setDiagnostics('/a.ts', 'TypeScript', [
      makeDiagnostic({ severity: 0 }),
      makeDiagnostic({ severity: 1 }),
      makeDiagnostic({ severity: 1 }),
      makeDiagnostic({ severity: 2 }),
      makeDiagnostic({ severity: 3 })
    ]);

    expect(service.counts()).toEqual({ errors: 1, warnings: 2, infos: 1, hints: 1 });
  });

  it('should sort the flattened view with errors first', () => {
    service.setDiagnostics('/a.ts', 'TypeScript', [makeDiagnostic({ severity: 1 })]);
    service.setDiagnostics('/b.ts', 'TypeScript', [makeDiagnostic({ severity: 0, uri: '/b.ts' })]);

    expect(service.getFlattened()[0]?.severity).toBe(0);
  });

  it('should clear one file and all files', () => {
    service.setDiagnostics('/a.ts', 'TypeScript', [makeDiagnostic()]);
    service.setDiagnostics('/b.ts', 'TypeScript', [makeDiagnostic({ uri: '/b.ts' })]);

    service.clearFile('/a.ts');
    expect(service.get('/a.ts')).toHaveLength(0);
    expect(service.getFlattened()).toHaveLength(1);

    service.clearAll();
    expect(service.getFlattened()).toHaveLength(0);
  });

  it('should notify listeners and stop after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = service.onDidChange(listener);

    service.setDiagnostics('/a.ts', 'TypeScript', [makeDiagnostic()]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    service.setDiagnostics('/a.ts', 'TypeScript', []);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should drop the file entry once its last diagnostic is gone', () => {
    service.setDiagnostics('/a.ts', 'TypeScript', [makeDiagnostic()]);
    service.setDiagnostics('/a.ts', 'TypeScript', []);
    expect(service.getAll().has('/a.ts')).toBe(false);
  });
});
