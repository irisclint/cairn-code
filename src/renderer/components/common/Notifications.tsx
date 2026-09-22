import { useEffect, type JSX } from 'react';
import { useNotificationStore, type Notification } from '../../store/notification-store';
import { Icon } from './Icon';

const SEVERITY_ICON: Record<Notification['severity'], string> = {
  error: 'error',
  warning: 'warning',
  info: 'info',
  success: 'success'
};

function NotificationToast({ notification }: { notification: Notification }): JSX.Element {
  const dismiss = useNotificationStore((state) => state.dismiss);

  useEffect(() => {
    if (notification.timeoutMs <= 0) return undefined;
    const timer = setTimeout(() => dismiss(notification.id), notification.timeoutMs);
    return () => clearTimeout(timer);
  }, [notification.id, notification.timeoutMs, dismiss]);

  return (
    <div
      className={'notification notification--' + notification.severity}
      role={notification.severity === 'error' ? 'alert' : 'status'}
    >
      <Icon name={SEVERITY_ICON[notification.severity]} className="notification__icon" />
      <div className="notification__body">
        <p className="notification__message">{notification.message}</p>
        {notification.cause ? (
          <p className="notification__detail">
            <span className="notification__label">Cause</span> {notification.cause}
          </p>
        ) : null}
        {notification.solution ? (
          <p className="notification__detail">
            <span className="notification__label">Fix</span> {notification.solution}
          </p>
        ) : null}
        {notification.actions && notification.actions.length > 0 ? (
          <div className="notification__actions">
            {notification.actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="button button--small"
                onClick={() => {
                  action.run();
                  dismiss(notification.id);
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="notification__close icon-button"
        aria-label="Dismiss notification"
        onClick={() => dismiss(notification.id)}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

/** Toast stack rendered above every other surface. */
export function Notifications(): JSX.Element | null {
  const notifications = useNotificationStore((state) => state.notifications);
  if (notifications.length === 0) return null;

  return (
    <div className="notifications" aria-live="polite">
      {notifications.map((notification) => (
        <NotificationToast key={notification.id} notification={notification} />
      ))}
    </div>
  );
}
