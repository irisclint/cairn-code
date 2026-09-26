import { create } from 'zustand';
import type * as monaco from 'monaco-editor';
import { api, unwrap } from '../services/api';
import { useNotificationStore } from './notification-store';
import { diagnosticService } from '../services/diagnostic-service';
import { detectLanguage, toMonacoLanguageId, type LanguageDefinition } from '../editor/language-support';
import { disposeModel, getModel, getOrCreateModel } from '../editor/create-editor';
import { basename, createId } from '@shared/utils';

export interface OpenEditor {
  /** Absolute file path, or a synthetic path for untitled buffers. */
  path: string;
  name: string;
  language: LanguageDefinition;
  isDirty: boolean;
  /** True for buffers that have never been written to disk. */
  isUntitled: boolean;
  /** True when the file exceeded the large file threshold on open. */
  isLarge: boolean;
  /** Size on disk at the time of the last read or write. */
  sizeBytes: number;
  /** Modification time on disk, used to detect external changes. */
  modifiedAt: number;
  /** Cursor position restored when the tab is activated again. */
  viewState: monaco.editor.ICodeEditorViewState | null;
}

interface EditorState {
  editors: OpenEditor[];
  activePath: string | null;

  openFile: (path: string) => Promise<void>;
  openFileDialog: () => Promise<void>;
  newUntitled: () => void;
  activate: (path: string) => void;
  close: (path: string) => Promise<void>;
  closeAll: () => Promise<void>;
  markDirty: (path: string, isDirty: boolean) => void;
  saveViewState: (path: string, viewState: monaco.editor.ICodeEditorViewState | null) => void;
  save: (path?: string) => Promise<boolean>;
  saveAs: (path?: string) => Promise<boolean>;
  saveAll: () => Promise<void>;
  /** The editor that is currently visible, if any. */
  active: () => OpenEditor | null;
}

/** Marker prefix that identifies buffers which have no file on disk yet. */
const UNTITLED_PREFIX = 'untitled:';

export function isUntitledPath(path: string): boolean {
  return path.startsWith(UNTITLED_PREFIX);
}

