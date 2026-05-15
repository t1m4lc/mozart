// Public surface of the apps/web `auth` domain. Pages import from
// this barrel only — the Clerk-specific machinery stays private.

export type { OAuthProvider, User } from './data/auth.model';
export {
  AuthFacade,
  type DesktopLaunchOutcome,
} from './data/auth.facade';
export { FeatureLaunchMozart } from './feature-launch-mozart';
