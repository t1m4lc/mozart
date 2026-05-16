import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FOOTER_NAV } from './nav-model';
import { SITE_CONFIG } from './site-config';

@Component({
  selector: 'app-site-footer',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <footer
      class="bg-muted border-border relative mt-16 overflow-hidden border-t px-6 pt-16 pb-12 font-mono sm:px-8"
    >
      <div class="relative mx-auto max-w-5xl">
        <div
          class="grid w-full grid-cols-2 gap-x-12 gap-y-10 sm:grid-cols-4 sm:gap-x-16"
        >
          @for (column of columns; track column.title) {
            <div class="flex min-w-0 flex-col items-start gap-4 text-left">
              <span class="text-muted-foreground text-sm">
                [{{ column.title }}]
              </span>
              <ul class="flex flex-col gap-2">
                @for (link of column.links; track link.label + link.href) {
                  <li>
                    @if (link.external) {
                      <a
                        [href]="link.href"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-foreground hover:text-foreground/70 text-sm transition-colors"
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
                    } @else {
                      <a
                        [routerLink]="link.href"
                        class="text-foreground hover:text-foreground/70 text-sm transition-colors"
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

        <div class="mt-16">
          <span class="text-muted-foreground text-sm">
            © {{ year }} {{ company }}
          </span>
        </div>
      </div>
    </footer>
  `,
})
export class SiteFooterComponent {
  protected readonly columns = FOOTER_NAV;
  protected readonly company = SITE_CONFIG.company;
  protected readonly year = SITE_CONFIG.copyrightYear;
}
