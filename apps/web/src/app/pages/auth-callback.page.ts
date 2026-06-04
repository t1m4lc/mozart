import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmSpinnerImports } from '@spartan-ui/spinner';
import { ClerkService } from '@mozart/clerk';
import { AuthFacade } from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

@Component({
  selector: 'app-auth-callback-page',
  imports: [HlmButtonImports, HlmSpinnerImports, UiAuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      <span card-title>Signing you in</span>
      <span card-subtitle>One moment please.</span>
      <hlm-spinner aria-label="Signing in" />
      <button
        hlmBtn
        variant="ghost"
        type="button"
        class="mt-2 text-xs text-muted-foreground"
        (click)="onBackToLogin()"
      >
        Having trouble? Back to sign-in
      </button>
    </app-ui-auth-card>
  `,
})
export class AuthCallbackPage {
  private readonly auth = inject(AuthFacade);
  private readonly clerk = inject(ClerkService);
  private readonly router = inject(Router);
  private readonly authed$ = toObservable(this.auth.isAuthenticated);

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    const pendingOauthUrl = this.clerk.pendingOAuthRedirectUrl();

    if (!this.auth.isAuthenticated() && pendingOauthUrl) {
      console.warn(
        '[auth-callback] pending OAuth attempt — bouncing to provider:',
        pendingOauthUrl,
      );
      window.location.assign(pendingOauthUrl);
      return;
    }

    if (!this.auth.isAuthenticated()) {
      try {
        await this.clerk.handleRedirectCallback({
          afterSignInUrl: '/dashboard',
          afterSignUpUrl: '/dashboard',
        });
      } catch (err) {
        console.error('[auth-callback] handleRedirectCallback rejected:', err);
        return;
      }
    }

    await firstValueFrom(this.authed$.pipe(filter((v) => v)));
    this.auth.recordAuthCompletion();
    void this.router.navigate(['/dashboard']);
  }

  protected onBackToLogin(): void {
    void this.router.navigate(['/login']);
  }
}
