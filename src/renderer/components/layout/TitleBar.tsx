import { useEffect, useState, type JSX } from 'react';
import { Icon } from '../common/Icon';
import { api, hasBridge } from '../../services/api';
import { useEditorStore } from '../../store/editor-store';
import { useWorkspaceStore } from '../../store/workspace-store';
import { APP_NAME } from '@shared/constants';

const isMac = globalThis.navigator?.platform?.toLowerCase().includes('mac') ?? false;

/**
 * Custom title bar with the causeway mark, the document title and window controls.
 *
 * The native frame is hidden (see src/main/windows.ts) so the title bar can be
 * themed. Window controls are omitted on macOS, where the system draws its own
 * traffic lights into the reserved inset.
 */
export function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false);
  const activeEditor = useEditorStore((state) => state.editors.find((e) => e.path === state.activePath));
  const workspaceName = useWorkspaceStore((state) => state.name);

  useEffect(() => {
    if (!hasBridge()) return undefined;
    void api()
      .window.isMaximized()
      .then((result) => {
        if (result.ok) setIsMaximized(result.value);
      });
    return api().window.onStateChanged((state) => setIsMaximized(state.isMaximized));
  }, []);

  const documentTitle = [
    activeEditor ? (activeEditor.isDirty ? activeEditor.name + ' *' : activeEditor.name) : null,
    workspaceName,
    APP_NAME
  ]
    .filter(Boolean)
    .join(' - ');

  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);

  return (
    <header className="title-bar" data-platform={isMac ? 'mac' : 'other'}>
      <div className="title-bar__brand">
        <Icon name="logo" size={18} className="title-bar__logo" title="causeway" />
      </div>

      <div className="title-bar__title">{documentTitle}</div>

      {isMac ? null : (
        <div className="title-bar__controls">
          <button
            type="button"
            className="title-bar__control"
            aria-label="Minimize window"
            onClick={() => hasBridge() && api().window.minimize()}
          >
            <Icon name="window-minimize" size={12} />
          </button>
          <button
            type="button"
            className="title-bar__control"
            aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
            onClick={() => hasBridge() && api().window.toggleMaximize()}
          >
            <Icon name={isMaximized ? 'window-restore' : 'window-maximize'} size={12} />
          </button>
          <button
            type="button"
            className="title-bar__control title-bar__control--close"
            aria-label="Close window"
            onClick={() => hasBridge() && api().window.close()}
          >
            <Icon name="window-close" size={12} />
          </button>
        </div>
      )}
    </header>
  );
}
