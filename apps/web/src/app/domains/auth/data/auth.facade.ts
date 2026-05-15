import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ClerkService, type OAuthStrategy } from '@mozart/clerk';
import type { OAuthProvider, User } from './auth.model';

// Public surface of the apps/web `auth` domain. Pages inject this ;
// the underlying Clerk SDK stays private to the facade.
//
// Responsibilities :
//   - Map Clerk's `UserResource` (rich, mutable, Clerk-shaped) to the
//     small `User` domain type our pages render.
//   - Capture the desktop handoff (`state` nonce + callback `port`)
//     from /login query params and persist both to localStorage so
//     the values survive the Clerk OAuth round-trip (which is a hard
//     navigation away and back).
//   - Trigger OAuth sign-in via Clerk (redirect-based — the browser
//     navigates away when this runs).
//   - On the Launch flow, fetch a freshly-minted Mozart JWT from
//     Clerk's session and call the localhost HTTP callback on the
//     desktop.
//
// Mock-Clerk note : an earlier MVP iteration carried a hand-crafted
// JWT inside the User object so the desktop could decode `onboarding`
// from it. With real Clerk we configure a JWT template named
// `mozart` (see `docs/setup-clerk.md`) that bakes `onboarding` from
// `user.unsafeMetadata.onboarding` ; the token is fetched on-demand
// in `triggerDesktopSignIn` rather than cached on the user signal.

const OAUTH_STATE_STORAGE_KEY = 'mozart.web.oauthState';
const CALLBACK_PORT_STORAGE_KEY = 'mozart.web.callbackPort';
const MOZART_JWT_TEMPLATE = 'mozart';

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
  private readonly clerk = inject(ClerkService);
  private readonly router = inject(Router);

  /** Mozart domain user, derived from `clerk.user()`. Recomputes on
   *  any Clerk state change (sign-in, sign-out, profile update). */
  readonly user = computed<User | null>(() => {
    const clerkUser = this.clerk.user();
    if (!clerkUser) return null;
    return {
      id: clerkUser.id,
      email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
      name: clerkUser.fullName ?? clerkUser.firstName ?? '',
      onboarding:
        (clerkUser.unsafeMetadata?.['onboarding'] as boolean | undefined) ??
        false,
    };
  });
  readonly isAuthenticated = this.clerk.isSignedIn;

  /** OAuth state nonce passed in by the desktop in the inbound URL.
   *  Replayed verbatim into the localhost callback so the desktop
   *  facade can validate the round-trip. Persisted to localStorage
   *  because the Clerk redirect is a hard nav away and back. */
  private readonly _oauthState = signal<string | null>(loadStoredState());

  /** Port of the desktop's localhost HTTP callback server. Same
   *  persistence rationale as the state nonce above. */
  private readonly _callbackPort = signal<number | null>(loadStoredPort());

  constructor() {
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

  /** Capture the desktop handoff query params from /login. Either can
   *  legitimately be null on direct URL hit ; persisted values from
   *  localStorage stay in place when a param is missing. */
  ingestDesktopHandoff(state: string | null, port: string | null): void {
    if (state) this._oauthState.set(state);
    if (port) {
      const parsed = parseInt(port, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        this._callbackPort.set(parsed);
      }
    }
  }

  /** Trigger a redirect-based OAuth sign-in. The browser navigates to
   *  the provider — this promise resolves once the redirect is in
   *  flight, but page unload is imminent so awaiting beyond this
   *  point is not meaningful. */
  async signIn(provider: OAuthProvider): Promise<void> {
    const strategy: OAuthStrategy =
      provider === 'github' ? 'oauth_github' : 'oauth_google';
    await this.clerk.signInWithOAuth(strategy, {
      redirectUrl: '/auth-callback',
      redirectUrlComplete: '/dashboard',
    });
  }

  /** Sign the current user out via Clerk. Stays on the current page. */
  async signOut(): Promise<void> {
    await this.clerk.signOut();
    void this.router.navigate(['/login']);
  }

  /** Hand the JWT back to the running desktop via the localhost HTTP
   *  callback. Replaces the legacy `<a href="mozart://…">` approach
   *  which was unreliable from browsers on Linux.
   *
   *  Returns :
   *    - `success`     : desktop received the token (HTTP 200)
   *    - `unreachable` : fetch failed (desktop not running, port
   *                      changed since last sign-in, firewall, etc.)
   *    - `invalid`     : missing user, state, or port — typically a
   *                      direct /dashboard hit with no preceding
   *                      desktop handoff (or a token fetch failure) */
  async triggerDesktopSignIn(): Promise<DesktopLaunchOutcome> {
    const user = this.user();
    const state = this._oauthState();
    const port = this._callbackPort();
    if (!user || !state || !port) return 'invalid';

    const token = await this.clerk.getToken({ template: MOZART_JWT_TEMPLATE });
    if (!token) return 'invalid';

    const url = new URL(`http://127.0.0.1:${port}/auth`);
    url.searchParams.set('token', token);
    url.searchParams.set('state', state);

    try {
      const res = await fetch(url.toString(), {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
      });
      return res.ok ? 'success' : 'unreachable';
    } catch {
      return 'unreachable';
    }
  }
}
