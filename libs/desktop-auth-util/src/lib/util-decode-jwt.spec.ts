import { decodeJwt } from './util-decode-jwt';

function base64url(input: string): string {
  return btoa(input)
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeJwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  return `${header}.${body}.MOCK_SIGNATURE`;
}

describe('decodeJwt', () => {
  it('extracts exp + onboarding from a well-formed token', () => {
    const token = makeJwt({ exp: 1_700_000_000, onboarding: true, sub: 'u1' });
    expect(decodeJwt(token)).toEqual({
      exp: 1_700_000_000,
      onboarding: true,
      githubUsername: null,
      iss: null,
      sub: 'u1',
    });
  });

  it('defaults onboarding to false when claim is missing', () => {
    const token = makeJwt({ exp: 1_700_000_000, sub: 'u1' });
    expect(decodeJwt(token)).toEqual({
      exp: 1_700_000_000,
      onboarding: false,
      githubUsername: null,
      iss: null,
      sub: 'u1',
    });
  });

  it('extracts github_username when the user signed in with GitHub', () => {
    const token = makeJwt({
      exp: 1_700_000_000,
      onboarding: true,
      github_username: 'octocat',
    });
    expect(decodeJwt(token)).toEqual({
      exp: 1_700_000_000,
      onboarding: true,
      githubUsername: 'octocat',
      iss: null,
      sub: null,
    });
  });

  it('extracts sub (Clerk user id) as the cross-surface identity key', () => {
    const token = makeJwt({ exp: 1_700_000_000, sub: 'user_abc123' });
    expect(decodeJwt(token)?.sub).toBe('user_abc123');
  });

  it('extracts iss when present (Clerk Frontend API URL)', () => {
    const token = makeJwt({
      exp: 1_700_000_000,
      onboarding: false,
      iss: 'https://clerk.mozart.build',
    });
    expect(decodeJwt(token)?.iss).toBe('https://clerk.mozart.build');
  });

  it('treats Clerk-rendered "null" string github_username as no link', () => {
    // Clerk renders missing template variables as the literal string "null".
    const token = makeJwt({
      exp: 1_700_000_000,
      onboarding: true,
      github_username: 'null',
    });
    expect(decodeJwt(token)?.githubUsername).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(decodeJwt('not.a.jwt.really')).toBeNull();
    expect(decodeJwt('only-one-part')).toBeNull();
    expect(decodeJwt('a..b')).toBeNull();
  });

  it('returns null when exp is missing or not a number', () => {
    expect(decodeJwt(makeJwt({ onboarding: true }))).toBeNull();
    expect(decodeJwt(makeJwt({ exp: 'soon', onboarding: true }))).toBeNull();
  });
});
