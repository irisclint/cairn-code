import { create } from 'zustand';
import type {
  DebugConfiguration,
  DebugScope,
  DebugSessionState,
  DebugStackFrame,
  DebugVariable,
  SourceBreakpoint
} from '@shared/types';
import { api, hasBridge, unwrap } from '../services/api';
import { useNotificationStore } from './notification-store';

const INACTIVE: DebugSessionState = { status: 'inactive', threadId: null, configurationName: null };

/** One line the debuggee or the adapter wrote. */
export interface DebugLine {
  category: string;
  text: string;
}

interface DebugState {
  session: DebugSessionState;
  configurations: DebugConfiguration[];
  selected: string | null;

  frames: DebugStackFrame[];
  selectedFrameId: number | null;
  scopes: DebugScope[];
  /** Variables by their reference, so an expanded tree keeps what it loaded. */
  variables: Record<number, DebugVariable[]>;
  expanded: number[];

  /** Breakpoints by absolute file path. */
  breakpoints: Record<string, SourceBreakpoint[]>;
  output: DebugLine[];

  loadConfigurations: () => Promise<void>;
  select: (name: string) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  control: (action: 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause') => Promise<void>;

  toggleBreakpoint: (filePath: string, line: number) => Promise<void>;
  breakpointsFor: (filePath: string) => SourceBreakpoint[];

  selectFrame: (frameId: number) => Promise<void>;
  toggleVariable: (reference: number) => Promise<void>;

  /** Called once at start-up to follow the session the main process owns. */
  connect: () => () => void;
  reset: () => void;
}

/**
 * Debug session state.
 *
 * The session itself lives in the main process, because that is where the
 * adapter process is. This mirrors it: every change arrives as an event, and
 * nothing here predicts what the adapter will do next.
 */
export const useDebugStore = create<DebugState>((set, get) => ({
  session: INACTIVE,
  configurations: [],
  selected: null,
  frames: [],
  selectedFrameId: null,
  scopes: [],
  variables: {},
  expanded: [],
  breakpoints: {},
  output: [],

  reset: () =>
    set({
      session: INACTIVE,
      frames: [],
      selectedFrameId: null,
      scopes: [],
      variables: {},
      expanded: [],
      output: []
    }),

  loadConfigurations: async () => {
    if (!hasBridge()) return;

    try {
      const configurations = await unwrap(api().debug.configurations());
      set((current) => ({
        configurations,
        selected: current.selected ?? configurations[0]?.name ?? null
      }));
    } catch (error) {
      // A launch.json that cannot be parsed is worth saying out loud, since
      // the alternative is a Run button that silently does nothing.
      useNotificationStore.getState().notifyError(error);
      set({ configurations: [] });
    }
  },

  select: (name) => set({ selected: name }),

  start: async () => {
    const { configurations, selected } = get();
    const configuration = configurations.find((entry) => entry.name === selected);

    if (!configuration) {
      useNotificationStore.getState().notify({
        severity: 'warning',
        message: 'There is nothing to run',
        cause: 'No launch configuration is selected, and .vscode/launch.json defines none.',
        solution:
          'Add a configuration to .vscode/launch.json. An existing one from another editor works as it is.'
      });
      return;
    }

    set({ output: [] });
    try {
      await unwrap(api().debug.start(configuration));
    } catch (error) {
      useNotificationStore.getState().notifyError(error);
    }
  },

  stop: async () => {
    try {
      await unwrap(api().debug.stop());
    } catch (error) {
      useNotificationStore.getState().notifyError(error);
    }
  },

  control: async (action) => {
    try {
      await unwrap(api().debug.control(action));
    } catch (error) {
      useNotificationStore.getState().notifyError(error);
    }
  },

  breakpointsFor: (filePath) => get().breakpoints[filePath] ?? [],

  toggleBreakpoint: async (filePath, line) => {
    const current = get().breakpoints[filePath] ?? [];
    const next = current.some((point) => point.line === line)
      ? current.filter((point) => point.line !== line)
      : [...current, { line }].sort((a, b) => a.line - b.line);

    // Kept even when the call below fails, because a breakpoint the user set
    // should stay visible; it simply will not bind until a session starts.
    set({ breakpoints: { ...get().breakpoints, [filePath]: next } });

    if (!hasBridge()) return;
    try {
      await unwrap(api().debug.setBreakpoints(filePath, next));
    } catch (error) {
      useNotificationStore.getState().notifyError(error);
    }
  },

  selectFrame: async (frameId) => {
    set({ selectedFrameId: frameId, scopes: [], variables: {}, expanded: [] });

    try {
      const scopes = await unwrap(api().debug.scopes(frameId));
      set({ scopes });

      // The first inexpensive scope opens by itself: it is nearly always the
      // local one, and it is what anyone stopping at a breakpoint wants.
      const first = scopes.find((scope) => !scope.expensive);
      if (first) await get().toggleVariable(first.variablesReference);
    } catch (error) {
      useNotificationStore.getState().notifyError(error);
    }
  },

  toggleVariable: async (reference) => {
    const { expanded, variables } = get();

    if (expanded.includes(reference)) {
      set({ expanded: expanded.filter((entry) => entry !== reference) });
      return;
    }

    set({ expanded: [...expanded, reference] });
    if (variables[reference]) return;

    try {
      const loaded = await unwrap(api().debug.variables(reference));
      set({ variables: { ...get().variables, [reference]: loaded } });
    } catch (error) {
      useNotificationStore.getState().notifyError(error);
    }
  },

  connect: () => {
    if (!hasBridge()) return () => undefined;

    const offState = api().debug.onState((session) => {
      set({ session });

      if (session.status === 'stopped') {
        void loadStack(set, get);
        return;
      }

      // Anything that is not a stop invalidates the frames: they describe a
      // moment that has passed, and showing them would be showing a lie.
      set({ frames: [], selectedFrameId: null, scopes: [], variables: {}, expanded: [] });
    });

    const offOutput = api().debug.onOutput((line) => {
      set((current) => ({
        // Bounded, so a program that prints in a loop cannot exhaust memory.
        output: [...current.output, line].slice(-500)
      }));
    });

    return () => {
      offState();
      offOutput();
    };
  }
}));

/** Fetches the stack after a stop, and opens the top frame. */
async function loadStack(
  set: (partial: Partial<DebugState>) => void,
  get: () => DebugState
): Promise<void> {
  try {
    const frames = await unwrap(api().debug.stackTrace());
    set({ frames });
    const top = frames[0];
    if (top) await get().selectFrame(top.id);
  } catch (error) {
    useNotificationStore.getState().notifyError(error);
  }
}
