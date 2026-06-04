import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  inject,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ClerkService } from '@mozart/clerk';
import { AnalyticsService } from '@mozart/shared-util-analytics';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class App {
  private readonly analytics = inject(AnalyticsService);
  private readonly clerk = inject(ClerkService);

  constructor() {
    afterNextRender(() => {
      void this.analytics.init();
      // Returning users arrive with a live Clerk session and never pass
      // through /auth-callback. Identify them here so their pageviews and
      // events attach to the same person (identify() queues until init).
      const userId = this.clerk.user()?.id;
      if (userId) this.analytics.identify(userId);
    });
  }
}
