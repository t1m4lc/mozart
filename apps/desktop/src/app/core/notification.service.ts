import { Injectable, signal } from '@angular/core';
import { commands } from './_bindings';
import type { NotificationImpl } from './notification-impl';

const SOUND_URL = '/sounds/message-done.ogg';
const SOUND_VOLUME = 0.4;

// Desktop notifications + a subtle chime when an agent turn finishes
// off-screen. Phase 6 / Atom 10 — the desktop pop-up and the audio
// chime are independently gated by user preferences stored in the
// `config` table (notifications_desktop / notifications_sound). Both
// default to true on a fresh install.
//
// Async-injection pattern : the `@tauri-apps/plugin-notification`
// dependency lives in a sibling file (`notification-impl.ts`) and is
// only fetched via `import()` on the first call to `notify()`. The
// service surface stays sync-friendly — consumers still do
// `inject(NotificationService)` exactly as before. This is the
// closest pattern Angular 22 has to a hypothetical `injectAsync` :
// the consumer keeps the sync DI ergonomics ; the heavy module
// boundary moves into the service itself.
//
// This is the canonical notification path : real `message_end`
// events AND the Settings "Send test notification" button both go
// through `notify()` so the permission prompt fires consistently
// on first use (a Rust-side `emit_message_end_notification` command
// exists in the bindings but is no longer wired).

interface CachedPrefs {
  readonly desktop: boolean;
  readonly sound: boolean;
}

// Cached impl loader. Lives at module scope so multiple service
// instances (shouldn't happen with providedIn: 'root', but defensive)
// share one chunk fetch.
let _implPromise: Promise<NotificationImpl> | null = null;

async function loadImpl(): Promise<NotificationImpl> {
  if (!_implPromise) {
    _implPromise = import('./notification-impl').then((m) => m.createImpl());
  }
  return _implPromise;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly _prefs = signal<CachedPrefs>({ desktop: true, sound: true });
  private _prefsHydrated = false;

  async notify(opts: { title: string; body: string }): Promise<void> {
    await this._ensurePrefs();
    const prefs = this._prefs();
    if (prefs.desktop) {
      const impl = await loadImpl();
      void impl.sendDesktopNotification(opts);
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

  /** Play the chime only — no desktop notification, no permission
   *  prompt. Used by the Settings "test sound" button so the user can
   *  audit volume without firing a fake message-end. */
  playSound(): void {
    this._playSound();
  }

  // Audio API is browser-native — no heavy import — so this stays in
  // the sync half of the service.
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
