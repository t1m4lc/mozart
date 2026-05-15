import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmSpinnerImports } from '@mozart/ui/spinner';
import { ClerkService } from '@mozart/clerk';
import { AuthFacade } from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

// How long we give Clerk to settle before declaring sign-in failed.
// Clerk's session listener typically fires within 100-300 ms once the
// page mounts — 2 s is generous. Pushed higher only buys us more
// "Signing you in" spinner time for users with slow networks.
const SETTLE_TIMEOUT_MS = 2000;

// /auth-callback — intermediate route reached after Clerk's hosted
// OAuth flow redirects back to apps/web. By the time this page
// mounts, `provideClerk`'s appInitializer has already awaited
// `clerk.load()` — so Clerk has consulted the session cookie and
// `isAuthenticated()` is the source of truth.
//
// On a successful round-trip : navigate to /dashboard.
// On failure (no session, or stuck in a sign-in attempt) : after a
// short timeout surface a diagnostic message + a button back to
// /login. We deliberately do NOT auto-bounce back to /login because
// the silent redirect made every Clerk dashboard misconfiguration
// look identical to the user.
@Component({
  selector: 'app-auth-callback-page',
  imports: [HlmButtonImports, HlmSpinnerImports, UiAuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      @if (state() === 'waiting') {
        <span card-title>Signing you in</span>
        <span card-subtitle>One moment please.</span>
        <hlm-spinner aria-label="Signing in" />
      } @else {
        <span card-title>Sign-in didn't complete</span>
        <span card-subtitle>
          Clerk routed back without a session. The most common cause is
          a missing Fallback Development Host or path in the Clerk
          dashboard — see docs/setup-clerk.md §3.
        </span>
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
    console.info(
      '[auth-callback] mount — clerk.isLoaded:',
      this.clerk.isLoaded(),
      'user:',
      this.clerk.user(),
      'session:',
      this.clerk.session(),
    );

    // Race : Clerk's listener may fire any moment after mount with the
    // resolved session. We arm a 2 s fallback that flips to "failed"
    // and clear it as soon as isAuthenticated() turns true.
    this.timeoutHandle = setTimeout(() => {
      console.warn(
        '[auth-callback] settle timeout — Clerk did not produce a session within',
        SETTLE_TIMEOUT_MS,
        'ms',
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
