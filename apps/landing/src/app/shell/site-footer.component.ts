import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ContainerComponent } from './container.component';
import { FOOTER_NAV } from './nav-model';

@Component({
  selector: 'app-site-footer',
  imports: [ContainerComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'border-t border-border bg-background mt-16',
  },
  template: `
    <app-container>
      <div
        class="grid grid-cols-1 gap-8 py-12 md:grid-cols-2 lg:grid-cols-4"
      >
        @for (column of columns; track column.title) {
          <div>
            <h2
              class="text-foreground text-xs font-semibold tracking-wider uppercase"
            >
              {{ column.title }}
            </h2>
            <ul class="mt-3 space-y-2">
              @for (link of column.links; track link.label + link.href) {
                <li>
                  @if (link.external) {
                    <a
                      [href]="link.href"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {{ link.label }}
                    </a>
                  } @else if (link.disabled) {
                    <a
                      href="#"
                      aria-disabled="true"
                      tabindex="-1"
                      class="text-muted-foreground/60 pointer-events-none cursor-not-allowed text-sm"
                    >
                      {{ link.label }}
                    </a>
                    <!-- TODO Phase 12: real targets -->
                  } @else {
                    <a
                      [routerLink]="link.href"
                      class="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    >
                      {{ link.label }}
                    </a>
                  }
                </li>
              }
            </ul>
          </div>
        }
      </div>

      <div
        class="border-border text-muted-foreground border-t py-6 text-xs"
      >
        © {{ year }} Mozart
      </div>
    </app-container>
  `,
})
export class SiteFooterComponent {
  protected readonly columns = FOOTER_NAV;
  protected readonly year = new Date().getFullYear();
}
