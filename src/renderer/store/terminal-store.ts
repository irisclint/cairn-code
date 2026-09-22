import { create } from 'zustand';
import type { ShellDescriptor, TerminalSession } from '@shared/types';
import { api, unwrap, unwrapOr } from '../services/api';
import { useNotificationStore } from './notification-store';

export interface TerminalTab {
  session: TerminalSession;
  title: string;
  /** Set once the process exits so the tab can show the exit code. */
  exitCode: number | null;
}

/**
 * Guards against two callers starting the first terminal at once.
 *
 * Creation is asynchronous, so two synchronous callers both see an empty tab
 * list and both spawn a shell. The in-flight promise is shared instead, which
 * is cheaper and more reliable than a boolean flag that has to be cleared on
 * every failure path.
 */
let pendingFirstTerminal: Promise<string | null> | null = null;

interface TerminalState {
  tabs: TerminalTab[];
  activeId: string | null;
  shells: ShellDescriptor[];
  loadShells: () => Promise<void>;
  create: (options?: { shellId?: string; cols?: number; rows?: number }) => Promise<string | null>;
  activate: (id: string) => void;
  kill: (id: string) => void;
  killAll: () => void;
  markExited: (id: string, exitCode: number) => void;
  rename: (id: string, title: string) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeId: null,
  shells: [],

  loadShells: async () => {
    const shells = await unwrapOr(api().terminal.listShells(), []);
    set({ shells });
  },

  create: async (options = {}) => {
    // Only the first terminal is deduplicated; opening a second on purpose is
    // a deliberate act and must always work.
    if (get().tabs.length === 0 && pendingFirstTerminal) return pendingFirstTerminal;

    const started = (async () => {
      try {
        const session = await unwrap(
          api().terminal.create({
            shellId: options.shellId,
            cols: options.cols ?? 80,
            rows: options.rows ?? 24
          })
        );

        const sameShellCount = get().tabs.filter(
          (tab) => tab.session.shellLabel === session.shellLabel
        ).length;
        const title =
          sameShellCount === 0 ? session.shellLabel : session.shellLabel + ' (' + (sameShellCount + 1) + ')';

        set((state) => ({
          tabs: [...state.tabs, { session, title, exitCode: null }],
          activeId: session.id
        }));

        if (!session.hasPty) {
          useNotificationStore.getState().notify({
            severity: 'warning',
            message: 'The terminal is running without a pseudo terminal',
            cause:
              'The native node-pty module could not be loaded for this build, so the shell runs behind plain pipes.',
            solution:
              'Run "npx electron-rebuild -f -w node-pty" and restart cairn-code. Commands and their output work either way, but full-screen programs such as vim will not render.'
          });
        }

        return session.id;
      } catch (error) {
        useNotificationStore.getState().notifyError(error, 'Could not start a terminal');
        return null;
      }
    })();

    if (get().tabs.length === 0) {
      pendingFirstTerminal = started;
      void started.finally(() => {
        pendingFirstTerminal = null;
      });
    }

    return started;
  },

  activate: (id) => {
    if (get().tabs.some((tab) => tab.session.id === id)) set({ activeId: id });
  },

  kill: (id) => {
    api().terminal.dispose(id);
    set((state) => {
      const index = state.tabs.findIndex((tab) => tab.session.id === id);
      const remaining = state.tabs.filter((tab) => tab.session.id !== id);
      const wasActive = state.activeId === id;
      const next = wasActive
        ? (remaining[Math.min(index, remaining.length - 1)]?.session.id ?? null)
        : state.activeId;
      return { tabs: remaining, activeId: next };
    });
  },

  killAll: () => {
    for (const tab of get().tabs) api().terminal.dispose(tab.session.id);
    set({ tabs: [], activeId: null });
  },

  markExited: (id, exitCode) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.session.id === id ? { ...tab, exitCode } : tab))
    }));
  },

  rename: (id, title) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => (tab.session.id === id ? { ...tab, title } : tab))
    }));
  }
}));
