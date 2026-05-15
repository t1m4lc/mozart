// Public surface of the `profile` domain. Stores and adapter
// implementations stay private; features inject the facade.

export type { Profile } from './data/profile.model';
export type {
  Connection,
  ConnectionProvider,
  ConnectionStatus,
  ProbeResult,
} from './data/connection.model';
export { ProfileFacade } from './data/profile.facade';
export {
  CREDENTIALS_ADAPTER,
  type CredentialsAdapter,
} from './data/credentials.adapter';

export { FeatureConnections } from './feature-connections';
export { UiComingSoonCard } from './ui-coming-soon-card';
export { UiConnectDialog } from './ui-connect-dialog';
export {
  UiConfirmDisconnectDialog,
  type ConfirmDisconnectContext,
} from './ui-confirm-disconnect-dialog';
export { UiConnectionCard } from './ui-connection-card';
export { UiConnectionHelpDialog } from './ui-connection-help-dialog';
export { UiGithubCard } from './ui-github-card';
export { UiGithubConnectDialog } from './ui-github-connect-dialog';
export { FeatureNotificationPrefs } from './feature-notification-prefs';
export {
  NOTIFICATION_PREFS_ADAPTER,
  type NotificationPrefsAdapter,
  type NotificationPreferences,
} from './data/notification-prefs.adapter';
