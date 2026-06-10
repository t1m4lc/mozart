import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronLeft, lucideChevronRight } from '@ng-icons/lucide';
import type { BlogEntry } from '../../../content/blog';

@Component({
  selector: 'app-blog-prev-next',
  imports: [HlmIconImports, NgIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideChevronLeft, lucideChevronRight })],
  host: { class: 'mt-16 block' },
  template: `
    @if (prev() || next()) {
      <nav
        aria-label="Post navigation"
        class="@container border-border grid grid-cols-2 gap-4 border-t pt-8"
      >
        @if (prev(); as p) {
          <a
            [routerLink]="['/blog', p.slug]"
            class="border-border hover:bg-muted flex flex-col gap-2 rounded-lg border p-4 text-sm transition-colors @max-lg:col-span-full"
          >
            <span
              class="text-foreground inline-flex items-center gap-1.5 font-medium"
            >
              <ng-icon
                hlm
                size="sm"
                name="lucideChevronLeft"
                class="-mx-1 shrink-0"
                aria-hidden="true"
              />
              <span>{{ p.title }}</span>
            </span>
            @if (p.description) {
              <span class="text-foreground/60 truncate">
                {{ p.description }}
              </span>
            }
          </a>
        } @else {
          <span></span>
        }

        @if (next(); as n) {
          <a
            [routerLink]="['/blog', n.slug]"
            class="border-border hover:bg-muted flex flex-col gap-2 rounded-lg border p-4 text-end text-sm transition-colors @max-lg:col-span-full"
          >
            <span
              class="text-foreground inline-flex flex-row-reverse items-center gap-1.5 font-medium"
            >
              <ng-icon
                hlm
                size="sm"
                name="lucideChevronRight"
                class="-mx-1 shrink-0"
                aria-hidden="true"
              />
              <span>{{ n.title }}</span>
            </span>
            @if (n.description) {
              <span class="text-foreground/60 truncate">
                {{ n.description }}
              </span>
            }
          </a>
        }
      </nav>
    }
  `,
})
export class BlogPrevNextComponent {
  readonly prev = input<BlogEntry | null>(null);
  readonly next = input<BlogEntry | null>(null);
}
