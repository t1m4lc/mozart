// Domain types for the auth surface. Free of wire vocabulary — the
// Tauri DTOs live in `auth.dto.ts` (added in Atom 3) and map onto these.

/**
 * Authenticated session retained across desktop restarts. The token is
 * the Clerk-signed JWT received via the `mozart://auth` deep-link.
 */
export interface AuthSession {
  /** Clerk-signed JWT. Opaque to the UI ; decoded only by the facade. */
  readonly token: string;
  /** When the underlying token expires. Used by offline-mode logic. */
  readonly expiresAt: Date;
}

/** Payload extracted from a `mozart://auth?token=...&state=...` URL. */
export interface DeepLinkPayload {
  readonly token: string;
  readonly state: string;
}

/** Drives the /welcome screen's visual state. */
export type WelcomeState =
  | 'idle' // initial : Sign in button visible
  | 'opening' // browser-opening flow in progress
  | 'authenticating' // deep-link received, finalizing session (Stronghold save)
  | 'timed-out' // 5 min passed with no deep-link (Atom 4)
  | 'offline'; // bootstrap found an expired token + no network (Atom 6)
