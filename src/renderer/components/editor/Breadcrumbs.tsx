import type { JSX } from 'react';
import { Icon } from '../common/Icon';
import { useEditorStore } from '../../store/editor-store';
import { useWorkspaceStore } from '../../store/workspace-store';
import { relativeTo, toPosixPath } from '@shared/utils';

/** Path trail above the editor, showing the file's location in the workspace. */
export function Breadcrumbs(): JSX.Element | null {
  const activeEditor = useEditorStore((state) => state.editors.find((e) => e.path === state.activePath));
  const rootPath = useWorkspaceStore((state) => state.rootPath);

  if (!activeEditor) return null;
  if (activeEditor.isUntitled) {
    return (
      <nav className="breadcrumbs" aria-label="Editor location">
        <span className="breadcrumbs__segment breadcrumbs__segment--leaf">{activeEditor.name}</span>
      </nav>
    );
  }

  const segments = toPosixPath(relativeTo(rootPath, activeEditor.path))
    .split('/')
    .filter((segment) => segment.length > 0);

  return (
    <nav className="breadcrumbs" aria-label="Editor location">
      {segments.map((segment, index) => {
        const isLeaf = index === segments.length - 1;
        return (
          <span key={segment + index} className="breadcrumbs__item">
            {index > 0 ? <Icon name="chevron-right" size={12} className="breadcrumbs__separator" /> : null}
            <span className={'breadcrumbs__segment' + (isLeaf ? ' breadcrumbs__segment--leaf' : '')}>
              {segment}
            </span>
          </span>
        );
      })}
    </nav>
  );
}
