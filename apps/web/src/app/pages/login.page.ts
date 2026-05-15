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
import { HlmTypographyImports } from '@mozart/ui/typography';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub, lucideMail } from '@ng-icons/lucide';
import { AuthFacade, FeatureLaunchMozart } from '../domains/auth';
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
        [disabled]="busy()"
        (click)="onGithub()"
      >
        <ng-icon hlm name="lucideGithub" size="sm" />
        Sign in with GitHub
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
        Sign in with Google
      </button>
    </app-ui-auth-card>
  `,
})
export class LoginPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthFacade);

  protected readonly busy = signal(false);
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
