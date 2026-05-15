import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AUTH_ADAPTER } from './auth.adapter';
import type { OAuthProvider, User } from './auth.model';

// Public surface of the apps/web `auth` domain. Pages inject this ;
// the adapter stays private. Holds the signed-in user, the OAuth
// state nonce, and the desktop callback port — both forwarded by the
// desktop in the inbound /login URL (`?state=…&port=…`).
//
// Flow :
//   /login captures ?state= + ?port=        → ingestDesktopHandoff
//   /login click provider button            → signIn(provider) → /auth-callback
//   /auth-callback waits for user signal    → /dashboard
//   /dashboard auto-fires triggerSignIn     → POST localhost:port/auth
//   → desktop receives, navigates internally
//
// Persistence : the user JSON, state nonce, and callback port are
// mirrored to `localStorage` so the session survives both hard
// navigations AND new tabs. When the desktop re-opens the browser
// with a fresh nonce / port, /login auto-redirects to /dashboard
// without re-asking for OAuth.
//
// Real Clerk handles user persistence via its own cookies / session
// machinery — when the real Clerk adapter ships, we keep state +
// port in localStorage but drop the user persistence (Clerk owns it).

const USER_STORAGE_KEY = 'mozart.web.user';
const OAUTH_STATE_STORAGE_KEY = 'mozart.web.oauthState';
const CALLBACK_PORT_STORAGE_KEY = 'mozart.web.callbackPort';

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

function loadStoredPort(): number | null {
  try {
    const raw = localStorage.getItem(CALLBACK_PORT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseInt(raw, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** Result of attempting to hand the session back to the desktop. */
export type DesktopLaunchOutcome = 'success' | 'unreachable' | 'invalid';

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly adapter = inject(AUTH_ADAPTER);
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(loadStoredUser());
  readonly user = computed(() => this._user());
  readonly isAuthenticated = computed(() => this._user() !== null);

  /** OAuth state nonce passed in by the desktop in the inbound URL.
   *  Replayed verbatim into the callback so the desktop facade can
   *  validate the round-trip. */
  private readonly _oauthState = signal<string | null>(loadStoredState());

  /** Port of the desktop's localhost HTTP callback server. Used by
   *  `triggerDesktopSignIn` to `fetch(http://127.0.0.1:<port>/auth)`.
   *  Null means the desktop hasn't told us yet (or telemetry rolled
   *  over — user re-clicks Sign in on desktop to refresh). */
  private readonly _callbackPort = signal<number | null>(loadStoredPort());

  constructor() {
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
    effect(() => {
      const port = this._callbackPort();
      if (port !== null)
        localStorage.setItem(CALLBACK_PORT_STORAGE_KEY, port.toString());
      else localStorage.removeItem(CALLBACK_PORT_STORAGE_KEY);
    });
  }

  /** Capture the desktop handoff query params from /login. Both can
   *  legitimately be null on direct URL hit (rare ; falls through to
   *  the previously-stored values). Port is parsed defensively. */
  ingestDesktopHandoff(state: string | null, port: string | null): void {
    if (state) this._oauthState.set(state);
    if (port) {
      const parsed = parseInt(port, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        this._callbackPort.set(parsed);
      }
    }
  }

  async signIn(provider: OAuthProvider): Promise<void> {
    const user = await this.adapter.signIn(provider);
    this._user.set(user);
    void this.router.navigate(['/auth-callback']);
  }

  /** Hand the JWT back to the running desktop via the localhost HTTP
   *  callback. Replaces the legacy `<a href="mozart://…">` approach
   *  which was unreliable from browsers on Linux.
   *
   *  Returns :
   *    - `success`     : desktop received the token (HTTP 200)
   *    - `unreachable` : fetch failed (desktop not running, port
   *                      changed since last sign-in, firewall, etc.)
   *    - `invalid`     : missing user, state, or port — callers must
   *                      handle the edge of /dashboard hit directly
   *                      with no preceding /login flow
   */
  async triggerDesktopSignIn(): Promise<DesktopLaunchOutcome> {
    const user = this._user();
    const state = this._oauthState();
    const port = this._callbackPort();
    if (!user || !state || !port) return 'invalid';

    const url = new URL(`http://127.0.0.1:${port}/auth`);
    url.searchParams.set('token', user.token);
    url.searchParams.set('state', state);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
      });
      return res.ok ? 'success' : 'unreachable';
    } catch {
      // Network failure = desktop not listening on that port. Could
      // be : desktop closed, restarted (new port), or never opened.
      return 'unreachable';
    }
  }
}
