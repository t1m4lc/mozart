import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AUTH_ADAPTER } from './auth.adapter';
import type { OAuthProvider, User } from './auth.model';

// Public surface of the apps/web `auth` domain. Pages inject this ;
// the adapter stays private. Holds the signed-in user + the OAuth
// state nonce the desktop forwarded in the /login URL.
//
// Flow :
//   /login captures `?state=…`           → ingestOauthState
//   /login click button                  → signIn(provider) → /auth-callback
//   /auth-callback waits for user signal → /dashboard
//   /dashboard click Launch              → buildDesktopLaunchUrl + browser nav
//
// Persistence : the user JSON is mirrored to `localStorage` so the
// session survives both hard navigations AND new tabs. The desktop
// can re-open the browser with a fresh `state` nonce in a new tab and
// /login auto-redirects to /dashboard without re-asking for OAuth.
// Real Clerk handles this via its own cookies / session machinery
// post-MVP ; localStorage is the mock equivalent.

const USER_STORAGE_KEY = 'mozart.web.user';
const OAUTH_STATE_STORAGE_KEY = 'mozart.web.oauthState';

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function loadStoredState(): string | null {
  try {
    return localStorage.getItem(OAUTH_STATE_STORAGE_KEY);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly adapter = inject(AUTH_ADAPTER);
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(loadStoredUser());
  readonly user = computed(() => this._user());
  readonly isAuthenticated = computed(() => this._user() !== null);

  /** OAuth state nonce passed in by the desktop in the inbound URL.
   *  Replayed verbatim into the `mozart://auth?...&state=…` callback
   *  so the desktop facade can validate the round-trip. */
  private readonly _oauthState = signal<string | null>(loadStoredState());

  constructor() {
    // Mirror state into localStorage so /login auto-redirects in
    // a brand-new tab when the user is already authed (desktop can
    // re-launch the browser with a fresh state nonce — the existing
    // session must be visible to that tab).
    effect(() => {
      const user = this._user();
      if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_STORAGE_KEY);
    });
    effect(() => {
      const state = this._oauthState();
      if (state) localStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);
      else localStorage.removeItem(OAUTH_STATE_STORAGE_KEY);
    });
  }

  ingestOauthState(state: string | null): void {
    if (state) this._oauthState.set(state);
  }

  async signIn(provider: OAuthProvider): Promise<void> {
    const user = await this.adapter.signIn(provider);
    this._user.set(user);
    void this.router.navigate(['/auth-callback']);
  }

  /** Build the `mozart://auth?token=…&state=…` deep-link the desktop
   *  consumes. Returns null if no signed-in user — caller (the launch
   *  button) should bounce back to /login in that edge case.
   *
   *  Hand-built string rather than `new URL()` : the URL constructor
   *  normalizes custom schemes by inserting a trailing slash before
   *  the query (e.g. `mozart://auth/?token=…`) which some OS / browser
   *  handlers treat as a different scheme path. The desktop's
   *  `parseDeepLink` accepts both forms, but Chrome on Linux has been
   *  observed to silently block the slashed variant. */
  buildDesktopLaunchUrl(): string | null {
    const user = this._user();
    const state = this._oauthState();
    if (!user || !state) return null;
    const params = new URLSearchParams({ token: user.token, state });
    return `mozart://auth?${params.toString()}`;
  }
}
