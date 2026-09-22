import { useEffect, type JSX } from 'react';
import { TitleBar } from './components/layout/TitleBar';
import { ActivityBar } from './components/layout/ActivityBar';
import { SideBar } from './components/layout/SideBar';
import { EditorArea } from './components/layout/EditorArea';
import { Panel } from './components/layout/Panel';
import { StatusBar } from './components/layout/StatusBar';
import { Resizer } from './components/common/Resizer';
import { Notifications } from './components/common/Notifications';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { CommandPalette } from './components/dialogs/CommandPalette';
import { QuickOpen } from './components/dialogs/QuickOpen';
import { ThemePicker } from './components/dialogs/ThemePicker';
import { AboutDialog } from './components/dialogs/AboutDialog';
import { ShortcutsDialog } from './components/dialogs/ShortcutsDialog';

import {
  useUiStore,
  MIN_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_PANEL_HEIGHT,
  MAX_PANEL_HEIGHT
} from './store/ui-store';
import { useSettingsStore } from './store/settings-store';
import { useThemeStore } from './store/theme-store';
import { useWorkspaceStore } from './store/workspace-store';
import { useTerminalStore } from './store/terminal-store';
import { setupMonaco } from './editor/monaco-setup';
import { registerBuiltInCommands } from './services/register-commands';
import { keyboardService } from './services/keyboard-service';
import { commandService } from './services/command-service';
import { api, hasBridge } from './services/api';
import { outputChannel } from './services/output-channel';
import { offerDesktopShortcut } from './services/shortcut-prompt';

/** Loads settings, applies the theme, registers commands and key bindings. */
function useBootstrap(): boolean {
  const loaded = useSettingsStore((state) => state.loaded);
  const loadSettings = useSettingsStore((state) => state.load);
  const initializeTheme = useThemeStore((state) => state.initialize);

  useEffect(() => {
    setupMonaco();
    const disposeCommands = registerBuiltInCommands();
    const detachKeyboard = keyboardService.attach();

    keyboardService.onChordStateChange((chord) => {
      useUiStore
        .getState()
        .setStatusMessage(
          chord ? chord.toUpperCase() + ' was pressed. Waiting for the second key of the chord...' : null
        );
    });

    void loadSettings().then(() => {
      initializeTheme(useSettingsStore.getState().settings['workbench.theme']);
      outputChannel.append('cairn', 'Workbench ready');
      // Asked after the workbench is up, so the first frame is never delayed by
      // a filesystem check the user did not ask for.
      void offerDesktopShortcut();
    });

    return () => {
      disposeCommands();
      detachKeyboard();
    };
  }, [loadSettings, initializeTheme]);

  /* Native menu items dispatch through the same command registry. */
  useEffect(() => {
    if (!hasBridge()) return undefined;
    return api().menu.onCommand((commandId) => {
      void commandService.execute(commandId);
    });
  }, []);

  /* Keep the workspace store in sync with folder changes from the main process. */
  useEffect(() => {
    if (!hasBridge()) return undefined;
    return api().workspace.onChanged((info) => {
      void useWorkspaceStore.getState().syncWorkspace(info);
    });
  }, []);

  /* Terminals must be released before the window goes away. */
  useEffect(() => {
    const handler = (): void => useTerminalStore.getState().killAll();
    globalThis.addEventListener('beforeunload', handler);
    return () => globalThis.removeEventListener('beforeunload', handler);
  }, []);

  return loaded;
}

function Dialogs(): JSX.Element | null {
  const dialog = useUiStore((state) => state.dialog);

  switch (dialog) {
    case 'command-palette':
      return <CommandPalette />;
    case 'quick-open':
      return <QuickOpen />;
    case 'theme-picker':
      return <ThemePicker />;
    case 'about':
      return <AboutDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    default:
      return null;
  }
}

/** Root of the workbench. */
export function App(): JSX.Element {
  const ready = useBootstrap();

  const sidebarVisible = useUiStore((state) => state.sidebarVisible);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const setSidebarWidth = useUiStore((state) => state.setSidebarWidth);
  const panelVisible = useUiStore((state) => state.panelVisible);
  const panelHeight = useUiStore((state) => state.panelHeight);
  const setPanelHeight = useUiStore((state) => state.setPanelHeight);

  if (!ready) {
    return (
      <div className="workbench workbench--loading">
        <p className="workbench__loading-text">Starting cairn-code...</p>
      </div>
    );
  }

  return (
    <div className="workbench">
      <TitleBar />

      <div className="workbench__body">
        <ActivityBar />

        {sidebarVisible ? (
          <>
            <div className="workbench__sidebar" style={{ width: sidebarWidth }}>
              <SideBar />
            </div>
            <Resizer
              orientation="vertical"
              size={sidebarWidth}
              min={MIN_SIDEBAR_WIDTH}
              max={MAX_SIDEBAR_WIDTH}
              ariaLabel="Resize sidebar"
              onResize={setSidebarWidth}
            />
          </>
        ) : null}

        <div className="workbench__main">
          <div className="workbench__editor">
            <EditorArea />
          </div>

          {panelVisible ? (
            <>
              <Resizer
                orientation="horizontal"
                size={panelHeight}
                min={MIN_PANEL_HEIGHT}
                max={MAX_PANEL_HEIGHT}
                invert
                ariaLabel="Resize panel"
                onResize={setPanelHeight}
              />
              <div className="workbench__panel" style={{ height: panelHeight }}>
                <Panel />
              </div>
            </>
          ) : null}
        </div>
      </div>

      <StatusBar />

      <ErrorBoundary region="dialog">
        <Dialogs />
      </ErrorBoundary>
      <Notifications />
    </div>
  );
}
