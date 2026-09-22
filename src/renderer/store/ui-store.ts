import { create } from 'zustand';
import { clamp } from '@shared/utils';

export type SidebarView =
  | 'explorer'
  | 'search'
  | 'source-control'
  | 'debug'
  | 'extensions'
  | 'settings';
export type PanelView = 'problems' | 'terminal' | 'output';
export type DialogView = 'none' | 'command-palette' | 'quick-open' | 'theme-picker' | 'about' | 'shortcuts';

export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 720;
export const MIN_PANEL_HEIGHT = 120;
export const MAX_PANEL_HEIGHT = 900;

interface UiState {
  sidebarVisible: boolean;
  sidebarView: SidebarView;
  sidebarWidth: number;

  panelVisible: boolean;
  panelView: PanelView;
  panelHeight: number;

  dialog: DialogView;
  /** Pre-filled input for the dialog that is about to open. */
  dialogQuery: string;

  statusMessage: string | null;

  toggleSidebar: () => void;
  showSidebarView: (view: SidebarView) => void;
  setSidebarWidth: (width: number) => void;

  togglePanel: () => void;
  showPanelView: (view: PanelView) => void;
  setPanelHeight: (height: number) => void;

  openDialog: (dialog: DialogView, query?: string) => void;
  closeDialog: () => void;

  setStatusMessage: (message: string | null) => void;
}

/**
 * Layout and dialog state of the workbench.
 *
 * Kept separate from the editor and workspace stores so that a panel resize
 * never re-renders the editor tree.
 */
export const useUiStore = create<UiState>((set, get) => ({
  sidebarVisible: true,
  sidebarView: 'explorer',
  sidebarWidth: 280,

  panelVisible: false,
  panelView: 'terminal',
  panelHeight: 280,

  dialog: 'none',
  dialogQuery: '',

  statusMessage: null,

  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

  showSidebarView: (view) => {
    const { sidebarView, sidebarVisible } = get();
    // Clicking the active activity bar icon collapses the sidebar, matching
    // the behaviour developers expect from the activity bar.
    if (sidebarView === view && sidebarVisible) {
      set({ sidebarVisible: false });
      return;
    }
    set({ sidebarView: view, sidebarVisible: true });
  },

  setSidebarWidth: (width) => set({ sidebarWidth: clamp(width, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH) }),

  togglePanel: () => set((state) => ({ panelVisible: !state.panelVisible })),

  showPanelView: (view) => {
    const { panelView, panelVisible } = get();
    if (panelView === view && panelVisible) {
      set({ panelVisible: false });
      return;
    }
    set({ panelView: view, panelVisible: true });
  },

  setPanelHeight: (height) => set({ panelHeight: clamp(height, MIN_PANEL_HEIGHT, MAX_PANEL_HEIGHT) }),

  openDialog: (dialog, query = '') => set({ dialog, dialogQuery: query }),
  closeDialog: () => set({ dialog: 'none', dialogQuery: '' }),

  setStatusMessage: (message) => set({ statusMessage: message })
}));
