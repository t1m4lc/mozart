import { buildMockJwt } from '../util-mock-jwt';
import type { AuthAdapter } from './auth.adapter';
import type { OAuthProvider, User } from './auth.model';

// MVP scope (per user decision logged in the local plan) : `apps/web`
// ships with a mocked Clerk adapter. The page structure, routing, and
// the `mozart://auth?...` deep-link payload are all real ; the OAuth
// dance is simulated client-side and resolves to a hand-crafted JWT
// with the same claim shape Clerk would emit.
//
// Swap path : replace this factory with a `@clerk/angular`-backed one
// (same `AuthAdapter` port shape, ~30 min of work). The mock survives
// only until that swap.

const MOCK_USERS: Record<OAuthProvider, Omit<User, 'token'>> = {
  github: {
    id: 'user_mock_github_001',
    email: 'octocat@example.com',
    name: 'Octocat Mock',
    onboarding: false,
  },
  google: {
    id: 'user_mock_google_001',
    email: 'mock.user@gmail.com',
    name: 'Mock User',
    onboarding: false,
  },
};

const FAKE_OAUTH_DELAY_MS = 600;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function mockClerkAdapter(): AuthAdapter {
  return {
    async signIn(provider: OAuthProvider): Promise<User> {
      // Mimic the latency of a real OAuth round-trip so the spinner
      // on /auth-callback feels intentional rather than blink-fast.
      await delay(FAKE_OAUTH_DELAY_MS);
      const base = MOCK_USERS[provider];
      const token = buildMockJwt({
        sub: base.id,
        name: base.name,
        email: base.email,
        onboarding: base.onboarding,
      });
      return { ...base, token };
    },
  };
}
