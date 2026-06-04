// Pure helper. Decodes the payload of a Clerk-shape JWT (or the
// `apps/web` mock token built by `buildMockJwt`) without verifying the
// signature — we trust the deep-link `state` nonce, not the signature,
// since the apps/web mock signs with a literal "MOCK_SIGNATURE" string.
//
// Real Clerk tokens use the same shape (`header.payload.signature`,
// base64url-encoded JSON), so this decoder works against both the
// mocked and the real-Clerk path once that swap lands post-MVP.
//
// Returns `null` for any malformed input. The `onboarding` claim
// defaults to `false` when missing — fail-closed routes the user into
// the wizard rather than past it.

export interface JwtClaims {
  readonly exp: number; // seconds since epoch (Unix time)
  readonly onboarding: boolean;
  readonly githubUsername: string | null;
  // Clerk Frontend API origin (e.g. https://clerk.mozart.build in prod,
  // https://<slug>.clerk.accounts.dev in dev). Used by the desktop to
  // PATCH /v1/me back to Clerk without hardcoding the URL.
  readonly iss: string | null;
  // Clerk user id (`user_…`). Same value as `clerkUser.id` on apps/web, so
  // it's the cross-surface identity key for `analytics.identify()`.
  readonly sub: string | null;
}

export function decodeJwt(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;

  let json: unknown;
  try {
    json = JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;

  const exp = typeof obj['exp'] === 'number' ? (obj['exp'] as number) : null;
  if (exp === null) return null;
  const onboarding =
    typeof obj['onboarding'] === 'boolean'
      ? (obj['onboarding'] as boolean)
      : false;
  // Clerk renders missing template variables as the literal string "null"
  // when the user has no GitHub external account linked — treat both
  // that and a real null/undefined as "no GitHub link".
  const rawGh = obj['github_username'];
  const githubUsername =
    typeof rawGh === 'string' && rawGh.length > 0 && rawGh !== 'null'
      ? rawGh
      : null;
  const iss = typeof obj['iss'] === 'string' ? (obj['iss'] as string) : null;
  const sub = typeof obj['sub'] === 'string' ? (obj['sub'] as string) : null;

  return { exp, onboarding, githubUsername, iss, sub };
}

function base64UrlDecode(input: string): string {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), '=');
  return atob(padded);
}
