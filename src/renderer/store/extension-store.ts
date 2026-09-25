import { create } from 'zustand';
import type { InstalledExtension, MarketplaceEntry } from '@shared/types';
import { api, ApiError, hasBridge, unwrap } from '../services/api';
import { useNotificationStore } from './notification-store';

interface ExtensionState {
  installed: InstalledExtension[];
  catalogue: MarketplaceEntry[];
  /** Why the catalogue is empty, when it is. */
  catalogueProblem: { message: string; cause: string; solution: string } | null;
  loading: boolean;
  busy: string | null;

  refresh: () => Promise<void>;
  browse: () => Promise<void>;
  install: (entry: MarketplaceEntry) => Promise<void>;
  setEnabled: (id: string, enabled: boolean) => Promise<void>;
  uninstall: (id: string) => Promise<void>;
  run: (extensionId: string, commandId: string) => Promise<void>;
  connect: () => () => void;
}

/**
 * What is installed, and what a registry offers.
 *
 * The catalogue is fetched only when the user opens the marketplace or asks
 * for it again. Nothing here runs on start-up, which is what keeps the promise
 * that the update check is the only request the editor makes on its own.
 */
export const useExtensionStore = create<ExtensionState>((set, get) => ({
  installed: [],
  catalogue: [],
  catalogueProblem: null,
  loading: false,
  busy: null,

  refresh: async () => {
    if (!hasBridge()) return;
    set({ loading: true });

    try {
      set({ installed: await unwrap(api().extensions.list()), loading: false });
    } catch (error) {
      set({ loading: false });
      useNotificationStore.getState().notifyError(error);
    }
  },

  browse: async () => {
    if (!hasBridge()) return;
    set({ loading: true, catalogueProblem: null });

    try {
      set({ catalogue: await unwrap(api().extensions.marketplace()), loading: false });
    } catch (error) {
      // Shown in the panel rather than as a notification: an empty catalogue
      // needs its explanation where the emptiness is, not in a toast that
      // disappears.
      const failure =
        error instanceof ApiError
          ? { message: error.message, cause: error.cause, solution: error.solution }
          : { message: 'The catalogue could not be read', cause: String(error), solution: 'Try again.' };

      set({ catalogue: [], catalogueProblem: failure, loading: false });
    }
  },

  install: async (entry) => {
    await act(set, get, entry.id, async () => {
      await unwrap(api().extensions.install(entry));
      useNotificationStore.getState().notify({
        severity: 'success',
        message: `${entry.name} is installed`,
        cause: `It was downloaded from the registry and its contents matched the hash the catalogue listed.`,
        solution: 'Its commands are in the Command Palette. Disable it any time from this panel.'
      });
    });
  },

  setEnabled: async (id, enabled) => {
    await act(set, get, id, () => unwrap(api().extensions.setEnabled(id, enabled)));
  },

  uninstall: async (id) => {
    await act(set, get, id, () => unwrap(api().extensions.uninstall(id)));
  },

  run: async (extensionId, commandId) => {
    try {
      await unwrap(api().extensions.invokeCommand(extensionId, commandId));
    } catch (error) {
      useNotificationStore.getState().notifyError(error);
    }
  },

  connect: () => {
    if (!hasBridge()) return () => undefined;

    return api().extensions.onChanged((change) => {
      const record = change as Record<string, unknown>;

      if (record['kind'] === 'notify') {
        const notification = record['notification'] as Record<string, string>;
        useNotificationStore.getState().notify({
          severity: 'info',
          message: notification['message'] ?? '',
          cause: notification['cause'] ?? '',
          solution: notification['solution'] ?? ''
        });
        return;
      }

      if (record['kind'] === 'failed') {
        useNotificationStore.getState().notify({
          severity: 'warning',
          message: `${String(record['id'])} stopped`,
          cause: String(record['message'] ?? ''),
          solution: 'Disable it in the Extensions panel, and report the message to whoever published it.'
        });
      }

      // A command registration or a failure both change what the panel should
      // show, so the list is read again rather than patched here.
      void get().refresh();
    });
  }
}));

/** Runs one action against one extension, then refreshes what is installed. */
async function act(
  set: (partial: Partial<ExtensionState>) => void,
  get: () => ExtensionState,
  id: string,
  action: () => Promise<void>
): Promise<void> {
  set({ busy: id });

  try {
    await action();
  } catch (error) {
    useNotificationStore.getState().notifyError(error);
  } finally {
    set({ busy: null });
    await get().refresh();
  }
}
