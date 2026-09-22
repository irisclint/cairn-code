import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as monaco from 'monaco-editor';
import { installBridge, removeBridge, state } from './bridge-mock';
import { useEditorStore, isUntitledPath } from '@renderer/store/editor-store';
import { useNotificationStore } from '@renderer/store/notification-store';
import { diagnosticService } from '@renderer/services/diagnostic-service';

/** Disposes every Monaco model so tests cannot leak state into each other. */
function disposeAllModels(): void {
  for (const model of monaco.editor.getModels()) model.dispose();
}

beforeEach(() => {
  installBridge();
  disposeAllModels();
  diagnosticService.clearAll();
  useEditorStore.setState({ editors: [], activePath: null });
  useNotificationStore.setState({ notifications: [] });
});

afterEach(() => {
  disposeAllModels();
});

describe('isUntitledPath', () => {
  it('should recognise a buffer that has no file on disk', () => {
    expect(isUntitledPath('untitled:buffer-1')).toBe(true);
    expect(isUntitledPath('C:/work/file.ts')).toBe(false);
  });
});

describe('opening files', () => {
  it('should open a file, create its model and make it active', async () => {
    state.files.set('/work/app.ts', { content: 'const a = 1;', modifiedAt: 1 });

    await useEditorStore.getState().openFile('/work/app.ts');

    const editors = useEditorStore.getState().editors;
    expect(editors).toHaveLength(1);
    expect(editors[0]?.name).toBe('app.ts');
    expect(editors[0]?.language.id).toBe('typescript');
    expect(editors[0]?.isDirty).toBe(false);
    expect(useEditorStore.getState().activePath).toBe('/work/app.ts');

    const model = monaco.editor.getModel(monaco.Uri.file('/work/app.ts'));
    expect(model?.getValue()).toBe('const a = 1;');
  });

  it('should give a .tsx file the Monaco TypeScript grammar', async () => {
    state.files.set('/work/App.tsx', { content: 'export const A = () => null;', modifiedAt: 1 });

    await useEditorStore.getState().openFile('/work/App.tsx');

    expect(useEditorStore.getState().editors[0]?.language.label).toBe('TypeScript React');
    expect(monaco.editor.getModel(monaco.Uri.file('/work/App.tsx'))?.getLanguageId()).toBe('typescript');
  });

  it('should detect the language from a shebang when there is no extension', async () => {
    state.files.set('/work/run', { content: '#!/usr/bin/env python3\nprint(1)\n', modifiedAt: 1 });

    await useEditorStore.getState().openFile('/work/run');
    expect(useEditorStore.getState().editors[0]?.language.id).toBe('python');
  });

  it('should activate an already open file instead of opening it twice', async () => {
    state.files.set('/work/a.ts', { content: 'a', modifiedAt: 1 });
    state.files.set('/work/b.ts', { content: 'b', modifiedAt: 1 });

    await useEditorStore.getState().openFile('/work/a.ts');
    await useEditorStore.getState().openFile('/work/b.ts');
    await useEditorStore.getState().openFile('/work/a.ts');

    expect(useEditorStore.getState().editors).toHaveLength(2);
    expect(useEditorStore.getState().activePath).toBe('/work/a.ts');
  });

  it('should report a failed open with a cause and a fix instead of opening an empty tab', async () => {
    await useEditorStore.getState().openFile('/work/missing.ts');

    expect(useEditorStore.getState().editors).toHaveLength(0);

    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.severity).toBe('error');
    expect(notification?.cause?.length).toBeGreaterThan(0);
    expect(notification?.solution?.length).toBeGreaterThan(0);
  });

  it('should warn once when a file opens in large file mode', async () => {
    state.files.set('/work/huge.ts', { content: 'x'.repeat(5 * 1024 * 1024), modifiedAt: 1 });

    await useEditorStore.getState().openFile('/work/huge.ts');

    expect(useEditorStore.getState().editors[0]?.isLarge).toBe(true);
    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.severity).toBe('info');
    expect(notification?.solution).toContain('full feature set');
  });

  it('should open every file the picker returned', async () => {
    state.files.set('/work/a.ts', { content: 'a', modifiedAt: 1 });
    state.files.set('/work/b.ts', { content: 'b', modifiedAt: 1 });
    state.dialogFileResult = ['/work/a.ts', '/work/b.ts'];

    await useEditorStore.getState().openFileDialog();
    expect(useEditorStore.getState().editors).toHaveLength(2);
  });

  it('should open nothing when the picker is cancelled', async () => {
    state.dialogFileResult = null;
    await useEditorStore.getState().openFileDialog();
    expect(useEditorStore.getState().editors).toHaveLength(0);
  });
});

