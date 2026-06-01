import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideUserRound } from '@ng-icons/lucide';
import { HlmButton } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { AuthFacade, FeatureLaunchMozart } from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

// /dashboard — landing page after `/auth-callback`. Wraps the launch
// feature in the shared auth card chrome (logo + heading) so the page
// is visually consistent with /login. A top-right Account link
// surfaces the /account destination ; sign-out lives there, not here.
@Component({
  selector: 'app-dashboard-page',
  imports: [
    FeatureLaunchMozart,
    UiAuthCard,
    RouterLink,
    HlmButton,
    HlmIconImports,
    NgIcon,
  ],
  providers: [provideIcons({ lucideUserRound })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a
      hlmBtn
      variant="secondary"
      routerLink="/account"
      class="fixed top-4 right-4 z-10"
    >
      <ng-icon hlm name="lucideUserRound" size="sm" />
      Account
    </a>

    <app-ui-auth-card>
      <span card-title>Welcome back, {{ firstName() }}</span>
      <app-feature-launch-mozart />
    </app-ui-auth-card>
  `,
})
export class DashboardPage {
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthFacade);
  protected readonly firstName = computed(
    () => this.auth.user()?.firstName || 'there',
  );

  constructor() {
    // When redirectIfAuthedGuard bounces an already-authenticated user
    // from /login?state=X&port=Y to /dashboard?state=X&port=Y, LoginPage
    // is never created so ingestDesktopHandoff is never called. Read the
    // params here so the fresh desktop nonce/port aren't silently lost.
    const params = this.route.snapshot.queryParamMap;
    this.auth.ingestDesktopHandoff(params.get('state'), params.get('port'));
  }
}
