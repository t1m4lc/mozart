import type {
  NotificationPrefsAdapter,
  NotificationPreferences,
} from '@mozart/desktop-profile-data-access';
import { commands } from './_bindings';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

export function tauriNotificationPrefsAdapter(): NotificationPrefsAdapter {
  return {
    async get(): Promise<NotificationPreferences> {
      return unwrap(await commands.getNotificationPreferences());
    },
    async set(prefs): Promise<void> {
      unwrap(await commands.setNotificationPreferences(prefs));
    },
    async emitMessageEnd(chatTitle): Promise<void> {
      unwrap(await commands.emitMessageEndNotification(chatTitle));
    },
  };
}