describe('untitled buffers', () => {
  it('should create a numbered untitled buffer', () => {
    useEditorStore.getState().newUntitled();
    useEditorStore.getState().newUntitled();

    const editors = useEditorStore.getState().editors;
    expect(editors[0]?.name).toBe('Untitled-1');
    expect(editors[1]?.name).toBe('Untitled-2');
    expect(editors[0]?.isUntitled).toBe(true);
  });

  it('should make the new buffer active', () => {
    useEditorStore.getState().newUntitled();
    expect(useEditorStore.getState().activePath).toBe(useEditorStore.getState().editors[0]?.path);
  });
});

describe('tab management', () => {
  beforeEach(async () => {
    for (const name of ['a', 'b', 'c']) {
      state.files.set('/work/' + name + '.ts', { content: name, modifiedAt: 1 });
      await useEditorStore.getState().openFile('/work/' + name + '.ts');
    }
  });

  it('should activate a tab that is open', () => {
    useEditorStore.getState().activate('/work/a.ts');
    expect(useEditorStore.getState().activePath).toBe('/work/a.ts');
  });

  it('should ignore an activate for a tab that is not open', () => {
    useEditorStore.getState().activate('/work/zz.ts');
    expect(useEditorStore.getState().activePath).toBe('/work/c.ts');
  });

  it('should close a tab and dispose its model and diagnostics', async () => {
    await useEditorStore.getState().close('/work/b.ts');

    expect(useEditorStore.getState().editors.map((editor) => editor.name)).toEqual(['a.ts', 'c.ts']);
    expect(monaco.editor.getModel(monaco.Uri.file('/work/b.ts'))).toBeNull();
  });

  it('should activate the neighbour to the right when the active tab closes', async () => {
    useEditorStore.getState().activate('/work/b.ts');
    await useEditorStore.getState().close('/work/b.ts');

    expect(useEditorStore.getState().activePath).toBe('/work/c.ts');
  });

  it('should fall back to the left neighbour when the last tab closes', async () => {
    useEditorStore.getState().activate('/work/c.ts');
    await useEditorStore.getState().close('/work/c.ts');

    expect(useEditorStore.getState().activePath).toBe('/work/b.ts');
  });

  it('should leave the active tab alone when a different tab closes', async () => {
    useEditorStore.getState().activate('/work/c.ts');
    await useEditorStore.getState().close('/work/a.ts');

    expect(useEditorStore.getState().activePath).toBe('/work/c.ts');
  });

  it('should have no active tab once everything is closed', async () => {
    await useEditorStore.getState().closeAll();

    expect(useEditorStore.getState().editors).toHaveLength(0);
    expect(useEditorStore.getState().activePath).toBeNull();
  });

  it('should ignore a close for a tab that is not open', async () => {
    await useEditorStore.getState().close('/work/zz.ts');
    expect(useEditorStore.getState().editors).toHaveLength(3);
  });

  it('should ask before discarding unsaved changes', async () => {
    useEditorStore.getState().markDirty('/work/a.ts', true);
    state.dialogConfirmResult = false;

    await useEditorStore.getState().close('/work/a.ts');
    expect(useEditorStore.getState().editors).toHaveLength(3);

    state.dialogConfirmResult = true;
    await useEditorStore.getState().close('/work/a.ts');
    expect(useEditorStore.getState().editors).toHaveLength(2);
  });
});

