import { useEffect, useState, type JSX } from 'react';
import { Icon } from '../common/Icon';
import { useEditorStore } from '../../store/editor-store';
import { useWorkspaceStore } from '../../store/workspace-store';
import { useUiStore } from '../../store/ui-store';
import { useThemeStore } from '../../store/theme-store';
import { useSettingsStore } from '../../store/settings-store';
import { useProblemCounts } from '../../hooks/useProblems';
import { getActiveEditor } from '../../services/register-commands';
import { commandService } from '../../services/command-service';

interface CursorPosition {
  lineNumber: number;
  column: number;
  selectedCharacters: number;
}

/** Tracks the caret of the focused editor for the position indicator. */
function useCursorPosition(activePath: string | null): CursorPosition | null {
  const [position, setPosition] = useState<CursorPosition | null>(null);

  useEffect(() => {
    const editor = getActiveEditor();
    if (!editor) {
      setPosition(null);
      return undefined;
    }

    const update = (): void => {
      const selection = editor.getSelection();
      const caret = editor.getPosition();
      if (!caret) return;
      const model = editor.getModel();
      const selectedCharacters =
        selection && model && !selection.isEmpty() ? model.getValueInRange(selection).length : 0;
      setPosition({ lineNumber: caret.lineNumber, column: caret.column, selectedCharacters });
    };

    update();
    const cursorListener = editor.onDidChangeCursorPosition(update);
    const selectionListener = editor.onDidChangeCursorSelection(update);
    return () => {
      cursorListener.dispose();
      selectionListener.dispose();
    };
  }, [activePath]);

  return position;
}

/** Bottom status bar: workspace, problems, cursor, language and theme. */
export function StatusBar(): JSX.Element {
  const activeEditor = useEditorStore((state) => state.editors.find((e) => e.path === state.activePath));
  const activePath = useEditorStore((state) => state.activePath);
  const workspaceName = useWorkspaceStore((state) => state.name);
  const statusMessage = useUiStore((state) => state.statusMessage);
  const showPanelView = useUiStore((state) => state.showPanelView);
  const openDialog = useUiStore((state) => state.openDialog);
  const currentTheme = useThemeStore((state) => state.currentTheme);
  const counts = useProblemCounts();
  const position = useCursorPosition(activePath);

  const settings = useSettingsStore((state) => state.settings);
  const indentLabel = activeEditor
    ? (settings['editor.insertSpaces'] ? 'Spaces: ' : 'Tab Size: ') + settings['editor.tabSize']
    : null;

  return (
    <footer className="status-bar" data-no-folder={workspaceName ? undefined : 'true'}>
      <div className="status-bar__group status-bar__group--left">
        <button
          type="button"
          className="status-bar__item"
          title={workspaceName ? 'Open a different folder' : 'Open a folder'}
          onClick={() => void commandService.execute('file.openFolder')}
        >
          <Icon name="folder" size={13} />
          <span>{workspaceName ?? 'No Folder Opened'}</span>
        </button>

        <button
          type="button"
          className="status-bar__item"
          title="Show Problems"
          onClick={() => showPanelView('problems')}
        >
          <Icon name="error" size={13} />
          <span>{counts.errors}</span>
          <Icon name="warning" size={13} />
          <span>{counts.warnings}</span>
        </button>

        {statusMessage ? <span className="status-bar__item status-bar__message">{statusMessage}</span> : null}
      </div>

      <div className="status-bar__group status-bar__group--right">
        {position ? (
          <button
            type="button"
            className="status-bar__item"
            title="Go to Line/Column"
            onClick={() => void commandService.execute('navigate.goToLine')}
          >
            <span>
              Ln {position.lineNumber}, Col {position.column}
              {position.selectedCharacters > 0 ? ' (' + position.selectedCharacters + ' selected)' : ''}
            </span>
          </button>
        ) : null}

        {indentLabel ? <span className="status-bar__item">{indentLabel}</span> : null}

        {activeEditor ? (
          <span className="status-bar__item" title="Detected language">
            {activeEditor.language.label}
          </span>
        ) : null}

        <button
          type="button"
          className="status-bar__item"
          title="Select Color Theme"
          onClick={() => openDialog('theme-picker')}
        >
          <span>{currentTheme?.name ?? 'Theme'}</span>
        </button>

        <button
          type="button"
          className="status-bar__item"
          title="Toggle Terminal"
          onClick={() => void commandService.execute('view.toggleTerminal')}
        >
          <Icon name="terminal" size={13} />
        </button>
      </div>
    </footer>
  );
}
