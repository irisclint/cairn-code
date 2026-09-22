import { useEffect, useMemo, useState, type JSX } from 'react';
import { QuickPickDialog, type QuickPickItem } from './QuickPickDialog';
import { useUiStore } from '../../store/ui-store';
import { useWorkspaceStore } from '../../store/workspace-store';
import { useEditorStore } from '../../store/editor-store';
import { api, unwrapOr } from '../../services/api';
import { basename, dirname, relativeTo, debounce, fuzzyScore } from '@shared/utils';

/** Debounce before a keystroke triggers a workspace file scan. */
const SEARCH_DEBOUNCE_MS = 120;

/** Jump to any file in the workspace by fuzzy matching its path. */
export function QuickOpen(): JSX.Element {
  const closeDialog = useUiStore((state) => state.closeDialog);
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const openFile = useEditorStore((state) => state.openFile);
  const openEditors = useEditorStore((state) => state.editors);

  const [query, setQuery] = useState('');
  const [paths, setPaths] = useState<string[]>([]);

  /* Ask the main process for matching paths as the query changes. */
  useEffect(() => {
    if (!rootPath) {
      setPaths([]);
      return undefined;
    }

    const search = debounce((value: string) => {
      void unwrapOr(api().search.fileNames(value, 100), []).then(setPaths);
    }, SEARCH_DEBOUNCE_MS);

    search(query);
    return () => search.cancel();
  }, [query, rootPath]);

  const items: QuickPickItem[] = useMemo(() => {
    // With no folder open, the palette still lists the currently open editors
    // so the shortcut remains useful for single-file sessions.
    if (!rootPath) {
      const matches: QuickPickItem[] = [];
      for (const editor of openEditors) {
        const result = fuzzyScore(query, editor.name);
        if (query.length > 0 && !result) continue;
        matches.push({
          id: editor.path,
          label: editor.name,
          matchIndices: result?.indices,
          description: editor.isUntitled ? 'unsaved' : dirname(editor.path)
        });
      }
      return matches;
    }

    return paths.map((path) => {
      const name = basename(path);
      const result = fuzzyScore(query, name);
      return {
        id: path,
        label: name,
        matchIndices: result?.indices,
        description: relativeTo(rootPath, dirname(path))
      };
    });
  }, [paths, query, rootPath, openEditors]);

  return (
    <QuickPickDialog
      title="Go to File"
      placeholder={rootPath ? 'Search files by name' : 'Search open editors'}
      query={query}
      onQueryChange={setQuery}
      items={items}
      emptyMessage={rootPath ? 'No file matches this search' : 'Open a folder to search all files'}
      onAccept={(item) => {
        closeDialog();
        void openFile(item.id);
      }}
      onClose={closeDialog}
    />
  );
}
