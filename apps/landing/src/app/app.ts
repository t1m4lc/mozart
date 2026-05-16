import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
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
  template: `
    <app-promo-strip />
    <app-site-header />
    <main class="min-h-[calc(100vh-3.5rem)]">
      <router-outlet />
    </main>
    <app-site-footer />
  `,
})
export class App {}
