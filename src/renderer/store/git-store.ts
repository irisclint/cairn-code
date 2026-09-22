import { create } from 'zustand';
import type { GitChange, GitStatus } from '@shared/types';
import { api, hasBridge, unwrap } from '../services/api';
import { useNotificationStore } from './notification-store';

const EMPTY: GitStatus = { isRepository: false, branch: null, ahead: 0, behind: 0, changes: [] };

interface GitState {
  status: GitStatus;
  branches: string[];
  /** True while a read is in flight, so the panel can avoid flickering. */
  loading: boolean;
  /** True while a write is in flight, so the buttons can be disabled. */
  busy: boolean;
  /** The path whose diff is open, with the side it was opened from. */
  openDiff: { path: string; staged: boolean; patch: string } | null;

  refresh: () => Promise<void>;
  stage: (paths: string[]) => Promise<void>;
  unstage: (paths: string[]) => Promise<void>;
  discard: (paths: string[]) => Promise<void>;
  commit: (message: string) => Promise<boolean>;
  showDiff: (path: string, staged: boolean) => Promise<void>;
  closeDiff: () => void;
  switchBranch: (name: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  reset: () => void;
}

/**
 * Source control state.
 *
 * Every write refreshes the status afterwards rather than guessing at the new
 * state. git is the authority on what is staged, and a panel that predicts it
 * will eventually disagree with the repository, which is worse than a moment
 * of latency.
 */
export const useGitStore = create<GitState>((set, get) => ({
  status: EMPTY,
  branches: [],
  loading: false,
  busy: false,
  openDiff: null,

  reset: () => set({ status: EMPTY, branches: [], openDiff: null, loading: false, busy: false }),

  refresh: async () => {
    if (!hasBridge()) return;
    set({ loading: true });

    try {
      const status = await unwrap(api().git.status());
      const branches = status.isRepository ? await unwrap(api().git.branches()) : [];
      set({ status, branches, loading: false });
    } catch {
      // Reading is allowed to fail quietly: a folder that is not a repository
      // is an ordinary state, not a problem to interrupt the user with.
      set({ status: EMPTY, branches: [], loading: false });
    }
  },

  stage: async (paths) => {
    await run(set, get, () => unwrap(api().git.stage(paths)));
  },

  unstage: async (paths) => {
    await run(set, get, () => unwrap(api().git.unstage(paths)));
  },

  discard: async (paths) => {
    await run(set, get, () => unwrap(api().git.discard(paths)));
  },

  commit: async (message) => {
    const done = await run(set, get, async () => {
      const hash = await unwrap(api().git.commit(message));
      useNotificationStore.getState().notify({
        severity: 'success',
        message: hash ? `Committed as ${hash}` : 'Committed',
        cause: 'The staged changes are now recorded in the repository.',
        solution: 'Push when you are ready to share them.'
      });
    });
    return done;
  },

  switchBranch: async (name) => {
    await run(set, get, () => unwrap(api().git.switchBranch(name)));
  },

  createBranch: async (name) => {
    await run(set, get, () => unwrap(api().git.createBranch(name)));
  },

  showDiff: async (path, staged) => {
    try {
      const patch = await unwrap(api().git.diff(path, staged));
      set({ openDiff: { path, staged, patch: patch ?? '' } });
    } catch (error) {
      useNotificationStore.getState().notifyError(error);
    }
  },

  closeDiff: () => set({ openDiff: null })
}));

/**
 * Runs a write, reports any failure and refreshes afterwards.
 *
 * Returns whether it succeeded, because the commit box needs to know before it
 * clears what the user typed. Clearing the message after a failed commit would
 * lose the one thing they cannot get back.
 */
async function run(
  set: (partial: Partial<GitState>) => void,
  get: () => GitState,
  action: () => Promise<void>
): Promise<boolean> {
  if (!hasBridge()) return false;
  set({ busy: true });

  try {
    await action();
    set({ busy: false, openDiff: null });
    await get().refresh();
    return true;
  } catch (error) {
    set({ busy: false });
    useNotificationStore.getState().notifyError(error);
    // The status is refreshed even after a failure, because a partial
    // operation may still have changed something.
    await get().refresh();
    return false;
  }
}

/** Splits changes into the two lists the panel shows. */
export function partitionChanges(changes: GitChange[]): { staged: GitChange[]; unstaged: GitChange[] } {
  return {
    staged: changes.filter((change) => change.staged),
    unstaged: changes.filter((change) => !change.staged)
  };
}
