import { useRef, type JSX } from 'react';
import { Icon } from '../common/Icon';
import { FileIcon } from '../common/FileIcon';
import { useEditorStore } from '../../store/editor-store';
import { useWorkspaceStore } from '../../store/workspace-store';
import { relativeTo } from '@shared/utils';

/** Open editor tabs with dirty indicators and middle-click to close. */
export function EditorTabs(): JSX.Element | null {
  const editors = useEditorStore((state) => state.editors);
  const activePath = useEditorStore((state) => state.activePath);
  const activate = useEditorStore((state) => state.activate);
  const close = useEditorStore((state) => state.close);
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const listRef = useRef<HTMLDivElement>(null);

  if (editors.length === 0) return null;

  return (
    <div className="editor-tabs" role="tablist" aria-label="Open editors" ref={listRef}>
      {editors.map((editor) => {
        const isActive = editor.path === activePath;
        return (
          <div
            key={editor.path}
            role="tab"
            tabIndex={isActive ? 0 : -1}
            aria-selected={isActive}
            title={editor.isUntitled ? editor.name : relativeTo(rootPath, editor.path)}
            className={
              'editor-tab' +
              (isActive ? ' editor-tab--active' : '') +
              (editor.isDirty ? ' editor-tab--dirty' : '')
            }
            onClick={() => activate(editor.path)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                void close(editor.path);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate(editor.path);
              }
            }}
          >
            <FileIcon
              path={editor.isUntitled ? editor.name : editor.path}
              size={14}
              className="editor-tab__icon"
            />
            <span className="editor-tab__label">{editor.name}</span>
            <button
              type="button"
              className="editor-tab__close icon-button"
              aria-label={'Close ' + editor.name}
              onClick={(event) => {
                event.stopPropagation();
                void close(editor.path);
              }}
            >
              <Icon name={editor.isDirty ? 'more' : 'close'} size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
