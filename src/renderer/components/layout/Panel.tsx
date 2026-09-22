import type { JSX } from 'react';
import { Icon } from '../common/Icon';
import { TerminalPanel } from '../terminal/TerminalPanel';
import { ProblemsPanel } from '../panels/ProblemsPanel';
import { OutputPanel } from '../panels/OutputPanel';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { useUiStore, type PanelView } from '../../store/ui-store';
import { useProblemCounts } from '../../hooks/useProblems';

interface PanelTab {
  view: PanelView;
  label: string;
}

const TABS: PanelTab[] = [
  { view: 'problems', label: 'Problems' },
  { view: 'terminal', label: 'Terminal' },
  { view: 'output', label: 'Output' }
];

/** Bottom panel hosting problems, terminal and output. */
export function Panel(): JSX.Element {
  const panelView = useUiStore((state) => state.panelView);
  const showPanelView = useUiStore((state) => state.showPanelView);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const counts = useProblemCounts();

  return (
    <section className="panel" aria-label="Panel">
      <div className="panel__header">
        <div className="panel__tabs" role="tablist" aria-label="Panel views">
          {TABS.map((tab) => (
            <button
              key={tab.view}
              type="button"
              role="tab"
              aria-selected={panelView === tab.view}
              className={'panel__tab' + (panelView === tab.view ? ' panel__tab--active' : '')}
              onClick={() => showPanelView(tab.view)}
            >
              {tab.label}
              {tab.view === 'problems' && counts.errors + counts.warnings > 0 ? (
                <span className="panel__badge">{counts.errors + counts.warnings}</span>
              ) : null}
            </button>
          ))}
        </div>

        <button type="button" className="icon-button" aria-label="Close panel" onClick={togglePanel}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="panel__body">
        {/* The terminal stays mounted so its shell processes and scrollback
            survive a switch to the problems or output tab. */}
        <div className="panel__pane" hidden={panelView !== 'terminal'}>
          <ErrorBoundary region="terminal panel">
            <TerminalPanel />
          </ErrorBoundary>
        </div>
        {panelView === 'problems' ? (
          <div className="panel__pane">
            <ErrorBoundary region="problems panel">
              <ProblemsPanel />
            </ErrorBoundary>
          </div>
        ) : null}
        {panelView === 'output' ? (
          <div className="panel__pane">
            <ErrorBoundary region="output panel">
              <OutputPanel />
            </ErrorBoundary>
          </div>
        ) : null}
      </div>
    </section>
  );
}
