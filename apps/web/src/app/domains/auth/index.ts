// Public surface of the apps/web `auth` domain. The adapter
// implementation + util helpers stay private to the domain ; only
// types, facade, port token, and the smart-component feature are
// re-exported.

export type { OAuthProvider, User } from './data/auth.model';
export { AuthFacade } from './data/auth.facade';
export { AUTH_ADAPTER, type AuthAdapter } from './data/auth.adapter';
export { FeatureLaunchMozart } from './feature-launch-mozart';
