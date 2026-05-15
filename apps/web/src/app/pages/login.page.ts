import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSpinnerImports } from '@mozart/ui/spinner';
import { HlmTypographyImports } from '@mozart/ui/typography';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub, lucideMail } from '@ng-icons/lucide';
import { AuthFacade, type OAuthProvider } from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

// /login — single-purpose page. Reachable only when the user is NOT
// authenticated (the `redirectIfAuthedGuard` on the route bounces
// signed-in visitors straight to /dashboard). Renders the two OAuth
// providers and disables both while a redirect is in flight ; per-
// button spinner makes the "I clicked, something is happening" cue
// obvious during the redirect's brief but variable latency.
@Component({
  selector: 'app-login-page',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmSpinnerImports,
    HlmTypographyImports,
    UiAuthCard,
  ],
  providers: [provideIcons({ lucideGithub, lucideMail })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      <span card-title>Sign in to Mozart</span>
      <span card-subtitle>Continue with your account.</span>

      <button
        hlmBtn
        type="button"
        class="w-full"
        [disabled]="busy() !== null"
        (click)="onProvider('github')"
      >
        @if (busy() === 'github') {
          <hlm-spinner class="size-4" />
          Redirecting to GitHub…
        } @else {
          <ng-icon hlm name="lucideGithub" size="sm" />
          Sign in with GitHub
        }
      </button>

      <button
        hlmBtn
        variant="outline"
        type="button"
        class="w-full"
        [disabled]="busy() !== null"
        (click)="onProvider('google')"
      >
        @if (busy() === 'google') {
          <hlm-spinner class="size-4" />
          Redirecting to Google…
        } @else {
          <ng-icon hlm name="lucideMail" size="sm" />
          Sign in with Google
        }
      </button>
    </app-ui-auth-card>
  `,
})
export class LoginPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthFacade);

  /** Which provider is mid-redirect — drives the spinner inside the
   *  clicked button and disables both while the page is about to
   *  unload. */
  protected readonly busy = signal<OAuthProvider | null>(null);

  constructor() {
    // Capture the desktop handoff (state nonce + callback port) as
    // soon as the route resolves and feed them to the facade.
    // Subsequent navigations preserve both via facade signals — no
    // need to thread them through query params.
    const params = this.route.snapshot.queryParamMap;
    this.auth.ingestDesktopHandoff(params.get('state'), params.get('port'));
  }

  protected async onProvider(provider: OAuthProvider): Promise<void> {
    if (this.busy() !== null) return;
    this.busy.set(provider);
    try {
      await this.auth.signIn(provider);
      // `signIn` triggers a redirect — the page is unloading. Keep
      // the spinner until the navigation actually starts. If the
      // redirect doesn't happen within 8 s, give the buttons back so
      // the user can retry without a full page reload.
      setTimeout(() => this.busy.set(null), 8000);
    } catch (err) {
      console.error('[login] signIn failed:', err);
      this.busy.set(null);
    }
  }
}
