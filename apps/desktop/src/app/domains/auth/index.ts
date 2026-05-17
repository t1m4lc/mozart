// Public surface of the `auth` domain. Stores (none in Atom 1), the
// adapter implementation, and util-* helpers stay private.

export type {
  AuthSession,
  DeepLinkPayload,
  WelcomeState,
} from './data/auth.model';
export { AuthFacade } from './data/auth.facade';
export { AUTH_ADAPTER, type AuthAdapter } from './data/auth.adapter';
export { authGuard } from './auth.guard';
export { isDevAuthBypassActive } from './dev-bypass';
export { FeatureWelcome } from './feature-welcome/feature-welcome';
export { UiWelcomeCard } from './ui-welcome-card';
