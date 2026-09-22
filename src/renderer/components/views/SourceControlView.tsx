import { useEffect, useMemo, useState, type JSX } from 'react';
import { useWorkspaceStore } from '../../store/workspace-store';
import { partitionChanges, useGitStore } from '../../store/git-store';
import { Icon } from '../common/Icon';
import type { GitChange } from '@shared/types';

/**
 * Source control panel.
 *
 * Reads and writes through the git command line in the main process, so the
 * user's own configuration, credential helpers, hooks and signing keys apply
 * exactly as they do in a terminal.
 */
export function SourceControlView(): JSX.Element {
  const rootPath = useWorkspaceStore((state) => state.rootPath);
  const { status, branches, busy, openDiff } = useGitStore();
  const refresh = useGitStore((state) => state.refresh);
  const reset = useGitStore((state) => state.reset);

  const [message, setMessage] = useState('');
  const [branchOpen, setBranchOpen] = useState(false);

  useEffect(() => {
    if (!rootPath) {
      reset();
      return;
    }

    void refresh();
    // Polling rather than watching: git changes from the terminal, from a
    // rebase, and from other tools, and no single watcher catches all of it.
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [rootPath, refresh, reset]);

  const { staged, unstaged } = useMemo(() => partitionChanges(status.changes), [status.changes]);

  if (!rootPath) {
    return (
      <Shell>
        <p className="sidebar-view__hint">Open a folder to see its repository status.</p>
      </Shell>
    );
  }

  if (!status.isRepository) {
    return (
      <Shell>
        <p>This folder is not a git repository.</p>
        <p className="sidebar-view__hint">
          Run <code>git init</code> in the integrated terminal to start tracking it, then this panel fills
          in by itself.
        </p>
      </Shell>
    );
  }

  return (
    <div className="sidebar-view scm">
      <div className="sidebar-view__header">
        <h2 className="sidebar-view__title">Source Control</h2>
        <button
          type="button"
          className="icon-button"
          title="Refresh"
          aria-label="Refresh source control"
          onClick={() => void refresh()}
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>

      <BranchBar
        branch={status.branch}
        branches={branches}
        ahead={status.ahead}
        behind={status.behind}
        open={branchOpen}
        busy={busy}
        onToggle={() => setBranchOpen((value) => !value)}
        onClose={() => setBranchOpen(false)}
      />

      <form
        className="scm__commit"
        onSubmit={(event) => {
          event.preventDefault();
          void useGitStore
            .getState()
            .commit(message)
            .then((ok) => {
              // Only clear on success: a rejected message is the one thing the
              // user cannot retype from memory.
              if (ok) setMessage('');
            });
        }}
      >
        <textarea
          className="scm__message"
          placeholder="Message (what the change does, and why)"
          value={message}
          rows={2}
          onChange={(event) => setMessage(event.target.value)}
          aria-label="Commit message"
        />
        <button
          type="submit"
          className="scm__commit-button"
          disabled={busy || staged.length === 0 || message.trim().length === 0}
          title={
            staged.length === 0
              ? 'Stage something first: a commit records what is in the index'
              : 'Commit the staged changes'
          }
        >
          <Icon name="check" size={14} />
          Commit {staged.length > 0 ? `${staged.length} file${staged.length === 1 ? '' : 's'}` : ''}
        </button>
      </form>

      <div className="scm__lists">
        <ChangeGroup
          title="Staged Changes"
          changes={staged}
          empty="Nothing staged yet."
          actions={[
            { icon: 'minus', label: 'Unstage', run: (paths) => void useGitStore.getState().unstage(paths) }
          ]}
          busy={busy}
        />

        <ChangeGroup
          title="Changes"
          changes={unstaged}
          empty="No changes in the working tree."
          actions={[
            { icon: 'add', label: 'Stage', run: (paths) => void useGitStore.getState().stage(paths) },
            {
              icon: 'discard',
              label: 'Discard',
              destructive: true,
              run: (paths) => void useGitStore.getState().discard(paths)
            }
          ]}
          busy={busy}
        />
      </div>

      {openDiff ? <DiffView /> : null}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="sidebar-view">
      <div className="sidebar-view__header">
        <h2 className="sidebar-view__title">Source Control</h2>
      </div>
      <div className="sidebar-view__empty">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Branches                                                                    */
/* -------------------------------------------------------------------------- */

interface BranchBarProps {
  branch: string | null;
  branches: string[];
  ahead: number;
  behind: number;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onClose: () => void;
}

function BranchBar(props: BranchBarProps): JSX.Element {
  const [creating, setCreating] = useState('');

  return (
    <div className="scm__branch">
      <button
        type="button"
        className="scm__branch-current"
        onClick={props.onToggle}
        aria-expanded={props.open}
        disabled={props.busy}
      >
        <Icon name="branch" size={13} />
        <span className="scm__branch-name">{props.branch ?? 'detached HEAD'}</span>
        {props.ahead > 0 ? <span className="scm__count" title="Commits to push">↑{props.ahead}</span> : null}
        {props.behind > 0 ? <span className="scm__count" title="Commits to pull">↓{props.behind}</span> : null}
      </button>

      {props.open ? (
        <div className="scm__branch-menu">
          <ul>
            {props.branches.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className={'scm__branch-item' + (name === props.branch ? ' scm__branch-item--active' : '')}
                  disabled={name === props.branch}
                  onClick={() => {
                    props.onClose();
                    void useGitStore.getState().switchBranch(name);
                  }}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>

          <form
            className="scm__branch-create"
            onSubmit={(event) => {
              event.preventDefault();
              const name = creating.trim();
              if (name.length === 0) return;
              setCreating('');
              props.onClose();
              void useGitStore.getState().createBranch(name);
            }}
          >
            <input
              value={creating}
              onChange={(event) => setCreating(event.target.value)}
              placeholder="New branch name"
              aria-label="New branch name"
            />
            <button type="submit" disabled={creating.trim().length === 0}>
              Create
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Change lists                                                                */
/* -------------------------------------------------------------------------- */

interface GroupAction {
  icon: string;
  label: string;
  destructive?: boolean;
  run: (paths: string[]) => void;
}

interface ChangeGroupProps {
  title: string;
  changes: GitChange[];
  empty: string;
  actions: GroupAction[];
  busy: boolean;
}

const STATUS_LETTER: Record<GitChange['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflicted: '!'
};

function ChangeGroup({ title, changes, empty, actions, busy }: ChangeGroupProps): JSX.Element {
  const openDiff = useGitStore((state) => state.openDiff);
  const staged = title.startsWith('Staged');

  return (
    <section className="scm__group">
      <header className="scm__group-head">
        <h3>{title}</h3>
        <span className="scm__group-count">{changes.length}</span>
        {changes.length > 0 ? (
          <span className="scm__group-actions">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={'icon-button' + (action.destructive ? ' icon-button--danger' : '')}
                title={`${action.label} all`}
                aria-label={`${action.label} all files`}
                disabled={busy}
                onClick={() => action.run(changes.map((change) => change.path))}
              >
                <Icon name={action.icon} size={13} />
              </button>
            ))}
          </span>
        ) : null}
      </header>

      {changes.length === 0 ? (
        <p className="scm__group-empty">{empty}</p>
      ) : (
        <ul className="scm__files">
          {changes.map((change) => {
            const isOpen = openDiff?.path === change.path && openDiff.staged === staged;

            return (
              <li key={`${change.path}-${change.staged}`}>
                <button
                  type="button"
                  className={'scm__file' + (isOpen ? ' scm__file--open' : '')}
                  onClick={() => void useGitStore.getState().showDiff(change.path, staged)}
                  title={`${change.path} — click to see the diff`}
                >
                  <span className={'scm__status scm__status--' + change.status}>
                    {STATUS_LETTER[change.status]}
                  </span>
                  <span className="scm__file-name">{change.path}</span>
                </button>

                <span className="scm__file-actions">
                  {actions.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      className={'icon-button' + (action.destructive ? ' icon-button--danger' : '')}
                      title={action.label}
                      aria-label={`${action.label} ${change.path}`}
                      disabled={busy}
                      onClick={() => action.run([change.path])}
                    >
                      <Icon name={action.icon} size={12} />
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Diff                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A unified diff, rendered line by line.
 *
 * Deliberately not a side-by-side view in a 300 pixel sidebar: at this width
 * two columns show about six characters each, which is worse than no diff.
 */
function DiffView(): JSX.Element | null {
  const openDiff = useGitStore((state) => state.openDiff);
  const closeDiff = useGitStore((state) => state.closeDiff);
  if (!openDiff) return null;

  const lines = openDiff.patch.split('\n');

  return (
    <div className="scm__diff">
      <header className="scm__diff-head">
        <span className="scm__diff-title">
          {openDiff.path}
          <span className="scm__diff-side">{openDiff.staged ? 'staged' : 'working tree'}</span>
        </span>
        <button type="button" className="icon-button" onClick={closeDiff} aria-label="Close the diff">
          <Icon name="close" size={13} />
        </button>
      </header>

      {openDiff.patch.trim().length === 0 ? (
        <p className="scm__group-empty">
          git reports no textual difference. That happens for a mode change, or for a file git treats as
          binary.
        </p>
      ) : (
        <pre className="scm__diff-body">
          <code>
            {lines.map((line, index) => (
              <span key={index} className={'scm__diff-line ' + diffClass(line)}>
                {line || ' '}
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      )}
    </div>
  );
}

function diffClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'scm__diff-line--file';
  if (line.startsWith('@@')) return 'scm__diff-line--hunk';
  if (line.startsWith('+')) return 'scm__diff-line--add';
  if (line.startsWith('-')) return 'scm__diff-line--remove';
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'scm__diff-line--meta';
  return '';
}
