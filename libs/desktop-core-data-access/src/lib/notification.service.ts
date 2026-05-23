// Abstract port for the desktop-notification + chime path used when
// an agent turn finishes off-screen. The concrete impl in
// apps/desktop/src/app/core/ owns the Tauri keyring round-trip for
// preferences and the dynamic `@tauri-apps/plugin-notification`
// import — this lib stays Tauri-free so chat / profile features can
// `inject(NotificationService)` from a lib.
export interface NotificationPrefsCache {
  readonly desktop: boolean;
  readonly sound: boolean;
}

export abstract class NotificationService {
  /** Show a desktop notification (gated by user prefs) and play the
   *  chime. Hydrates the prefs cache on first call. */
  abstract notify(opts: { title: string; body: string }): Promise<void>;

  /** Push preferences from the settings UI so the next notify() uses
   *  the latest values without a DB round-trip. */
  abstract setPreferences(prefs: NotificationPrefsCache): void;

  /** Play the chime only — no desktop notification, no permission
   *  prompt. Used by the Settings "test sound" button. */
  abstract playSound(): void;
}
