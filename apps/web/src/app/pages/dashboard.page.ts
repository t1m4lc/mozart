import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmButton } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideUserRound } from '@ng-icons/lucide';
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
  private readonly auth = inject(AuthFacade);
  protected readonly firstName = computed(
    () => this.auth.user()?.firstName || 'there',
  );
}
