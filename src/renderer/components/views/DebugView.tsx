import { useEffect, type JSX } from 'react';
import { useWorkspaceStore } from '../../store/workspace-store';
import { useDebugStore } from '../../store/debug-store';
import { useEditorStore } from '../../store/editor-store';
import { Icon } from '../common/Icon';
import { basename } from '@shared/utils';
import type { DebugScope, DebugVariable } from '@shared/types';

/**
 * Run and Debug.
 *
 * The session runs in the main process against whichever adapter the
 * workspace configures; this shows it and drives it. Nothing here predicts
 * what the adapter will do: the stack and the variables appear when it says
 * it has stopped, and disappear the moment it continues, because a stale
 * stack is worse than none.
 */
export function DebugView(): JSX.Element {
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const { session, configurations, selected, frames, selectedFrameId, scopes, breakpoints, output } =
    useDebugStore();
  const loadConfigurations = useDebugStore((state) => state.loadConfigurations);

  useEffect(() => {
    if (rootPath) void loadConfigurations();
  }, [rootPath, loadConfigurations]);

  if (!rootPath) {
    return (
      <div className="sidebar-view">
        <div className="sidebar-view__header">
          <h2 className="sidebar-view__title">Run and Debug</h2>
        </div>
        <div className="sidebar-view__empty">
          <p className="sidebar-view__hint">Open a folder to run and debug what is in it.</p>
        </div>
      </div>
    );
  }

  const running = session.status !== 'inactive';
  const stopped = session.status === 'stopped';
  const breakpointFiles = Object.entries(breakpoints).filter(([, points]) => points.length > 0);

  return (
    <div className="sidebar-view debug">
      <div className="sidebar-view__header">
        <h2 className="sidebar-view__title">Run and Debug</h2>
      </div>

      <div className="debug__launch">
        <select
          className="debug__config"
          value={selected ?? ''}
          disabled={running || configurations.length === 0}
          aria-label="Launch configuration"
          onChange={(event) => useDebugStore.getState().select(event.target.value)}
        >
          {configurations.length === 0 ? (
            <option value="">No configuration</option>
          ) : (
            configurations.map((configuration) => (
              <option key={configuration.name} value={configuration.name}>
                {configuration.name}
              </option>
            ))
          )}
        </select>

        {running ? (
          <button
            type="button"
            className="debug__action debug__action--stop"
            title="Stop the session"
            aria-label="Stop"
            onClick={() => void useDebugStore.getState().stop()}
          >
            <Icon name="stop" size={14} />
          </button>
        ) : (
          <button
            type="button"
            className="debug__action debug__action--run"
            title={
              configurations.length === 0
                ? 'Add a configuration to .vscode/launch.json first'
                : 'Start debugging'
            }
            aria-label="Start debugging"
            disabled={configurations.length === 0}
            onClick={() => void useDebugStore.getState().start()}
          >
            <Icon name="play" size={14} />
          </button>
        )}
      </div>

      {configurations.length === 0 ? (
        <p className="debug__hint">
          No launch configuration yet. causeway reads <code>.vscode/launch.json</code>, so a
          configuration you already use in another editor works here unchanged.
        </p>
      ) : null}

      {running ? (
        <div className="debug__controls" role="group" aria-label="Execution">
          <Control action="continue" icon="play" label="Continue" enabled={stopped} />
          <Control action="pause" icon="pause" label="Pause" enabled={session.status === 'running'} />
          <Control action="next" icon="step-over" label="Step over" enabled={stopped} />
          <Control action="stepIn" icon="step-into" label="Step into" enabled={stopped} />
          <Control action="stepOut" icon="step-out" label="Step out" enabled={stopped} />
          <span className="debug__status">
            {session.status === 'starting'
              ? 'Starting…'
              : stopped
                ? `Paused${session.stoppedReason ? ` on ${session.stoppedReason}` : ''}`
                : 'Running'}
          </span>
        </div>
      ) : null}

      <div className="debug__panels">
        {stopped ? (
          <section className="debug__section">
            <h3 className="debug__section-title">Call stack</h3>
            <ul className="debug__stack">
              {frames.map((frame) => (
                <li key={frame.id}>
                  <button
                    type="button"
                    className={'debug__frame' + (frame.id === selectedFrameId ? ' debug__frame--active' : '')}
                    onClick={() => {
                      void useDebugStore.getState().selectFrame(frame.id);
                      if (frame.source) void useEditorStore.getState().openFile(frame.source);
                    }}
                  >
                    <span className="debug__frame-name">{frame.name}</span>
                    <span className="debug__frame-where">
                      {frame.source ? basename(frame.source) : 'unknown'}:{frame.line}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {stopped && scopes.length > 0 ? (
          <section className="debug__section">
            <h3 className="debug__section-title">Variables</h3>
            {scopes.map((scope) => (
              <ScopeTree key={scope.variablesReference} scope={scope} />
            ))}
          </section>
        ) : null}

        <section className="debug__section">
          <h3 className="debug__section-title">
            Breakpoints
            <span className="debug__count">
              {breakpointFiles.reduce((total, [, points]) => total + points.length, 0)}
            </span>
          </h3>

          {breakpointFiles.length === 0 ? (
            <p className="debug__empty">
              None yet. Click in the gutter to the left of a line number to set one.
            </p>
          ) : (
            <ul className="debug__breakpoints">
              {breakpointFiles.flatMap(([file, points]) =>
                points.map((point) => (
                  <li key={`${file}:${point.line}`}>
                    <button
                      type="button"
                      className="debug__breakpoint"
                      onClick={() => void useEditorStore.getState().openFile(file)}
                      title={`${file}:${point.line}`}
                    >
                      <span className="debug__breakpoint-dot" />
                      <span className="debug__breakpoint-file">{basename(file)}</span>
                      <span className="debug__breakpoint-line">{point.line}</span>
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Remove the breakpoint at ${basename(file)} line ${point.line}`}
                      onClick={() => void useDebugStore.getState().toggleBreakpoint(file, point.line)}
                    >
                      <Icon name="close" size={11} />
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </section>

        {output.length > 0 ? (
          <section className="debug__section">
            <h3 className="debug__section-title">Console</h3>
            <pre className="debug__console">
              <code>
                {output.map((line, index) => (
                  <span key={index} className={'debug__line debug__line--' + line.category}>
                    {line.text}
                  </span>
                ))}
              </code>
            </pre>
          </section>
        ) : null}
      </div>
    </div>
  );
}

interface ControlProps {
  action: 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause';
  icon: string;
  label: string;
  enabled: boolean;
}

function Control({ action, icon, label, enabled }: ControlProps): JSX.Element {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      disabled={!enabled}
      onClick={() => void useDebugStore.getState().control(action)}
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

/** One scope and, when open, the variables under it. */
function ScopeTree({ scope }: { scope: DebugScope }): JSX.Element {
  const expanded = useDebugStore((state) => state.expanded);
  const variables = useDebugStore((state) => state.variables);
  const open = expanded.includes(scope.variablesReference);

  return (
    <div className="debug__scope">
      <button
        type="button"
        className="debug__scope-head"
        aria-expanded={open}
        onClick={() => void useDebugStore.getState().toggleVariable(scope.variablesReference)}
      >
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
        {scope.name}
        {scope.expensive ? <span className="debug__scope-note">slow to read</span> : null}
      </button>

      {open ? (
        <ul className="debug__variables">
          {(variables[scope.variablesReference] ?? []).map((variable) => (
            <VariableRow key={variable.name} variable={variable} depth={0} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function VariableRow({ variable, depth }: { variable: DebugVariable; depth: number }): JSX.Element {
  const expanded = useDebugStore((state) => state.expanded);
  const variables = useDebugStore((state) => state.variables);
  const hasChildren = variable.variablesReference > 0;
  const open = hasChildren && expanded.includes(variable.variablesReference);

  return (
    <li>
      <button
        type="button"
        className="debug__variable"
        style={{ paddingLeft: 10 + depth * 12 }}
        disabled={!hasChildren}
        aria-expanded={hasChildren ? open : undefined}
        onClick={() => {
          if (hasChildren) void useDebugStore.getState().toggleVariable(variable.variablesReference);
        }}
      >
        {hasChildren ? <Icon name={open ? 'chevron-down' : 'chevron-right'} size={11} /> : <span />}
        <span className="debug__variable-name">{variable.name}</span>
        <span className="debug__variable-value">{variable.value}</span>
      </button>

      {open ? (
        <ul>
          {(variables[variable.variablesReference] ?? []).map((child) => (
            <VariableRow key={child.name} variable={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
