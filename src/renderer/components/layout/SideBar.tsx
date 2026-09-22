import type { JSX } from 'react';
import { ExplorerView } from '../views/ExplorerView';
import { SearchView } from '../views/SearchView';
import { SourceControlView } from '../views/SourceControlView';
import { DebugView } from '../views/DebugView';
import { ExtensionsView } from '../views/ExtensionsView';
import { SettingsView } from '../views/SettingsView';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useUiStore, type SidebarView } from '../../store/ui-store';

const VIEWS: Record<SidebarView, () => JSX.Element> = {
  explorer: ExplorerView,
  search: SearchView,
  'source-control': SourceControlView,
  debug: DebugView,
  extensions: ExtensionsView,
  settings: SettingsView
};

/** Hosts whichever sidebar view the activity bar selected. */
export function SideBar(): JSX.Element {
  const sidebarView = useUiStore((state) => state.sidebarView);
  const View = VIEWS[sidebarView];

  return (
    <aside className="sidebar" aria-label="Side bar">
      <ErrorBoundary region={sidebarView.replace('-', ' ') + ' view'}>
        <View />
      </ErrorBoundary>
    </aside>
  );
}
