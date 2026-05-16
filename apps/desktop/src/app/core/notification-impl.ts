import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

// Heavy half of NotificationService. Imported dynamically from
// notification.service.ts so the `@tauri-apps/plugin-notification`
// chunk only lands when the user actually fires a notification.
// See notification.service.ts for the public API + lifecycle.

export interface NotificationImpl {
  sendDesktopNotification(opts: { title: string; body: string }): Promise<void>;
}

class TauriNotificationImpl implements NotificationImpl {
  private _permissionGranted: boolean | null = null;

  async sendDesktopNotification(opts: {
    title: string;
    body: string;
  }): Promise<void> {
    try {
      if (this._permissionGranted === null) {
        let granted = await isPermissionGranted();
        if (!granted) {
          const result = await requestPermission();
          granted = result === 'granted';
        }
        this._permissionGranted = granted;
      }
      if (this._permissionGranted) {
        sendNotification({ title: opts.title, body: opts.body });
      }
    } catch (err) {
      console.warn('[notification] desktop notification failed', err);
    }
  }
}

export function createImpl(): NotificationImpl {
  return new TauriNotificationImpl();
}
