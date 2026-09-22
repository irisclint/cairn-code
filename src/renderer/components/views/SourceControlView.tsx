import type { JSX } from 'react';
import { useWorkspaceStore } from '../../store/workspace-store';

/**
 * Source control panel.
 *
 * The git command line wrapper exists in the main process
 * (src/main/services/git-cli.ts) and is exercised by the status bar. The full
 * staging and commit UI is scheduled for phase 2, so this view states that
 * plainly rather than showing controls that do nothing.
 */
export function SourceControlView(): JSX.Element {
  const rootPath = useWorkspaceStore((state) => state.rootPath);

  return (
    <div className="sidebar-view">
      <div className="sidebar-view__header">
        <h2 className="sidebar-view__title">Source Control</h2>
      </div>
      <div className="sidebar-view__empty">
        {rootPath ? (
          <>
            <p>Git integration arrives in the next milestone.</p>
            <p className="sidebar-view__hint">
              Until then, use the integrated terminal for git commands. Your own git configuration, credential
              helpers and hooks apply there exactly as they do in any other shell.
            </p>
          </>
        ) : (
          <p className="sidebar-view__hint">Open a folder to see its repository status.</p>
        )}
      </div>
    </div>
  );
}
