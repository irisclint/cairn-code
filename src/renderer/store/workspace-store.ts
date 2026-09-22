import { create } from 'zustand';
import type { DirectoryEntry, FileEvent, WorkspaceInfo } from '@shared/types';
import { api, hasBridge, unwrap, unwrapOr } from '../services/api';
import { useNotificationStore } from './notification-store';
import { basename, dirname } from '@shared/utils';

/** Joins a directory and a name using the separator style of the parent path. */
export function joinPath(parentPath: string, name: string): string {
  const separator = parentPath.includes('\\') ? '\\' : '/';
  const trimmed = parentPath.endsWith(separator) ? parentPath.slice(0, -1) : parentPath;
  return trimmed + separator + name;
}

interface WorkspaceState {
  rootPath: string | null;
  name: string | null;
  /** Directory contents keyed by absolute directory path. */
  tree: Map<string, DirectoryEntry[]>;
  expanded: Set<string>;
  selectedPath: string | null;
  loading: boolean;

  openFolder: (rootPath: string) => Promise<void>;
  openFolderDialog: () => Promise<void>;
  closeFolder: () => Promise<void>;
  /**
   * Adopts a workspace that the main process reports.
   *
   * The folder can change without this store initiating it, for example from
   * the native menu or a second instance handing over a path, so the renderer
   * follows the broadcast rather than assuming it is the only opener.
   */
  syncWorkspace: (info: WorkspaceInfo) => Promise<void>;
  loadDirectory: (path: string, force?: boolean) => Promise<DirectoryEntry[]>;
  toggleExpanded: (path: string) => Promise<void>;
  select: (path: string | null) => void;
  /** Refreshes the directories touched by watcher events. */
  applyFileEvents: (events: FileEvent[]) => Promise<void>;
  createEntry: (parentPath: string, name: string, isDirectory: boolean) => Promise<string | null>;
  renameEntry: (path: string, nextName: string) => Promise<string | null>;
  deleteEntry: (path: string) => Promise<boolean>;
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  rootPath: null,
  name: null,
  tree: new Map(),
  expanded: new Set(),
  selectedPath: null,
  loading: false,

  openFolder: async (rootPath) => {
    set({ loading: true });
    try {
      const info = await unwrap(api().workspace.open(rootPath));
      set({
        rootPath: info.rootPath,
        name: info.name,
        tree: new Map(),
        expanded: new Set(info.rootPath ? [info.rootPath] : []),
        loading: false
      });
      if (info.rootPath) await get().loadDirectory(info.rootPath, true);
    } catch (error) {
      set({ loading: false });
      useNotificationStore.getState().notifyError(error, 'Could not open the folder');
    }
  },

  openFolderDialog: async () => {
    if (!hasBridge()) return;
    try {
      const selected = await unwrap(api().dialog.openFolder());
      if (selected) await get().openFolder(selected);
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not open the folder picker');
    }
  },

  syncWorkspace: async (info) => {
    if (info.rootPath === get().rootPath) return;

    if (info.rootPath === null) {
      set({ rootPath: null, name: null, tree: new Map(), expanded: new Set(), selectedPath: null });
      return;
    }

    set({
      rootPath: info.rootPath,
      name: info.name,
      tree: new Map(),
      expanded: new Set([info.rootPath]),
      selectedPath: null
    });
    await get().loadDirectory(info.rootPath, true);
  },

  closeFolder: async () => {
    try {
      await unwrap(api().workspace.close());
    } catch {
      // Closing is best effort; the renderer state is reset either way.
    }
    set({ rootPath: null, name: null, tree: new Map(), expanded: new Set(), selectedPath: null });
  },

  loadDirectory: async (path, force = false) => {
    const cached = get().tree.get(path);
    if (cached && !force) return cached;

    const entries = await unwrapOr(api().fs.readDirectory(path), []);
    set((state) => {
      const tree = new Map(state.tree);
      tree.set(path, entries);
      return { tree };
    });
    return entries;
  },

  toggleExpanded: async (path) => {
    const expanded = new Set(get().expanded);
    if (expanded.has(path)) {
      expanded.delete(path);
      set({ expanded });
      return;
    }
    expanded.add(path);
    set({ expanded });
    await get().loadDirectory(path);
  },

  select: (path) => set({ selectedPath: path }),

  applyFileEvents: async (events) => {
    const directories = new Set<string>();
    for (const event of events) {
      const parent = dirname(event.path);
      if (get().tree.has(parent)) directories.add(parent);
      if (get().tree.has(event.path)) directories.add(event.path);
    }
    for (const directory of directories) {
      await get().loadDirectory(directory, true);
    }
  },

  createEntry: async (parentPath, name, isDirectory) => {
    const target = joinPath(parentPath, name);
    try {
      const stat = isDirectory
        ? await unwrap(api().fs.createDirectory(target))
        : await unwrap(api().fs.createFile(target));
      await get().loadDirectory(parentPath, true);
      return stat.path;
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not create ' + name);
      return null;
    }
  },

  renameEntry: async (path, nextName) => {
    const parent = dirname(path);
    const target = joinPath(parent, nextName);
    try {
      const stat = await unwrap(api().fs.rename(path, target));
      await get().loadDirectory(parent, true);
      return stat.path;
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not rename ' + basename(path));
      return null;
    }
  },

  deleteEntry: async (path) => {
    const confirmed = await unwrapOr(
      api().dialog.confirm({
        title: 'Delete',
        message: 'Delete ' + basename(path) + '?',
        detail: 'This cannot be undone from within cairn-code.',
        confirmLabel: 'Delete'
      }),
      false
    );
    if (!confirmed) return false;

    try {
      await unwrap(api().fs.delete(path));
      await get().loadDirectory(dirname(path), true);
      return true;
    } catch (error) {
      useNotificationStore.getState().notifyError(error, 'Could not delete ' + basename(path));
      return false;
    }
  }
}));
