import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Subscription } from 'rxjs';
import { buildSignInUrl } from '../util-clerk-url';
import { AUTH_ADAPTER } from './auth.adapter';
import type {
  AuthSession,
  DeepLinkPayload,
  WelcomeState,
} from './auth.model';

// User-facing timeout : if the deep-link doesn't arrive within 5 min
// after clicking Sign in, the welcome screen flips to a "timed-out"
// banner inviting the user to try again. Five minutes mirrors the
// upper bound in the spec (onboarding-and-auth.md §2.3).
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

// Public surface of the `auth` domain. Features inject this — the
// adapter and the deep-link subscription stay private.
//
// Atom 1 scope :
//   - bootstrap() reads any persisted session via the adapter
//   - signIn() generates a state nonce, calls openSignIn, waits for the
//     adapter's deepLink$ to emit, validates state, saves the session,
//     and routes to /
//   - signOut() clears the session and navigates to /welcome
//
// Later atoms grow this facade :
//   - Atom 4 : crypto-random state, 5-min timeout, cancel handling
//   - Atom 6 : JWT-claims decoding, offline mode, onboarding routing
@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly adapter = inject(AUTH_ADAPTER);
  private readonly router = inject(Router);

  private readonly _session = signal<AuthSession | null>(null);
  readonly session = computed(() => this._session());
  readonly isAuthenticated = computed(() => this._session() !== null);

  readonly welcomeState = signal<WelcomeState>('idle');

  /** URL the user's default browser was last sent to. Exposed so the
   *  welcome screen can offer a "Browser didn't open? Try again" link
   *  that re-fires `shell.open` against the SAME URL — preserving the
   *  state nonce so the deep-link round-trip stays valid. */
  private readonly _signInUrl = signal<string | null>(null);
  readonly signInUrl = computed(() => this._signInUrl());

  private pendingState: string | null = null;
  private deepLinkSub: Subscription | null = null;
  private signInTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  async bootstrap(): Promise<void> {
    try {
      const stored = await this.adapter.loadSession();
      if (stored) this._session.set(stored);
    } catch (err) {
      console.warn('[auth] bootstrap load failed:', err);
    }
    this.deepLinkSub ??= this.adapter.deepLink$.subscribe((payload) => {
      void this.onDeepLink(payload);
    });
  }

  async signIn(): Promise<void> {
    if (this.welcomeState() === 'opening') return;
    const state = generateState();
    this.pendingState = state;
    const url = buildSignInUrl(state);
    this._signInUrl.set(url);
    this.welcomeState.set('opening');
    this.armTimeout();
    try {
      await this.adapter.openSignIn({ url, state });
    } catch (err) {
      console.error('[auth] openSignIn failed:', err);
      this.cancelSignIn();
    }
  }

  /** Re-fire `shell.open` with the SAME URL/state as the current flow.
   *  Used by the "Browser didn't open? Try again" link on /welcome.
   *  Safe to call repeatedly ; does nothing if no pending flow. */
  async retryOpenSignIn(): Promise<void> {
    const url = this._signInUrl();
    const state = this.pendingState;
    if (!url || !state) return;
    try {
      await this.adapter.openSignIn({ url, state });
    } catch (err) {
      console.error('[auth] retryOpenSignIn failed:', err);
    }
  }

  cancelSignIn(): void {
    this.clearTimeout();
    this.pendingState = null;
    this._signInUrl.set(null);
    this.welcomeState.set('idle');
  }

  private armTimeout(): void {
    this.clearTimeout();
    this.signInTimeoutHandle = setTimeout(() => {
      // Only flip if we're still waiting — the deep-link might have
      // arrived right before the timer fired.
      if (this.welcomeState() === 'opening') {
        this.welcomeState.set('timed-out');
      }
    }, SIGN_IN_TIMEOUT_MS);
  }

  private clearTimeout(): void {
    if (this.signInTimeoutHandle) {
      clearTimeout(this.signInTimeoutHandle);
      this.signInTimeoutHandle = null;
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.adapter.clearSession();
    } finally {
      this._session.set(null);
      this.welcomeState.set('idle');
      void this.router.navigate(['/welcome']);
    }
  }

  private async onDeepLink(payload: DeepLinkPayload): Promise<void> {
    console.info(
      '[auth] onDeepLink — pendingState=',
      this.pendingState,
      'payloadState=',
      payload.state,
    );
    if (!this.pendingState || payload.state !== this.pendingState) {
      console.warn('[auth] deep-link state mismatch — ignoring');
      this.cancelSignIn();
      return;
    }
    this.pendingState = null;
    this.clearTimeout();

    // Atom 6 decodes the JWT for expiresAt + onboarding ; Atom 1 sets
    // a 7-day fallback so the model stays well-formed.
    const session: AuthSession = {
      token: payload.token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    try {
      await this.adapter.saveSession(session);
      this._session.set(session);
      this._signInUrl.set(null);
      this.welcomeState.set('idle');
      console.info('[auth] navigating to /');
      void this.router.navigate(['/']);
    } catch (err) {
      console.error('[auth] saveSession failed:', err);
      this.cancelSignIn();
    }
  }
}

function generateState(): string {
  // 32 cryptographically-random bytes → 64-char hex. Used as the
  // OAuth `state` nonce embedded in the apps/web sign-in URL ; the
  // deep-link callback's `state` query param must match exactly.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
