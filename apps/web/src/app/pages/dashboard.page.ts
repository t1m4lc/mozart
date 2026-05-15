import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { AuthFacade, FeatureLaunchMozart } from '../domains/auth';
import { UiAuthCard } from '../domains/auth/ui-auth-card';

// /dashboard — landing page after `/auth-callback`. Wraps the launch
// feature in the shared auth card chrome (logo + heading + subtitle)
// so the page is visually consistent with /login.
@Component({
  selector: 'app-dashboard-page',
  imports: [FeatureLaunchMozart, UiAuthCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-ui-auth-card>
      <span card-title>Welcome back, {{ firstName() }}</span>
      <span card-subtitle>
        Launch Mozart on your computer to continue.
      </span>
      <app-feature-launch-mozart />
    </app-ui-auth-card>
  `,
})
export class DashboardPage {
  private readonly auth = inject(AuthFacade);
  protected readonly firstName = computed(() => {
    const fullName = this.auth.user()?.name ?? '';
    return fullName.split(' ')[0] || 'there';
  });
}
