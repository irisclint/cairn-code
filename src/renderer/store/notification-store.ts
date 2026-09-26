import { create } from 'zustand';
import { createId } from '@shared/utils';
import { ApiError } from '../services/api';

export type NotificationSeverity = 'error' | 'warning' | 'info' | 'success';

export interface NotificationAction {
  label: string;
  run: () => void;
}

export interface Notification {
  id: string;
  severity: NotificationSeverity;
  message: string;
  /** Why it happened. Rendered under the message in the toast. */
  cause?: string;
  /** What to do about it. Rendered as the last line of the toast. */
  solution?: string;
  actions?: NotificationAction[];
  createdAt: number;
  /** Auto dismiss delay in milliseconds, 0 keeps the toast until dismissed. */
  timeoutMs: number;
}

/** What a caller supplies; id, timestamp and the default timeout are filled in. */
export type NotificationInput = Omit<Notification, 'id' | 'createdAt' | 'timeoutMs'> & {
  timeoutMs?: number;
};

interface NotificationState {
  notifications: Notification[];
  notify: (input: NotificationInput) => string;
  notifyError: (error: unknown, fallbackMessage?: string) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const DEFAULT_TIMEOUTS: Record<NotificationSeverity, number> = {
  error: 0,
  warning: 8000,
  info: 5000,
  success: 3000
};

/**
 * User facing notifications.
 *
 * Errors never auto dismiss: a message the user did not read is a message that
 * did not happen, and causeway's error contract promises the user always learns
 * what went wrong and what to do about it.
 */
export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  notify: (input) => {
    const id = createId('notification');
    const notification: Notification = {
      ...input,
      id,
      createdAt: Date.now(),
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUTS[input.severity]
    };
    set((state) => ({ notifications: [...state.notifications, notification] }));
    return id;
  },

  notifyError: (error, fallbackMessage = 'Something went wrong') => {
    const id = createId('notification');
    const notification: Notification =
      error instanceof ApiError
        ? {
            id,
            severity: 'error',
            message: error.message,
            cause: error.cause,
            solution: error.solution,
            createdAt: Date.now(),
            timeoutMs: 0
          }
        : {
            id,
            severity: 'error',
            message: error instanceof Error ? error.message : fallbackMessage,
            cause: 'An unexpected error occurred inside causeway.',
            solution: 'Try the action again. If it keeps failing, report it with the developer tools log.',
            createdAt: Date.now(),
            timeoutMs: 0
          };
    set((state) => ({ notifications: [...state.notifications, notification] }));
    return id;
  },

  dismiss: (id) => {
    set((state) => ({ notifications: state.notifications.filter((entry) => entry.id !== id) }));
  },

  dismissAll: () => set({ notifications: [] })
}));