describe('dirty state and view state', () => {
  beforeEach(async () => {
    state.files.set('/work/a.ts', { content: 'a', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/work/a.ts');
  });

  it('should mark and unmark a tab as dirty', () => {
    useEditorStore.getState().markDirty('/work/a.ts', true);
    expect(useEditorStore.getState().editors[0]?.isDirty).toBe(true);

    useEditorStore.getState().markDirty('/work/a.ts', false);
    expect(useEditorStore.getState().editors[0]?.isDirty).toBe(false);
  });

  it('should remember the view state of a tab', () => {
    const viewState = { cursorState: [], viewState: {} } as unknown as monaco.editor.ICodeEditorViewState;
    useEditorStore.getState().saveViewState('/work/a.ts', viewState);

    expect(useEditorStore.getState().editors[0]?.viewState).toBe(viewState);
  });

  it('should expose the active editor', () => {
    expect(useEditorStore.getState().active()?.name).toBe('a.ts');

    useEditorStore.setState({ activePath: null });
    expect(useEditorStore.getState().active()).toBeNull();
  });
});

describe('saving', () => {
  beforeEach(async () => {
    state.files.set('/work/a.ts', { content: 'original', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/work/a.ts');
  });

  it('should write the model content and clear the dirty flag', async () => {
    const model = monaco.editor.getModel(monaco.Uri.file('/work/a.ts'));
    model?.setValue('edited');
    useEditorStore.getState().markDirty('/work/a.ts', true);

    await expect(useEditorStore.getState().save()).resolves.toBe(true);

    expect(state.files.get('/work/a.ts')?.content).toBe('edited');
    expect(useEditorStore.getState().editors[0]?.isDirty).toBe(false);
  });

  it('should save a specific tab rather than the active one when asked', async () => {
    state.files.set('/work/b.ts', { content: 'b', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/work/b.ts');

    monaco.editor.getModel(monaco.Uri.file('/work/a.ts'))?.setValue('a-edited');
    await useEditorStore.getState().save('/work/a.ts');

    expect(state.files.get('/work/a.ts')?.content).toBe('a-edited');
  });

  it('should report a failed write and keep the tab dirty', async () => {
    useEditorStore.getState().markDirty('/work/a.ts', true);
    state.failNextWrite = true;

    await expect(useEditorStore.getState().save()).resolves.toBe(false);

    expect(useEditorStore.getState().editors[0]?.isDirty).toBe(true);
    expect(useNotificationStore.getState().notifications[0]?.severity).toBe('error');
  });

  it('should do nothing when there is no active editor', async () => {
    useEditorStore.setState({ editors: [], activePath: null });
    await expect(useEditorStore.getState().save()).resolves.toBe(false);
  });

  it('should save every dirty tab and leave clean ones alone', async () => {
    state.files.set('/work/b.ts', { content: 'b', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/work/b.ts');

    monaco.editor.getModel(monaco.Uri.file('/work/a.ts'))?.setValue('a2');
    useEditorStore.getState().markDirty('/work/a.ts', true);

    await useEditorStore.getState().saveAll();

    expect(state.files.get('/work/a.ts')?.content).toBe('a2');
    expect(useEditorStore.getState().editors.every((editor) => !editor.isDirty)).toBe(true);
  });
});

describe('save as', () => {
  it('should write to the chosen path and retarget the tab', async () => {
    state.files.set('/work/a.ts', { content: 'content', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/work/a.ts');
    state.dialogSaveResult = '/work/renamed.ts';

    await expect(useEditorStore.getState().saveAs()).resolves.toBe(true);

    const editor = useEditorStore.getState().editors[0];
    expect(editor?.path).toBe('/work/renamed.ts');
    expect(editor?.name).toBe('renamed.ts');
    expect(editor?.isUntitled).toBe(false);
    expect(state.files.get('/work/renamed.ts')?.content).toBe('content');
    expect(useEditorStore.getState().activePath).toBe('/work/renamed.ts');
  });

  it('should turn an untitled buffer into a real file', async () => {
    useEditorStore.getState().newUntitled();
    const untitledPath = useEditorStore.getState().editors[0]?.path as string;
    monaco.editor.getModel(monaco.Uri.parse(untitledPath))?.setValue('typed content');
    state.dialogSaveResult = '/work/new.ts';

    await expect(useEditorStore.getState().save()).resolves.toBe(true);

    expect(state.files.get('/work/new.ts')?.content).toBe('typed content');
    expect(useEditorStore.getState().editors[0]?.isUntitled).toBe(false);
    expect(useEditorStore.getState().editors[0]?.language.id).toBe('typescript');
  });

  it('should keep the tab unchanged when the save dialog is cancelled', async () => {
    state.files.set('/work/a.ts', { content: 'content', modifiedAt: 1 });
    await useEditorStore.getState().openFile('/work/a.ts');
    state.dialogSaveResult = null;

    await expect(useEditorStore.getState().saveAs()).resolves.toBe(false);
    expect(useEditorStore.getState().editors[0]?.path).toBe('/work/a.ts');
  });
});

describe('without the preload bridge', () => {
  it('should report the missing bridge rather than throwing an unhelpful error', async () => {
    removeBridge();

    await useEditorStore.getState().openFile('/work/a.ts');

    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.message).toContain('bridge');
    expect(notification?.solution).toContain('npm run dev');

    installBridge();
  });
});
