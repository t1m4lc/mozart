import { Injectable } from '@angular/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

const SOUND_URL = '/sounds/message-done.ogg';
const SOUND_VOLUME = 0.4;

// Desktop notifications + a subtle chime when an agent turn finishes
// off-screen. Phase 3a hardcodes "default on" — a settings toggle is
// deferred to Phase 6. Errors here are swallowed deliberately: a
// notification is a nice-to-have, never load-bearing.

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private _permissionGranted: boolean | null = null;

  async notify(opts: { title: string; body: string }): Promise<void> {
    void this._sendDesktopNotification(opts);
    this._playSound();
  }

  private async _sendDesktopNotification(opts: {
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

  private _playSound(): void {
    try {
      const audio = new Audio(SOUND_URL);
      audio.volume = SOUND_VOLUME;
      void audio.play().catch(() => undefined);
    } catch {
      // Audio playback is best-effort.
    }
  }
}
