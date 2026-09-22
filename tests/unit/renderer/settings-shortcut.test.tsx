import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installBridge, removeBridge, state } from './bridge-mock';

import { SettingsView } from '@renderer/components/views/SettingsView';
import { useSettingsStore, FALLBACK_SETTINGS } from '@renderer/store/settings-store';
import { useNotificationStore } from '@renderer/store/notification-store';
import { registerBuiltInCommands } from '@renderer/services/register-commands';

let disposeCommands: () => void;

beforeEach(() => {
  installBridge();
  disposeCommands?.();
  disposeCommands = registerBuiltInCommands();
  useSettingsStore.setState({ settings: { ...FALLBACK_SETTINGS }, loaded: true });
  useNotificationStore.setState({ notifications: [] });
});

describe('the desktop shortcut control in Settings', () => {
  it('should offer to create one when the desktop is empty', async () => {
    render(<SettingsView />);

    await waitFor(() => expect(screen.getByText('Desktop shortcut')).toBeInTheDocument());
    expect(screen.getByText(/one double click away/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create shortcut' })).toBeInTheDocument();
  });

  it('should offer to remove one that already exists', async () => {
    state.shortcut = { ...state.shortcut, exists: true };
    render(<SettingsView />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove shortcut' })).toBeInTheDocument());
    expect(screen.getByText('A shortcut is on your desktop.')).toBeInTheDocument();
  });

  it('should explain instead of offering when the build manages its own', async () => {
    state.shortcut = {
      exists: false,
      path: '/x',
      canCreate: false,
      reason: 'The installer already created one.'
    };

    render(<SettingsView />);

    await waitFor(() => expect(screen.getByText('Desktop shortcut')).toBeInTheDocument());
    expect(screen.getByText('The installer already created one.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /shortcut$/ })).not.toBeInTheDocument();
  });

  it('should fall back to a generic line when no reason was given', async () => {
    state.shortcut = { exists: false, path: '/x', canCreate: false };
    render(<SettingsView />);

    await waitFor(() => expect(screen.getByText('Not available for this build.')).toBeInTheDocument());
  });

  it('should render nothing without the preload bridge', async () => {
    removeBridge();
    render(<SettingsView />);

    // The rest of Settings still renders; only the shortcut row is absent.
    await waitFor(() => expect(screen.getByText('Appearance')).toBeInTheDocument());
    expect(screen.queryByText('Desktop shortcut')).not.toBeInTheDocument();

    installBridge();
  });

  it('should create the shortcut and then offer to remove it', async () => {
    render(<SettingsView />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Create shortcut' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Create shortcut' }));

    await waitFor(() => expect(state.shortcut.exists).toBe(true));
    // The control refreshes, so the next action offered is the opposite one.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove shortcut' })).toBeInTheDocument());
  });

  it('should confirm a removal', async () => {
    state.shortcut = { ...state.shortcut, exists: true };
    render(<SettingsView />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove shortcut' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Remove shortcut' }));

    await waitFor(() => expect(state.shortcut.exists).toBe(false));
    await waitFor(() =>
      expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe('Desktop shortcut removed')
    );
  });

  it('should stay usable when the removal fails', async () => {
    state.shortcut = { ...state.shortcut, exists: true };
    vi.mocked(globalThis.window.cairn.shortcut.remove).mockResolvedValueOnce({
      ok: false,
      error: { code: 'SHORTCUT_REMOVE_FAILED', message: 'nope', cause: 'c', solution: 's' }
    });

    render(<SettingsView />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remove shortcut' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Remove shortcut' }));

    // A failed removal must not claim success.
    await waitFor(() =>
      expect(
        useNotificationStore
          .getState()
          .notifications.some((entry) => entry.message === 'Desktop shortcut removed')
      ).toBe(false)
    );
  });
});
