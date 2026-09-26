import { describe, it, expect, beforeEach, vi } from 'vitest';
import { installBridge, removeBridge, state } from './bridge-mock';
import {
  offerDesktopShortcut,
  getShortcutState,
  removeDesktopShortcut
} from '@renderer/services/shortcut-prompt';
import { useNotificationStore } from '@renderer/store/notification-store';
import { useSettingsStore, FALLBACK_SETTINGS } from '@renderer/store/settings-store';
import { commandService } from '@renderer/services/command-service';
import { registerBuiltInCommands } from '@renderer/services/register-commands';

let disposeCommands: () => void;

beforeEach(() => {
  installBridge();
  disposeCommands?.();
  disposeCommands = registerBuiltInCommands();
  useNotificationStore.setState({ notifications: [] });
  useSettingsStore.setState({ settings: { ...FALLBACK_SETTINGS }, loaded: true });
});

describe('the first-run shortcut offer', () => {
  it('should ask when the build has no shortcut and can create one', async () => {
    await offerDesktopShortcut();

    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.message).toBe('Add causeway to your desktop?');
    expect(notification?.actions?.map((action) => action.label)).toEqual(['Create shortcut', 'No thanks']);
  });

  it('should never let the question time out on its own', async () => {
    await offerDesktopShortcut();
    expect(useNotificationStore.getState().notifications[0]?.timeoutMs).toBe(0);
  });

  it('should say why there is nothing to click yet', async () => {
    await offerDesktopShortcut();

    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.cause).toContain('unpacked');
    expect(notification?.solution).toContain('remove it');
  });

  it('should not ask when a shortcut already exists', async () => {
    state.shortcut = { ...state.shortcut, exists: true };

    await offerDesktopShortcut();

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
    // The answer is recorded, so a later launch does not reconsider it.
    await vi.waitFor(() =>
      expect(useSettingsStore.getState().settings['shortcut.promptAnswered']).toBe(true)
    );
  });

  it('should not ask when the build manages its own shortcuts', async () => {
    state.shortcut = { ...state.shortcut, canCreate: false, reason: 'installed build' };

    await offerDesktopShortcut();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('should leave the flag unset for a build that could never create one', async () => {
    // A development build reports canCreate false on every launch. Recording an
    // answer there would suppress the offer in a later packaged run.
    state.shortcut = { exists: false, path: '/x', canCreate: false, reason: 'development build' };

    await offerDesktopShortcut();
    expect(useSettingsStore.getState().settings['shortcut.promptAnswered']).toBe(false);
  });

  it('should not ask again once the question was answered', async () => {
    useSettingsStore.setState({
      settings: { ...FALLBACK_SETTINGS, 'shortcut.promptAnswered': true },
      loaded: true
    });

    await offerDesktopShortcut();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('should do nothing without the preload bridge', async () => {
    removeBridge();
    await expect(offerDesktopShortcut()).resolves.toBeUndefined();
    installBridge();
  });

  it('should create the shortcut and record the answer when accepted', async () => {
    await offerDesktopShortcut();

    const accept = useNotificationStore
      .getState()
      .notifications[0]?.actions?.find((action) => action.label === 'Create shortcut');
    accept?.run();

    await vi.waitFor(() => expect(state.shortcut.exists).toBe(true));
    await vi.waitFor(() =>
      expect(useSettingsStore.getState().settings['shortcut.promptAnswered']).toBe(true)
    );
  });

  it('should record the answer and create nothing when declined', async () => {
    await offerDesktopShortcut();

    const decline = useNotificationStore
      .getState()
      .notifications[0]?.actions?.find((action) => action.label === 'No thanks');
    decline?.run();

    await vi.waitFor(() =>
      expect(useSettingsStore.getState().settings['shortcut.promptAnswered']).toBe(true)
    );
    expect(state.shortcut.exists).toBe(false);
  });
});

describe('the Create Desktop Shortcut command', () => {
  it('should be in the command palette', () => {
    expect(commandService.get('app.createDesktopShortcut')?.title).toBe('Create Desktop Shortcut');
    disposeCommands();
  });

  it('should confirm with the path it wrote', async () => {
    await commandService.execute('app.createDesktopShortcut');

    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.severity).toBe('success');
    expect(notification?.cause).toContain(state.shortcut.path);
    expect(notification?.solution).toContain('Double click');

    disposeCommands();
  });

  it('should report a failure with a cause and a fix', async () => {
    vi.mocked(globalThis.window.causeway.shortcut.create).mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'SHORTCUT_UNAVAILABLE',
        message: 'A desktop shortcut cannot be created for this build',
        cause: 'It would point at the development binary.',
        solution: 'Install causeway with the installer for your platform.'
      }
    });

    await commandService.execute('app.createDesktopShortcut');

    const notification = useNotificationStore.getState().notifications[0];
    expect(notification?.severity).toBe('error');
    expect(notification?.cause).toContain('development binary');
    expect(notification?.solution).toContain('installer');

    disposeCommands();
  });
});

describe('shortcut state helpers', () => {
  it('should report the current state', async () => {
    expect(await getShortcutState()).toMatchObject({ exists: false, canCreate: true });
  });

  it('should return null without the bridge rather than throwing', async () => {
    removeBridge();
    expect(await getShortcutState()).toBeNull();
    installBridge();
  });

  it('should remove an existing shortcut and report that there was one', async () => {
    state.shortcut = { ...state.shortcut, exists: true };

    expect(await removeDesktopShortcut()).toBe(true);
    expect(state.shortcut.exists).toBe(false);
  });

  it('should report false when there was nothing to remove', async () => {
    expect(await removeDesktopShortcut()).toBe(false);
  });
});
