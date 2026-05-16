import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteFooterComponent } from './shell/site-footer.component';
import { SiteHeaderComponent } from './shell/site-header.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteHeaderComponent, SiteFooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-site-header />
    <main class="min-h-[calc(100vh-3.5rem)]">
      <router-outlet />
    </main>
    <app-site-footer />
  `,
})
export class App {}
