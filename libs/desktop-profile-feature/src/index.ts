// Public surface of `desktop-profile-feature`. Smart components that
// inject ProfileFacade + abstract core services (NotificationService,
// ConnectivityService, ExternalLinkService bound in app.config).
//
// Two of the four files are still named `ui-*` (Connect / GithubConnect
// dialogs) because their class names ship in dynamic `import()`
// strings consumed by the onboarding flow. Renaming them is a
// cosmetic follow-up that requires updating every dynamic-import
// string at once.

export { FeatureConnections } from './lib/feature-connections';
export { FeatureNotificationPrefs } from './lib/feature-notification-prefs';
export { UiConnectDialog } from './lib/ui-connect-dialog';
export { UiGithubConnectDialog } from './lib/ui-github-connect-dialog';
