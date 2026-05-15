import { Injectable, signal } from '@angular/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { commands } from './_bindings';

const SOUND_URL = '/sounds/message-done.ogg';
const SOUND_VOLUME = 0.4;

// Desktop notifications + a subtle chime when an agent turn finishes
// off-screen. Phase 6 / Atom 10 — the desktop pop-up and the audio
// chime are independently gated by user preferences stored in the
// `config` table (notifications_desktop / notifications_sound). Both
// default to true on a fresh install.
//
// The desktop notification path is intentionally JS-side rather than
// going through `commands.emitMessageEndNotification` — keeping
// `sendNotification` on the Tauri plugin avoids a round-trip and a
// permission-prompt re-issue while still respecting the user's
// preference cached below.

interface CachedPrefs {
  readonly desktop: boolean;
  readonly sound: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private _permissionGranted: boolean | null = null;
  private readonly _prefs = signal<CachedPrefs>({ desktop: true, sound: true });
  private _prefsHydrated = false;

  async notify(opts: { title: string; body: string }): Promise<void> {
    await this._ensurePrefs();
    const prefs = this._prefs();
    if (prefs.desktop) {
      void this._sendDesktopNotification(opts);
    }
    if (prefs.sound) {
      this._playSound();
    }
  }

  /** Push preferences from the settings UI so the next notify() uses
   *  the latest values without a DB round-trip. */
  setPreferences(prefs: CachedPrefs): void {
    this._prefs.set(prefs);
    this._prefsHydrated = true;
  }

  private async _ensurePrefs(): Promise<void> {
    if (this._prefsHydrated) return;
    try {
      const r = await commands.getNotificationPreferences();
      if (r.status === 'ok') {
        this._prefs.set({
          desktop: r.data.desktop,
          sound: r.data.sound,
        });
      }
    } catch (err) {
      console.warn('[notification] hydrate prefs failed:', err);
    } finally {
      this._prefsHydrated = true;
    }
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
    } catch (err) {
      console.warn('[notification] sound playback failed', err);
    }
  }
}
