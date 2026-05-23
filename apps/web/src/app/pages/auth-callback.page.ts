import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmSpinnerImports } from '@spartan-ui/spinner';
import { ClerkService } from '@mozart/clerk';
import { AuthFacade } from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

// Settle timeout. Clerk usually fires the listener within a few
// hundred ms once handleRedirectCallback resolves — 4 s is enough
// headroom for slow networks without dragging out the error state.
const SETTLE_TIMEOUT_MS = 4000;

// /auth-callback — intermediate route reached after Clerk's OAuth
// flow redirects back to apps/web.
//
// On mount :
//   1. Detect a pending sign-in attempt with a verification URL
//      (= `@clerk/clerk-js@6.11.0` SDK bug where the SDK navigated
//      here instead of to the provider). Bounce to the provider.
//   2. Otherwise call `clerk.handleRedirectCallback()` so Clerk
//      processes the URL params from the OAuth provider's return.
//      Clerk's `load()` does NOT do this implicitly for custom
//      redirect URLs ; pre-built components like `<RedirectToSignIn>`
//      handle it for you.
//   3. Wait for the session to resolve (listener fires) ; on success
//      → /dashboard. On settle timeout → show diagnostic UI with a
//      back-to-sign-in button.
@Component({
  selector: 'app-auth-callback-page',
  imports: [HlmButtonImports, HlmSpinnerImports, UiAuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      <span card-title>{{
        state() === 'waiting' ? 'Signing you in' : "Sign-in didn't complete"
      }}</span>
      <span card-subtitle>{{
        state() === 'waiting'
          ? 'One moment please.'
          : 'Clerk routed back without a session. Check docs/setup-clerk.md §3 — likely a missing Fallback Development Host or path.'
      }}</span>

      @if (state() === 'waiting') {
        <hlm-spinner aria-label="Signing in" />
      } @else {
        <button hlmBtn type="button" (click)="onBackToLogin()">
          Back to sign-in
        </button>
      }
    </app-ui-auth-card>
  `,
})
export class AuthCallbackPage {
  private readonly auth = inject(AuthFacade);
  private readonly clerk = inject(ClerkService);
  private readonly router = inject(Router);

  protected readonly state = signal<'waiting' | 'failed'>('waiting');
  private timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const pendingOauthUrl = this.clerk.pendingOAuthRedirectUrl();

    console.info(
      '[auth-callback] mount — clerk.isLoaded:',
      this.clerk.isLoaded(),
      'user:',
      this.clerk.user(),
      'session:',
      this.clerk.session(),
      'pendingOauthUrl:',
      pendingOauthUrl,
    );

    // Workaround : when @clerk/clerk-js@6.11.0 mis-navigates to
    // redirectUrl (= here) instead of the OAuth provider, the pending
    // sign-in still carries the GitHub URL. Bounce the browser to
    // the provider — same effect as if the SDK had done it.
    if (!this.auth.isAuthenticated() && pendingOauthUrl) {
      console.warn(
        '[auth-callback] pending OAuth attempt detected — bouncing to provider:',
        pendingOauthUrl,
      );
      window.location.assign(pendingOauthUrl);
      return;
    }

    // Standard path : we just landed back from the OAuth provider's
    // callback. Clerk needs to be told to process the redirect URL
    // — `load()` does NOT do this automatically for custom redirect
    // URLs. After this resolves the listener fires with the session.
    if (!this.auth.isAuthenticated()) {
      console.info('[auth-callback] running handleRedirectCallback');
      void this.clerk
        .handleRedirectCallback({
          afterSignInUrl: '/dashboard',
          afterSignUpUrl: '/dashboard',
        })
        .catch((err) => {
          console.error('[auth-callback] handleRedirectCallback rejected:', err);
        });
    }

    // Race : Clerk's listener may fire any moment with the resolved
    // session. We arm a 4 s fallback that flips to "failed" if
    // nothing happens, and clear it as soon as isAuthenticated()
    // turns true.
    this.timeoutHandle = setTimeout(() => {
      console.warn(
        '[auth-callback] settle timeout — Clerk did not produce a session within',
        SETTLE_TIMEOUT_MS,
        'ms. clerk.user:',
        this.clerk.user(),
        'clerk.session:',
        this.clerk.session(),
      );
      this.state.set('failed');
    }, SETTLE_TIMEOUT_MS);

    effect(() => {
      const authed = this.auth.isAuthenticated();
      if (authed) {
        console.info('[auth-callback] authenticated — navigating to /dashboard');
        if (this.timeoutHandle) {
          clearTimeout(this.timeoutHandle);
          this.timeoutHandle = null;
        }
        void this.router.navigate(['/dashboard']);
      }
    });
  }

  protected onBackToLogin(): void {
    void this.router.navigate(['/login']);
  }
}
