import { Injectable, signal } from '@angular/core';
import {
  NotificationService,
  type NotificationPrefsCache,
} from '@mozart/desktop-core-data-access';
import { commands } from './_bindings';
import type { NotificationImpl } from './notification-impl';

// Desktop notifications on agent turn end. The audible chime is now
// delegated to the OS notification daemon via the Tauri plugin's
// `sound: 'default'` option — we no longer play a bundled .ogg through
// HTML <audio>, which required GStreamer base/good plugins on Linux
// and silently failed on machines that didn't have them.
//
// Independent gates from the `config` table:
//   - notifications_desktop: should we fire the OS popup at all?
//   - notifications_sound:   if firing, should it play the OS sound?
// Both default to true. desktop=false short-circuits everything (the
// previous "sound without popup" combo no longer applies — that path
// relied on the HTML <audio> we removed).
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

  /** "Test sound" button in Settings → Notifications. Fires a real
   *  notification (visual + native sound) so the user verifies both
   *  channels at once. The button is already gated on the desktop
   *  pref upstream. */
  override playSound(): void {
    void this.notify({
      title: 'Mozart',
      body: 'Notification test',
    });
  }

  /** Historically fired a sound-only chime when the user was focused
   *  on the active workspace. The HTML <audio> backing this path
   *  required GStreamer on Linux and was dropped — when the user is
   *  already looking at the timeline, the visible update is enough.
   *  Kept as a no-op for binary compat with existing call sites.
   *  Safe to remove once chat.facade stops calling it. */
  override playSoundIfEnabled(): void {
    // intentionally empty
  }
}
