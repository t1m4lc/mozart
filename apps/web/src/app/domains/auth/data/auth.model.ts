// Domain types for the apps/web auth surface. Mirrors the shape the
// desktop's tauri-auth.adapter expects on the inbound deep-link
// (`token` + `state`) — the same JWT lands in the OS keyring there.
//
// The `token` is fetched on-demand via `AuthFacade.fetchToken()` —
// it is intentionally NOT a field of `User`. Storing a JWT in the user
// signal would force us to refresh it on every Clerk session-renewal
// emission ; reading it lazily lets Clerk own the token lifecycle.

export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  /** Whether the user has completed Mozart's onboarding flow. Atom 6
   *  on the desktop reads this to route to `/onboarding` (false) or
   *  `/` (true). Mirrors `user.unsafeMetadata.onboarding` in Clerk. */
  readonly onboarding: boolean;
}

export type OAuthProvider = 'github' | 'google';
