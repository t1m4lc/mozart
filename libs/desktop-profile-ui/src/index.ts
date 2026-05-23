// ui-connect-dialog / ui-github-connect-dialog stay in apps/desktop until
// their core service deps (NotificationService, ConnectivityService,
// ExternalLinkService) are extracted into shared libs — then they migrate
// into `desktop-profile-feature`.

export { UiComingSoonCard } from './lib/ui-coming-soon-card';
export {
  UiConfirmDisconnectDialog,
  type ConfirmDisconnectContext,
} from './lib/ui-confirm-disconnect-dialog';
export { UiConnectionCard } from './lib/ui-connection-card';
export { UiConnectionHelpDialog } from './lib/ui-connection-help-dialog';
export { UiGithubCard } from './lib/ui-github-card';
