import { useEffect, type JSX } from 'react';
import { Icon } from '../common/Icon';
import { TerminalView } from './TerminalView';
import { useTerminalStore } from '../../store/terminal-store';

/** Terminal tab strip plus the mounted terminal instances. */
export function TerminalPanel(): JSX.Element {
  const tabs = useTerminalStore((state) => state.tabs);
  const activeId = useTerminalStore((state) => state.activeId);
  const shells = useTerminalStore((state) => state.shells);
  const loadShells = useTerminalStore((state) => state.loadShells);
  const create = useTerminalStore((state) => state.create);
  const activate = useTerminalStore((state) => state.activate);
  const kill = useTerminalStore((state) => state.kill);

  useEffect(() => {
    if (shells.length === 0) void loadShells();
  }, [shells.length, loadShells]);

  /* Open the first terminal automatically when the panel is shown empty. */
  useEffect(() => {
    if (tabs.length === 0) void create();
    // Only on mount: later the user decides when to open another terminal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="terminal-panel">
      <div className="terminal-panel__tabs" role="tablist" aria-label="Terminals">
        {tabs.map((tab) => (
          <div key={tab.session.id} className="terminal-panel__tab-wrapper">
            <button
              type="button"
              role="tab"
              aria-selected={tab.session.id === activeId}
              className={
                'terminal-panel__tab' +
                (tab.session.id === activeId ? ' terminal-panel__tab--active' : '') +
                (tab.exitCode !== null ? ' terminal-panel__tab--exited' : '')
              }
              title={
                tab.session.shellLabel +
                ' (pid ' +
                tab.session.pid +
                ')' +
                (tab.exitCode !== null ? ' - exited with code ' + tab.exitCode : '')
              }
              onClick={() => activate(tab.session.id)}
            >
              <Icon name="terminal" size={13} />
              <span>{tab.title}</span>
            </button>
            <button
              type="button"
              className="icon-button terminal-panel__kill"
              aria-label={'Close ' + tab.title}
              onClick={() => kill(tab.session.id)}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}

        <div className="terminal-panel__actions">
          <button
            type="button"
            className="icon-button"
            aria-label="New Terminal"
            title="New Terminal"
            onClick={() => void create()}
          >
            <Icon name="add" size={15} />
          </button>
          {shells.length > 1 ? (
            <select
              className="terminal-panel__shell-select"
              aria-label="Start a terminal with a specific shell"
              value=""
              onChange={(event) => {
                if (event.target.value) void create({ shellId: event.target.value });
              }}
            >
              <option value="">Select shell...</option>
              {shells.map((shell) => (
                <option key={shell.id} value={shell.id}>
                  {shell.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      <div className="terminal-panel__body">
        {tabs.length === 0 ? (
          <p className="terminal-panel__empty">No terminal is running. Use the plus button to start one.</p>
        ) : (
          tabs.map((tab) => (
            <TerminalView
              key={tab.session.id}
              session={tab.session}
              isVisible={tab.session.id === activeId}
            />
          ))
        )}
      </div>
    </div>
  );
}
