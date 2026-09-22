import type { JSX } from 'react';
import { Icon } from '../common/Icon';
import { useUiStore, type SidebarView } from '../../store/ui-store';
import { useProblemCounts } from '../../hooks/useProblems';
import { commandService } from '../../services/command-service';
import { formatKeybinding } from '../../services/keyboard-service';

interface ActivityItem {
  view: SidebarView;
  icon: string;
  label: string;
  commandId: string;
}

const ITEMS: ActivityItem[] = [
  { view: 'explorer', icon: 'explorer', label: 'Explorer', commandId: 'view.explorer' },
  { view: 'search', icon: 'search', label: 'Search', commandId: 'view.search' },
  {
    view: 'source-control',
    icon: 'source-control',
    label: 'Source Control',
    commandId: 'view.sourceControl'
  },
  { view: 'extensions', icon: 'extensions', label: 'Extensions', commandId: 'view.extensions' }
];

function tooltipFor(item: ActivityItem): string {
  const binding = commandService.get(item.commandId)?.keybinding;
  return binding ? item.label + ' (' + formatKeybinding(binding) + ')' : item.label;
}

/** Primary navigation rail on the edge of the window. */
export function ActivityBar(): JSX.Element {
  const sidebarView = useUiStore((state) => state.sidebarView);
  const sidebarVisible = useUiStore((state) => state.sidebarVisible);
  const showSidebarView = useUiStore((state) => state.showSidebarView);
  const counts = useProblemCounts();

  return (
    <nav className="activity-bar" aria-label="Primary">
      <ul className="activity-bar__list">
        {ITEMS.map((item) => {
          const isActive = sidebarVisible && sidebarView === item.view;
          return (
            <li key={item.view}>
              <button
                type="button"
                className={'activity-bar__item' + (isActive ? ' activity-bar__item--active' : '')}
                aria-label={tooltipFor(item)}
                aria-pressed={isActive}
                title={tooltipFor(item)}
                onClick={() => showSidebarView(item.view)}
              >
                <Icon name={item.icon} size={22} />
                {item.view === 'source-control' && counts.errors > 0 ? (
                  <span className="activity-bar__badge">{counts.errors}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <ul className="activity-bar__list activity-bar__list--bottom">
        <li>
          <button
            type="button"
            className={
              'activity-bar__item' +
              (sidebarVisible && sidebarView === 'settings' ? ' activity-bar__item--active' : '')
            }
            aria-label="Settings"
            title="Settings"
            onClick={() => showSidebarView('settings')}
          >
            <Icon name="settings" size={22} />
          </button>
        </li>
      </ul>
    </nav>
  );
}
