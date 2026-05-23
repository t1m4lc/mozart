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

  return { exp, onboarding };
}

function base64UrlDecode(input: string): string {
  const padded = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(input.length + ((4 - (input.length % 4)) % 4), '=');
  return atob(padded);
}
