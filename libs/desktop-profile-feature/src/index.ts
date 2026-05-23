// UiConnectDialog / UiGithubConnectDialog keep the `ui-*` prefix because
// their class names ship in dynamic `import()` strings consumed by the
// onboarding flow — renaming requires updating every import string at once.

export { FeatureConnections } from './lib/feature-connections';
export { FeatureNotificationPrefs } from './lib/feature-notification-prefs';
export { UiConnectDialog } from './lib/ui-connect-dialog';
export { UiGithubConnectDialog } from './lib/ui-github-connect-dialog';
