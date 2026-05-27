import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  inject,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AnalyticsService } from '@mozart/shared-util-analytics';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`,
})
export class App {
  private readonly analytics = inject(AnalyticsService);

  constructor() {
    afterNextRender(() => {
      void this.analytics.init();
    });
  }
}