export const useEditorStore = create<EditorState>((set, get) => ({
  editors: [],
  activePath: null,

  active: () => {
    const { editors, activePath } = get();
    return editors.find((editor) => editor.path === activePath) ?? null;
  },

  openFile: async (path) => {
    const existing = get().editors.find((editor) => editor.path === path);
    if (existing) {
      set({ activePath: path });
      return;
    }

    try {
      const file = await unwrap(api().fs.readFile(path));
      const firstLine = file.content.slice(0, file.content.indexOf('\n') + 1 || 200);
      const language = detectLanguage(path, firstLine);

      getOrCreateModel(path, file.content, toMonacoLanguageId(language));

      const editor: OpenEditor = {
        path,
        name: basename(path),
        language,
        isDirty: false,
        isUntitled: false,
        isLarge: file.isLarge,
        sizeBytes: file.size,
        modifiedAt: file.modifiedAt,
        viewState: null
      };

      set((state) => ({ editors: [...state.editors, editor], activePath: path }));

      if (file.isLarge) {
        useNotificationStore.getState().notify({
          severity: 'info',
          message: basename(path) + ' opened in large file mode',
          cause:
            'The file is larger than 4 MB, where minimap, folding and bracket colouring would slow editing down.',
          solution:
            'Editing works as usual. Close and reopen the file after shrinking it to get the full feature set.'
        });
      }
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not open ' + basename(path));
    }
  },

  openFileDialog: async () => {
    try {
      const paths = await unwrap(api().dialog.openFile());
      if (!paths) return;
      for (const path of paths) await get().openFile(path);
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not open the file picker');
    }
  },

  newUntitled: () => {
    const index = get().editors.filter((editor) => editor.isUntitled).length + 1;
    const path = UNTITLED_PREFIX + createId('buffer');
    const language = detectLanguage('untitled.txt');

    getOrCreateModel(path, '', toMonacoLanguageId(language));

    const editor: OpenEditor = {
      path,
      name: 'Untitled-' + index,
      language,
      isDirty: false,
      isUntitled: true,
      isLarge: false,
      sizeBytes: 0,
      modifiedAt: Date.now(),
      viewState: null
    };
    set((state) => ({ editors: [...state.editors, editor], activePath: path }));
  },

  activate: (path) => {
    if (get().editors.some((editor) => editor.path === path)) set({ activePath: path });
  },

  close: async (path) => {
    const editor = get().editors.find((entry) => entry.path === path);
    if (!editor) return;

    if (editor.isDirty) {
      const discard = await unwrap(
        api().dialog.confirm({
          title: 'Unsaved changes',
          message: editor.name + ' has unsaved changes',
          detail: 'Closing the editor now discards them.',
          confirmLabel: 'Discard changes'
        })
      ).catch(() => false);
      if (!discard) return;
    }

    diagnosticService.clearFile(path);
    disposeModel(path);

    set((state) => {
      const remaining = state.editors.filter((entry) => entry.path !== path);
      const wasActive = state.activePath === path;
      const closedIndex = state.editors.findIndex((entry) => entry.path === path);
      // Activate the neighbour to the right, falling back to the left one.
      const next = wasActive
        ? (remaining[Math.min(closedIndex, remaining.length - 1)]?.path ?? null)
        : state.activePath;
      return { editors: remaining, activePath: next };
    });
  },

  closeAll: async () => {
    for (const editor of [...get().editors]) {
      await get().close(editor.path);
    }
  },

  markDirty: (path, isDirty) => {
    // Typing calls this on every keystroke, and all but the first say the same
    // thing. Writing anyway replaces the entry, which changes its identity and
    // re-renders everything watching it, several times a second, for no change.
    const current = get().editors.find((editor) => editor.path === path);
    if (!current || current.isDirty === isDirty) return;

    set((state) => ({
      editors: state.editors.map((editor) => (editor.path === path ? { ...editor, isDirty } : editor))
    }));
  },

  saveViewState: (path, viewState) => {
    set((state) => ({
      editors: state.editors.map((editor) => (editor.path === path ? { ...editor, viewState } : editor))
    }));
  },

  save: async (path) => {
    const targetPath = path ?? get().activePath;
    if (!targetPath) return false;

    const editor = get().editors.find((entry) => entry.path === targetPath);
    if (!editor) return false;
    if (editor.isUntitled) return get().saveAs(targetPath);

    const model = getModel(targetPath);
    if (!model) return false;

    try {
      const stat = await unwrap(api().fs.writeFile(targetPath, model.getValue()));
      set((state) => ({
        editors: state.editors.map((entry) =>
          entry.path === targetPath
            ? { ...entry, isDirty: false, sizeBytes: stat.size, modifiedAt: stat.modifiedAt }
            : entry
        )
      }));
      return true;
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not save ' + editor.name);
      return false;
    }
  },

  saveAs: async (path) => {
    const sourcePath = path ?? get().activePath;
    if (!sourcePath) return false;

    const editor = get().editors.find((entry) => entry.path === sourcePath);
    if (!editor) return false;

    try {
      const targetPath = await unwrap(api().dialog.saveFile(editor.isUntitled ? editor.name : sourcePath));
      if (!targetPath) return false;

      const content = getModel(sourcePath)?.getValue() ?? '';

      const stat = await unwrap(api().fs.writeFile(targetPath, content));
      const language = detectLanguage(targetPath, content.slice(0, 200));
      getOrCreateModel(targetPath, content, toMonacoLanguageId(language));
      disposeModel(sourcePath);

      set((state) => ({
        editors: state.editors.map((entry) =>
          entry.path === sourcePath
            ? {
                ...entry,
                path: targetPath,
                name: basename(targetPath),
                language,
                isDirty: false,
                isUntitled: false,
                sizeBytes: stat.size,
                modifiedAt: stat.modifiedAt,
                viewState: null
              }
            : entry
        ),
        activePath: state.activePath === sourcePath ? targetPath : state.activePath
      }));
      return true;
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not save ' + editor.name);
      return false;
    }
  },

  saveAll: async () => {
    for (const editor of get().editors) {
      if (editor.isDirty) await get().save(editor.path);
    }
  }
}));
