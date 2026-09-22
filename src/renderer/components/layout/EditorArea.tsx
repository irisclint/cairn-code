import type { JSX } from 'react';
import { EditorTabs } from '../editor/EditorTabs';
import { Breadcrumbs } from '../editor/Breadcrumbs';
import { MonacoEditor } from '../editor/MonacoEditor';
import { WelcomeView } from '../editor/WelcomeView';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useEditorStore } from '../../store/editor-store';
import { useSettingsStore } from '../../store/settings-store';

/** Tab strip, breadcrumbs and the editor surface. */
export function EditorArea(): JSX.Element {
  const activeEditor = useEditorStore((state) => state.editors.find((e) => e.path === state.activePath));
  const showBreadcrumbs = useSettingsStore((state) => state.settings['workbench.showBreadcrumbs']);

  return (
    <section className="editor-area" aria-label="Editor">
      <EditorTabs />
      {activeEditor && showBreadcrumbs ? <Breadcrumbs /> : null}
      <div className="editor-area__body">
        {activeEditor ? (
          <ErrorBoundary region="editor">
            <MonacoEditor editor={activeEditor} />
          </ErrorBoundary>
        ) : (
          <WelcomeView />
        )}
      </div>
    </section>
  );
}
