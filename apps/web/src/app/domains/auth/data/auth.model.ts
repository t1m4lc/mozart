// Domain types for the apps/web auth surface. Mirrors the shape the
// desktop's tauri-auth.adapter expects on the inbound deep-link
// (`token` + `state`) — the same JWT lands in Stronghold/keyring there.

export interface User {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  /** Mock JWT issued by `mockClerkAdapter` ; real Clerk JWT post-MVP. */
  readonly token: string;
  /** Whether the user has completed Mozart's onboarding flow. Atom 6
   *  on the desktop reads this to route to `/onboarding` (false) or
   *  `/` (true). Mocked false for now so the desktop's onboarding
   *  stub is reachable. */
  readonly onboarding: boolean;
}

export type OAuthProvider = 'github' | 'google';
