import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { HlmSpinnerImports } from '@mozart/ui/spinner';
import { AuthFacade } from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

// /auth-callback — intermediate route. In the real Clerk flow this is
// where Clerk's hosted UI redirects after the OAuth round-trip ; the
// SDK reads URL fragment params and resolves the session. In the
// MVP mock the page is mostly cosmetic : a brief spinner + auto-
// navigate to /dashboard once `AuthFacade.isAuthenticated` flips true.
// If for some reason the facade has no user (direct hit on this URL),
// bounce back to /login.
@Component({
  selector: 'app-auth-callback-page',
  imports: [HlmSpinnerImports, UiAuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      <span card-title>Signing you in</span>
      <span card-subtitle>One moment please.</span>
      <hlm-spinner aria-label="Signing in" />
    </app-ui-auth-card>
  `,
})
export class AuthCallbackPage {
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.router.navigate(['/dashboard']);
      } else {
        // No user state — direct-hit on this URL or page reload.
        void this.router.navigate(['/login']);
      }
    });
  }
}
