/**
 * Local subset of the Clerk SDK's resource types. We define them in-tree
 * rather than depending on `@clerk/types` for two reasons :
 *
 *   1. `@clerk/types` v4 pulls in `@clerk/shared@^3.47.2`, but
 *      `@clerk/clerk-js@6` ships with `@clerk/shared@4.11.0` bundled —
 *      the two versions diverge enough that TypeScript flags every
 *      cross-cast as `TS2345`.
 *   2. The surface we actually expose to consumers is small : a user
 *      identifier, a name, an email, a metadata bag, and a token
 *      fetcher. Carrying Clerk's full ~3000-line typing tree just to
 *      surface five fields is over-coupling.
 *
 * If the SDK adds a new field the wrapper needs to expose, extend the
 * interface here — Clerk's runtime objects always carry strictly more
 * than these types describe, so widening here is safe.
 */

/**
 * OAuth strategy identifier. The Clerk SDK accepts `oauth_<provider>`
 * for every provider it supports ; we keep the template literal type
 * so consumers get strong typing for the well-known providers without
 * losing forward-compat with new ones.
 */
export type OAuthStrategy =
  | 'oauth_github'
  | 'oauth_google'
  | 'oauth_apple'
  | 'oauth_microsoft'
  | 'oauth_gitlab'
  | 'oauth_bitbucket'
  | 'oauth_facebook'
  | 'oauth_x'
  | 'oauth_linkedin'
  | `oauth_${string}`;

/**
 * Minimal shape of Clerk's `UserResource`. Carries the fields Mozart
 * reads ; the runtime object has many more methods (update, delete,
 * createPasskey, …) — extend this when you need them.
 */
export interface UserResource {
  readonly id: string;
  readonly fullName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly primaryEmailAddress: {
    readonly emailAddress: string;
  } | null;
  readonly imageUrl: string;
  readonly unsafeMetadata: Record<string, unknown>;
  readonly publicMetadata: Record<string, unknown>;
}

/**
 * Minimal shape of Clerk's `SessionResource`. Token retrieval is the
 * only method Mozart needs ; everything else (status, lastActiveAt,
 * revoke, …) is on the runtime object and reachable via reflection if
 * a future caller needs it.
 */
export interface SessionResource {
  readonly id: string;
  getToken(options?: GetTokenOptions): Promise<string | null>;
}

export interface GetTokenOptions {
  /** Name of a Clerk JWT template configured in the dashboard. */
  readonly template?: string;
  /** Leeway in seconds before expiry to trigger a refresh. */
  readonly leewayInSeconds?: number;
  /** Skip the in-memory cache (force a network round-trip). */
  readonly skipCache?: boolean;
}

/**
 * Subset of Clerk's load-time options. The full type is large and
 * mostly experimental ; we expose a few stable knobs and let advanced
 * callers cast their own `ClerkOptions` through if they need to.
 */
export interface ClerkLoadOptions {
  /** Override the default sign-in route shown by Clerk's UI. */
  readonly signInUrl?: string;
  /** Override the default sign-up route shown by Clerk's UI. */
  readonly signUpUrl?: string;
  /** Override the default landing page after a sign-in. */
  readonly afterSignInUrl?: string;
  /** Override the default landing page after a sign-up. */
  readonly afterSignUpUrl?: string;
  /** Forward additional vendor-specific options. */
  readonly [key: string]: unknown;
}
