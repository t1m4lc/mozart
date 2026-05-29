import { Injectable, signal } from '@angular/core';
import {
  NotificationService,
  type NotificationPrefsCache,
} from '@mozart/desktop-core-data-access';
import { commands } from './_bindings';
import type { NotificationImpl } from './notification-impl';

// Desktop notifications on agent turn end. Two surfaces:
//   - notify(): the OS popup (+ its native sound) when the turn ends on
//     a workspace the user isn't watching. Gated by `prefs.desktop`.
//   - playSoundIfEnabled(): the audible chime when the user IS watching
//     (popup suppressed). Gated by `prefs.sound`. Played via the Rust
//     `play_chime` command, NOT HTML <audio> — the latter routed through
//     WebKitGTK → GStreamer and silently failed on Linux desktops
//     missing the base/good plugins.
//
// Both prefs default to true and are currently pinned together in the
// settings UI.
//
// Tauri-bound impl of the abstract `NotificationService` declared in
// `desktop-core-data-access`. Bound via
// `{ provide: NotificationService, useExisting: TauriNotificationService }`
// in app.config so libs can `inject(NotificationService)` without
// touching `_bindings` or `@tauri-apps/plugin-notification`.
//
// Async-injection pattern: the `@tauri-apps/plugin-notification`
// dependency lives in a sibling file (`notification-impl.ts`) and is
// only fetched via `import()` on the first call to `notify()`. The
// service surface stays sync-friendly — consumers still do
// `inject(NotificationService)` exactly as before.
//
// This is the canonical notification path: real `message_end`
// events AND the Settings "Send test notification" button both go
// through `notify()` so the permission prompt fires consistently
// on first use.

let _implPromise: Promise<NotificationImpl> | null = null;

async function loadImpl(): Promise<NotificationImpl> {
  if (!_implPromise) {
    _implPromise = import('./notification-impl').then((m) => m.createImpl());
  }
  return _implPromise;
}

@Injectable({ providedIn: 'root' })
export class TauriNotificationService extends NotificationService {
  private readonly _prefs = signal<NotificationPrefsCache>({
    desktop: true,
    sound: true,
  });
  private _prefsHydrated = false;

  override async notify(opts: {
    title: string;
    body: string;
  }): Promise<void> {
    await this._ensurePrefs();
    const prefs = this._prefs();
    if (!prefs.desktop) return;
    const impl = await loadImpl();
    impl
      .sendDesktopNotification({
        title: opts.title,
        body: opts.body,
        sound: prefs.sound,
      })
      .catch((err) => {
        console.warn('[notification] sendDesktopNotification rejected', err);
      });
  }

  /** Push preferences from the settings UI so the next notify() uses
   *  the latest values without a DB round-trip. */
  override setPreferences(prefs: NotificationPrefsCache): void {
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

  /** "Test sound" button in Settings → Notifications. Plays the chime
   *  unconditionally so the user can audit it without firing an OS
   *  notification. The button is already gated on the desktop pref
   *  upstream. */
  override playSound(): void {
    this._playChime();
  }

  /** Play the chime IF the `sound` pref is on. Fires on a focused
   *  turn-end so the audible cue remains even when the desktop popup is
   *  suppressed. Hydrates the prefs cache on first call. */
  override playSoundIfEnabled(): void {
    if (!this._prefsHydrated) {
      void this._ensurePrefs().then(() => {
        if (this._prefs().sound) this._playChime();
      });
      return;
    }
    if (this._prefs().sound) this._playChime();
  }

  // Native chime via the Rust `play_chime` command — reliable on Linux
  // without the GStreamer dependency the old HTML <audio> path needed.
  private _playChime(): void {
    void commands.playChime().catch(() => undefined);
  }
}
