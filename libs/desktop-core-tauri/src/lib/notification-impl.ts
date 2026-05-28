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
  sendDesktopNotification(opts: {
    title: string;
    body: string;
    // When true the OS notification daemon plays its own default
    // sound (NSUserNotification soundName on macOS, XDG sound theme
    // hint on Linux, default toast sound on Windows). This avoids
    // routing audio through the webview's HTML <audio>, which on
    // Linux pulls in GStreamer plugins (appsink + Vorbis) that
    // aren't always installed on minimal desktops.
    sound: boolean;
  }): Promise<void>;
}

class TauriNotificationImpl implements NotificationImpl {
  private _permissionGranted: boolean | null = null;

  async sendDesktopNotification(opts: {
    title: string;
    body: string;
    sound: boolean;
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
        sendNotification({
          title: opts.title,
          body: opts.body,
          sound: opts.sound ? 'default' : undefined,
        });
      }
    } catch (err) {
      console.warn('[notification] desktop notification failed', err);
    }
  }
}

export function createImpl(): NotificationImpl {
  return new TauriNotificationImpl();
}
