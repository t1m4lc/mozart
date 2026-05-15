import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub, lucideMail } from '@ng-icons/lucide';
import { AuthFacade } from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

// /login — entry point. Captures the inbound `?state=…` nonce passed
// by the desktop's `shell.open` call, presents two OAuth buttons.
// Mocked auth lives in `mockClerkAdapter` ; behavior is otherwise
// identical to the real Clerk integration we'll wire post-MVP.
@Component({
  selector: 'app-login-page',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    UiAuthCard,
  ],
  providers: [provideIcons({ lucideGithub, lucideMail })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      <span card-title>Start composing</span>
      <span card-subtitle>Sign in to continue</span>

      <button
        hlmBtn
        type="button"
        class="w-full"
        [disabled]="busy()"
        (click)="onGithub()"
      >
        <ng-icon hlm name="lucideGithub" size="sm" />
        Continue with GitHub
      </button>

      <button
        hlmBtn
        variant="outline"
        type="button"
        class="w-full"
        [disabled]="busy()"
        (click)="onGoogle()"
      >
        <ng-icon hlm name="lucideMail" size="sm" />
        Continue with Google
      </button>
    </app-ui-auth-card>
  `,
})
export class LoginPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthFacade);
  protected readonly busy = signal(false);

  constructor() {
    // Capture the state nonce as soon as the route resolves and feed
    // it to the facade. Subsequent navigations preserve it via the
    // facade signal — no need to thread it through query params.
    const state = this.route.snapshot.queryParamMap.get('state');
    this.auth.ingestOauthState(state);

    // If the user is already signed in (typical case : desktop sends
    // them here a second time with a fresh state nonce after a
    // restart or sign-out), skip the OAuth dance and go straight to
    // /dashboard — the new state nonce is already ingested above.
    if (this.auth.isAuthenticated()) {
      void this.router.navigate(['/dashboard']);
    }
  }

  protected async onGithub(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.signIn('github');
    } finally {
      this.busy.set(false);
    }
  }

  protected async onGoogle(): Promise<void> {
    this.busy.set(true);
    try {
      await this.auth.signIn('google');
    } finally {
      this.busy.set(false);
    }
  }
}
