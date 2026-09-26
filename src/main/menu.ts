import { Menu, shell, app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { IpcChannel } from '@shared/ipc-channels';
import { APP_NAME } from '@shared/constants';

/**
 * Command identifiers the native menu forwards to the renderer.
 *
 * The renderer owns all editor behaviour, so the menu never acts directly; it
 * dispatches a command id that the command service resolves. This keeps a menu
 * entry and its Command Palette twin on exactly one implementation.
 */
export const MenuCommand = {
  FileNew: 'file.new',
  FileOpen: 'file.open',
  FileOpenFolder: 'file.openFolder',
  FileSave: 'file.save',
  FileSaveAs: 'file.saveAs',
  FileSaveAll: 'file.saveAll',
  FileCloseEditor: 'file.closeEditor',
  FileCloseFolder: 'file.closeFolder',
  EditFind: 'edit.find',
  EditReplace: 'edit.replace',
  EditFormatDocument: 'edit.formatDocument',
  EditToggleLineComment: 'edit.toggleLineComment',
  ViewCommandPalette: 'view.commandPalette',
  ViewQuickOpen: 'view.quickOpen',
  ViewToggleSidebar: 'view.toggleSidebar',
  ViewTogglePanel: 'view.togglePanel',
  ViewToggleTerminal: 'view.toggleTerminal',
  ViewExplorer: 'view.explorer',
  ViewSearch: 'view.search',
  ViewSourceControl: 'view.sourceControl',
  ViewProblems: 'view.problems',
  ViewSettings: 'view.settings',
  ViewThemePicker: 'view.themePicker',
  ViewZoomIn: 'view.zoomIn',
  ViewZoomOut: 'view.zoomOut',
  ViewZoomReset: 'view.zoomReset',
  TerminalNew: 'terminal.new',
  TerminalKill: 'terminal.kill',
  HelpKeyboardShortcuts: 'help.keyboardShortcuts',
  HelpAbout: 'help.about',
  HelpCheckForUpdates: 'help.checkForUpdates'
} as const;

export type MenuCommandId = (typeof MenuCommand)[keyof typeof MenuCommand];

const isMac = process.platform === 'darwin';

function send(window: BrowserWindow | null, command: MenuCommandId): void {
  window?.webContents.send(IpcChannel.MenuCommand, command);
}

/*
 * Two key sequences in the native menu.
 *
 * Electron's accelerator parser takes a single chord: "Ctrl+K Ctrl+O" is not
 * invalid syntax it happens to reject, it is a shape it has no representation
 * for. Passing one makes it log two warnings per binding at every launch and
 * register nothing, so the menu item ends up with no shortcut and the user is
 * told nothing.
 *
 * These sequences do work. They are implemented in the renderer's keyboard
 * service, which holds the prefix and waits for the second key. So the menu
 * spells them in the label and leaves the accelerator off, which is honest
 * about what the native menu is doing and keeps the launch log clean.
 */
function chordLabel(label: string, chord: string): string {
  return `${label}	${chord}`;
}

export function buildApplicationMenu(getWindow: () => BrowserWindow | null): Menu {
  const dispatch = (command: MenuCommandId) => (): void => send(getWindow(), command);

  const macAppMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: APP_NAME,
          submenu: [
            { label: `About ${APP_NAME}`, click: dispatch(MenuCommand.HelpAbout) },
            { label: 'Check for Updates', click: dispatch(MenuCommand.HelpCheckForUpdates) },
            { type: 'separator' },
            { label: 'Settings', accelerator: 'Cmd+,', click: dispatch(MenuCommand.ViewSettings) },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }
      ]
    : [];

  const template: MenuItemConstructorOptions[] = [
    ...macAppMenu,
    {
      label: 'File',
      submenu: [
        { label: 'New File', accelerator: 'CmdOrCtrl+N', click: dispatch(MenuCommand.FileNew) },
        { label: 'Open File...', accelerator: 'CmdOrCtrl+O', click: dispatch(MenuCommand.FileOpen) },
        {
          // A chord, so it carries no accelerator. See the note below.
          label: chordLabel('Open Folder...', 'Ctrl+K Ctrl+O'),
          click: dispatch(MenuCommand.FileOpenFolder)
        },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: dispatch(MenuCommand.FileSave) },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: dispatch(MenuCommand.FileSaveAs) },
        { label: chordLabel('Save All', 'Ctrl+K S'), click: dispatch(MenuCommand.FileSaveAll) },
        { type: 'separator' },
        { label: 'Close Editor', accelerator: 'CmdOrCtrl+W', click: dispatch(MenuCommand.FileCloseEditor) },
        { label: 'Close Folder', click: dispatch(MenuCommand.FileCloseFolder) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit', label: 'Exit', accelerator: 'CmdOrCtrl+Q' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: dispatch(MenuCommand.EditFind) },
        { label: 'Replace', accelerator: 'CmdOrCtrl+H', click: dispatch(MenuCommand.EditReplace) },
        { type: 'separator' },
        {
          label: 'Toggle Line Comment',
          accelerator: 'CmdOrCtrl+/',
          click: dispatch(MenuCommand.EditToggleLineComment)
        },
        {
          label: 'Format Document',
          accelerator: 'Shift+Alt+F',
          click: dispatch(MenuCommand.EditFormatDocument)
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette...',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: dispatch(MenuCommand.ViewCommandPalette)
        },
        { label: 'Go to File...', accelerator: 'CmdOrCtrl+P', click: dispatch(MenuCommand.ViewQuickOpen) },
        { type: 'separator' },
        { label: 'Explorer', accelerator: 'CmdOrCtrl+Shift+E', click: dispatch(MenuCommand.ViewExplorer) },
        { label: 'Search', accelerator: 'CmdOrCtrl+Shift+F', click: dispatch(MenuCommand.ViewSearch) },
        {
          label: 'Source Control',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: dispatch(MenuCommand.ViewSourceControl)
        },
        { label: 'Problems', accelerator: 'CmdOrCtrl+Shift+M', click: dispatch(MenuCommand.ViewProblems) },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: dispatch(MenuCommand.ViewToggleSidebar)
        },
        { label: 'Toggle Panel', accelerator: 'CmdOrCtrl+J', click: dispatch(MenuCommand.ViewTogglePanel) },
        {
          label: 'Toggle Terminal',
          accelerator: 'CmdOrCtrl+`',
          click: dispatch(MenuCommand.ViewToggleTerminal)
        },
        { type: 'separator' },
        {
          label: chordLabel('Color Theme...', 'Ctrl+K Ctrl+T'),
          click: dispatch(MenuCommand.ViewThemePicker)
        },
        ...(isMac
          ? []
          : [
              {
                label: 'Settings',
                accelerator: 'CmdOrCtrl+,',
                click: dispatch(MenuCommand.ViewSettings)
              } as MenuItemConstructorOptions
            ]),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' }
      ]
    },
    {
      label: 'Terminal',
      submenu: [
        { label: 'New Terminal', accelerator: 'CmdOrCtrl+Shift+`', click: dispatch(MenuCommand.TerminalNew) },
        { label: 'Kill Active Terminal', click: dispatch(MenuCommand.TerminalKill) }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: dispatch(MenuCommand.HelpKeyboardShortcuts) },
        {
          label: 'Documentation',
          click: (): void => {
            void shell.openExternal('https://github.com/irisclint/causeway/tree/main/docs');
          }
        },
        {
          label: 'Report an Issue',
          click: (): void => {
            void shell.openExternal('https://github.com/irisclint/causeway/issues/new/choose');
          }
        },
        { type: 'separator' },
        { label: 'Check for Updates', click: dispatch(MenuCommand.HelpCheckForUpdates) },
        ...(isMac
          ? []
          : [
              {
                label: `About ${APP_NAME}`,
                click: dispatch(MenuCommand.HelpAbout)
              } as MenuItemConstructorOptions
            ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
  if (isMac) app.dock?.setMenu(Menu.buildFromTemplate([]));
  return menu;
}
