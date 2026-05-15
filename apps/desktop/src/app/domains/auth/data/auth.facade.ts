import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { Subscription } from 'rxjs';
import { AUTH_ADAPTER } from './auth.adapter';
import type {
  AuthSession,
  DeepLinkPayload,
  WelcomeState,
} from './auth.model';

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

  private pendingState: string | null = null;
  private deepLinkSub: Subscription | null = null;

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
    this.welcomeState.set('opening');
    try {
      // URL is a placeholder in Atom 1 ; the fake adapter ignores it.
      // Atom 4 builds the real apps/web URL via util-clerk-url.
      await this.adapter.openSignIn({ url: '', state });
    } catch (err) {
      console.error('[auth] openSignIn failed:', err);
      this.cancelSignIn();
    }
  }

  cancelSignIn(): void {
    this.pendingState = null;
    this.welcomeState.set('idle');
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

    // Flip the welcome screen to its "Connecting…" state so the user
    // gets feedback during the Stronghold save (up to ~1.5 s with the
    // timeout-guard) instead of staring at "Opening browser…" frozen.
    this.welcomeState.set('authenticating');

    // Atom 6 decodes the JWT for expiresAt + onboarding ; Atom 1 sets
    // a 7-day fallback so the model stays well-formed.
    const session: AuthSession = {
      token: payload.token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    // Minimum display time for the "Connecting…" state so a fast
    // save doesn't blink past it. UX feels intentional rather than
    // glitchy.
    const minDisplay = new Promise<void>((resolve) =>
      setTimeout(resolve, 400),
    );
    try {
      await this.adapter.saveSession(session);
      await minDisplay;
      this._session.set(session);
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
  // Atom 4 swaps this for a crypto-random 32-byte hex string.
  return `state.${crypto.randomUUID()}`;
}
