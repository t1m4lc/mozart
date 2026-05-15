import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import {
  AuthFacade,
  FeatureLaunchMozart,
  type OAuthProvider,
} from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

// /login — single hub for everything browser-side auth.
//
// Two presentations driven by `AuthFacade.isAuthenticated()` :
//
//   - Not signed in : OAuth buttons (GitHub / Google) — the primary
//     entry. Clicking either runs the (mock) Clerk OAuth dance and
//     redirects to /auth-callback → /dashboard.
//   - Already signed in : Launch UX at the top (mounts
//     `FeatureLaunchMozart` which hits the localhost callback). The
//     OAuth buttons remain visible below a divider for the rare case
//     where the user wants to switch accounts — they're not the
//     primary action, just an escape hatch.
//
// Capturing the desktop handoff (`?state=…&port=…`) happens
// regardless of auth state ; the facade persists both to localStorage
// so a refresh or a new tab still has the values.
@Component({
  selector: 'app-login-page',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmSpinnerImports,
    HlmTypographyImports,
    UiAuthCard,
    FeatureLaunchMozart,
  ],
  providers: [provideIcons({ lucideGithub, lucideMail })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      <span card-title>{{ title() }}</span>
      <span card-subtitle>{{ subtitle() }}</span>

      @if (authed()) {
        <app-feature-launch-mozart />

        <div class="text-muted-foreground my-2 flex items-center gap-3 text-xs">
          <span class="bg-border h-px flex-1"></span>
          <span>or use another account</span>
          <span class="bg-border h-px flex-1"></span>
        </div>
      }

      <button
        hlmBtn
        type="button"
        class="w-full"
        [variant]="authed() ? 'outline' : 'default'"
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
   *  clicked button and disables both buttons while the page is
   *  about to unload. Stays `null` until the user clicks. */
  protected readonly busy = signal<OAuthProvider | null>(null);
  protected readonly authed = computed(() => this.auth.isAuthenticated());
  protected readonly firstName = computed(() => {
    const fullName = this.auth.user()?.name ?? '';
    return fullName.split(' ')[0] || 'there';
  });

  protected readonly title = computed(() =>
    this.authed() ? `Welcome back, ${this.firstName()}` : 'Sign in to Mozart',
  );
  protected readonly subtitle = computed(() =>
    this.authed()
      ? 'Launch Mozart on your computer to continue.'
      : 'Continue with your account.',
  );

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
      // `signIn` triggers a redirect — the page is unloading. We do
      // NOT clear `busy()` on success so the spinner stays until the
      // navigation actually starts. If the redirect doesn't happen
      // within 8 s, give the button back to the user so they can
      // retry without a full page reload.
      setTimeout(() => this.busy.set(null), 8000);
    } catch (err) {
      console.error('[login] signIn failed:', err);
      this.busy.set(null);
    }
  }
}
