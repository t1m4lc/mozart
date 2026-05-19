import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AnalyticsService } from './shell/analytics/analytics.service';
import { injectCurrentPath } from './shell/current-path';
import { PromoStripComponent } from './shell/promo-strip.component';
import { SiteFooterComponent } from './shell/site-footer.component';
import { SiteHeaderComponent } from './shell/site-header.component';

@Component({
  selector: 'app-root',
  imports: [
    PromoStripComponent,
    RouterOutlet,
    SiteHeaderComponent,
    SiteFooterComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-screen flex-col' },
  template: `
    <app-promo-strip />
    <app-site-header />
    <main class="flex flex-1 flex-col">
      <router-outlet />
    </main>
    <app-site-footer />
  `,
})
export class App {
  private readonly path = injectCurrentPath();
  private readonly analytics = inject(AnalyticsService);

  protected readonly isHome = computed(() => this.path() === '');

  constructor() {
    afterNextRender(() => {
      void this.analytics.init();
    });
  }
}
