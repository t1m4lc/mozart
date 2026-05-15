// Pure helper. Builds an unsigned JWT with the same claim shape Clerk
// would emit, so the desktop's Atom 6 decoder can read it identically.
// The signature is a literal "MOCK_SIGNATURE" string — the desktop
// doesn't verify it (we trust the deep-link state nonce instead).
//
// Replaced by `clerk.session.getToken()` when the real Clerk adapter
// ships post-MVP.

export interface MockJwtClaims {
  readonly sub: string;
  readonly name: string;
  readonly email: string;
  readonly onboarding: boolean;
}

function base64url(input: string): string {
  return btoa(input)
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function buildMockJwt(claims: MockJwtClaims): string {
  const header = { alg: 'none', typ: 'JWT' };
  const nowSec = Math.floor(Date.now() / 1000);
  const sevenDaysSec = 7 * 24 * 60 * 60;
  const payload = {
    sub: claims.sub,
    name: claims.name,
    email: claims.email,
    onboarding: claims.onboarding,
    iat: nowSec,
    exp: nowSec + sevenDaysSec,
  };
  return [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(payload)),
    'MOCK_SIGNATURE',
  ].join('.');
}
