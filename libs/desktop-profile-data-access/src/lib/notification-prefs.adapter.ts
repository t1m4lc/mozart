import { InjectionToken } from '@angular/core';

// Port for notification preferences. Storage is DB-backed (config
// rows), exposed by `get_notification_preferences` /
// `set_notification_preferences` and consumed at emit time by
// `emit_message_end_notification`.
export interface NotificationPreferences {
  readonly desktop: boolean;
  readonly sound: boolean;
}

export interface NotificationPrefsAdapter {
  get(): Promise<NotificationPreferences>;
  set(prefs: NotificationPreferences): Promise<void>;
  emitMessageEnd(chatTitle: string): Promise<void>;
}

export const NOTIFICATION_PREFS_ADAPTER =
  new InjectionToken<NotificationPrefsAdapter>('NOTIFICATION_PREFS_ADAPTER');
