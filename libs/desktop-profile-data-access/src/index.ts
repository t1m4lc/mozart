// Public surface of `desktop-profile-data-access`. Facade + adapter
// ports. The Tauri-backed impl for the notification-prefs port lives
// in `apps/desktop/src/app/core/tauri-notification-prefs.adapter.ts`.

export { ProfileFacade } from './lib/profile.facade';
export {
  CREDENTIALS_ADAPTER,
  type CredentialsAdapter,
} from './lib/credentials.adapter';
export {
  NOTIFICATION_PREFS_ADAPTER,
  type NotificationPrefsAdapter,
  type NotificationPreferences,
} from './lib/notification-prefs.adapter';
