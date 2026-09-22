import { useEffect, useRef, type JSX } from 'react';
import * as monaco from 'monaco-editor';
import { useEditorStore, type OpenEditor } from '../../store/editor-store';
import { useSettingsStore } from '../../store/settings-store';
import { useThemeStore } from '../../store/theme-store';
import { buildEditorOptions, createEditor, getModel } from '../../editor/create-editor';
import { forgetLint, scheduleLint } from '../../services/lint-client';
import { diagnosticService } from '../../services/diagnostic-service';
import { setActiveEditor } from '../../services/register-commands';
import { debounce } from '@shared/utils';
import { LINT_DEBOUNCE_MS } from '@shared/constants';

export interface MonacoEditorProps {
  editor: OpenEditor;
}

/**
 * Hosts the Monaco instance.
 *
 * Exactly one Monaco instance exists for the whole application; switching tabs
 * swaps the model and restores the saved view state. Creating one editor per
 * tab would multiply the memory cost of the view zones and decorations, which
 * is the single largest contributor to renderer memory in an editor this size.
 */
export function MonacoEditor({ editor }: MonacoEditorProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const currentPathRef = useRef<string | null>(null);

  const settings = useSettingsStore((state) => state.settings);
  const themeId = useThemeStore((state) => state.currentThemeId);
  const markDirty = useEditorStore((state) => state.markDirty);
  const saveViewState = useEditorStore((state) => state.saveViewState);

  /* Create the instance once. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container || instanceRef.current) return undefined;

    const instance = createEditor({
      container,
      settings: useSettingsStore.getState().settings,
      themeId: useThemeStore.getState().currentThemeId,
      isLargeFile: editor.isLarge
    });

    instanceRef.current = instance;
    setActiveEditor(instance);

    return () => {
      setActiveEditor(null);
      instance.dispose();
      instanceRef.current = null;
    };
    // The instance is intentionally created once and reused for every tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Swap the model when the active tab changes. */
  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return undefined;

    const previousPath = currentPathRef.current;
    if (previousPath && previousPath !== editor.path) {
      saveViewState(previousPath, instance.saveViewState());
    }

    const model = getModel(editor.path);
    if (!model) return undefined;

    instance.setModel(model);
    currentPathRef.current = editor.path;

    const storedViewState = useEditorStore
      .getState()
      .editors.find((entry) => entry.path === editor.path)?.viewState;
    if (storedViewState) instance.restoreViewState(storedViewState);
    instance.focus();

    // Monaco's language workers publish markers asynchronously, so the import
    // is debounced and also runs on the marker change event.
    const refreshDiagnostics = debounce(() => {
      diagnosticService.importMonacoMarkers(model);
    }, LINT_DEBOUNCE_MS);

    // ESLint runs in the main process against the workspace configuration, so
    // it only applies to files that actually live in the opened folder. An
    // untitled buffer has no path to resolve a configuration from.
    const lintable = model.uri.scheme === 'file';
    const requestLint = (): void => {
      if (lintable) scheduleLint(model.uri.fsPath, model.getValue(), model.getLanguageId());
    };

    const contentListener = model.onDidChangeContent(() => {
      markDirty(editor.path, true);
      refreshDiagnostics();
      requestLint();
    });

    const markerListener = monaco.editor.onDidChangeMarkers((uris) => {
      if (uris.some((uri) => uri.toString() === model.uri.toString())) refreshDiagnostics();
    });

    refreshDiagnostics();
    requestLint();

    return () => {
      contentListener.dispose();
      markerListener.dispose();
      refreshDiagnostics.cancel();
      if (lintable) forgetLint(model.uri.fsPath);
      if (instanceRef.current) saveViewState(editor.path, instanceRef.current.saveViewState());
    };
  }, [editor.path, editor.isLarge, markDirty, saveViewState, editor]);

  /* Re-apply options when settings or the theme change. */
  useEffect(() => {
    instanceRef.current?.updateOptions(buildEditorOptions(settings, themeId, editor.isLarge));
  }, [settings, themeId, editor.isLarge]);

  return <div className="monaco-host" ref={containerRef} data-testid="monaco-host" />;
}
