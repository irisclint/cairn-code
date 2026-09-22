import { api, hasBridge, unwrap, unwrapOr } from './api';
import { useNotificationStore } from '../store/notification-store';
import { useSettingsStore } from '../store/settings-store';
import { commandService } from './command-service';
import type { ShortcutState } from '@shared/types';

/**
 * Offers to create a desktop shortcut, once.
 *
 * A portable build and an AppImage leave nothing behind that a person can
 * click, so cairn-code ends up buried wherever it was unpacked. Creating a shortcut
 * without asking would be writing to someone's desktop uninvited, so this
 * offers instead, remembers the answer, and never asks again either way.
 */
export async function offerDesktopShortcut(): Promise<void> {
  if (!hasBridge()) return;

  const settings = useSettingsStore.getState();
  if (settings.settings['shortcut.promptAnswered']) return;

  const state = await unwrapOr<ShortcutState | null>(api().shortcut.getState(), null);

  // Nothing to offer when a shortcut is already there, or when the build
  // manages its own, which is the case for every real installer.
  if (!state || state.exists || !state.canCreate) {
    // A development build reports canCreate false on every launch. Recording an
    // answer there would silently suppress the offer in a later packaged run
    // that shares the same settings file, so the flag is only set once the
    // question could actually have been asked.
    if (state?.exists) void settings.set('shortcut.promptAnswered', true);
    return;
  }

  const notifications = useNotificationStore.getState();

  notifications.notify({
    severity: 'info',
    message: 'Add cairn-code to your desktop?',
    cause: 'This build was unpacked rather than installed, so there is nothing to click yet.',
    solution: 'A shortcut goes on your desktop and nowhere else. You can remove it at any time.',
    // No timeout: a question that disappears on its own is a question the user
    // never answered, and it would never be asked again.
    timeoutMs: 0,
    actions: [
      {
        label: 'Create shortcut',
        run: () => {
          void settings.set('shortcut.promptAnswered', true);
          void commandService.execute('app.createDesktopShortcut');
        }
      },
      {
        label: 'No thanks',
        run: () => {
          void settings.set('shortcut.promptAnswered', true);
        }
      }
    ]
  });
}

/** Reports where the shortcut is, for the settings view. */
export async function getShortcutState(): Promise<ShortcutState | null> {
  if (!hasBridge()) return null;
  return unwrapOr<ShortcutState | null>(api().shortcut.getState(), null);
}

/** Removes the desktop shortcut and reports whether there was one. */
export async function removeDesktopShortcut(): Promise<boolean> {
  return unwrap(api().shortcut.remove());
}
