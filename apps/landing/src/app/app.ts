import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs/operators';
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
  private readonly router = inject(Router);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly isHome = computed(() => {
    const url = (this.url() ?? '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\/$/, '');
    return url === '';
  });
}
