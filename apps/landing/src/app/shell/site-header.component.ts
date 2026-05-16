import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ContainerComponent } from './container.component';
import { PRIMARY_NAV } from './nav-model';
import { ThemeToggleComponent } from './theme-toggle.component';

@Component({
  selector: 'app-site-header',
  imports: [
    ContainerComponent,
    RouterLink,
    RouterLinkActive,
    ThemeToggleComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'sticky top-0 z-40 w-full border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70',
  },
  template: `
    <app-container>
      <div class="flex h-14 items-center justify-between gap-4">
        <a
          routerLink="/"
          class="text-foreground hover:text-foreground/80 text-base font-semibold tracking-tight transition-colors"
        >
          Mozart
        </a>

        <nav
          aria-label="Primary"
          class="hidden items-center gap-1 md:flex"
        >
          @for (link of nav; track link.href) {
            <a
              [routerLink]="link.href"
              routerLinkActive="text-foreground"
              [routerLinkActiveOptions]="{ exact: false }"
              class="text-muted-foreground hover:text-foreground rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            >
              {{ link.label }}
            </a>
          }
        </nav>

        <div class="flex items-center gap-1">
          <app-theme-toggle />
        </div>
      </div>
    </app-container>
  `,
})
export class SiteHeaderComponent {
  protected readonly nav = PRIMARY_NAV;
}
