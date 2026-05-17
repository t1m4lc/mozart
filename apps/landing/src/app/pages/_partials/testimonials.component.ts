import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideBadgeCheck } from '@ng-icons/lucide';

interface Testimonial {
  readonly quote: string;
  readonly name: string;
  readonly role: string;
  readonly avatar: string;
}

const PLACEHOLDER_QUOTE =
  'Placeholder quote — replace before launch with a real beta-tester voice.';

const TESTIMONIALS: readonly Testimonial[] = [
  {
    quote: PLACEHOLDER_QUOTE,
    name: 'Alex M.',
    role: 'Founding Engineer, Placeholder Co.',
    avatar: 'https://i.pravatar.cc/80?img=12',
  },
  {
    quote: PLACEHOLDER_QUOTE,
    name: 'Priya R.',
    role: 'Tech Lead, Placeholder Co.',
    avatar: 'https://i.pravatar.cc/80?img=47',
  },
  {
    quote: PLACEHOLDER_QUOTE,
    name: 'Sam W.',
    role: 'Staff Engineer, Placeholder Co.',
    avatar: 'https://i.pravatar.cc/80?img=33',
  },
  {
    quote: PLACEHOLDER_QUOTE,
    name: 'Jordan K.',
    role: 'Software Engineer, Placeholder Co.',
    avatar: 'https://i.pravatar.cc/80?img=15',
  },
  {
    quote: PLACEHOLDER_QUOTE,
    name: 'Casey L.',
    role: 'Product Engineer, Placeholder Co.',
    avatar: 'https://i.pravatar.cc/80?img=49',
  },
  {
    quote: PLACEHOLDER_QUOTE,
    name: 'Riley T.',
    role: 'Engineering Lead, Placeholder Co.',
    avatar: 'https://i.pravatar.cc/80?img=8',
  },
] as const;

@Component({
  selector: 'app-testimonials',
  imports: [HlmIconImports, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideBadgeCheck })],
  host: { class: 'block' },
  template: `
    <section class="mx-auto max-w-6xl py-16">
      <div class="relative md:hidden">
        <div
          aria-hidden="true"
          class="from-background pointer-events-none absolute top-0 bottom-4 left-0 z-10 w-8 bg-gradient-to-r to-transparent"
        ></div>
        <div
          aria-hidden="true"
          class="from-background pointer-events-none absolute top-0 right-0 bottom-4 z-10 w-8 bg-gradient-to-l to-transparent"
        ></div>
        <div class="scrollbar-hide overflow-x-auto px-4 pb-4">
          <ul class="flex w-max gap-4">
            @for (item of testimonials; track item.name) {
              <li
                class="border-border bg-muted flex w-72 shrink-0 flex-col gap-4 rounded-lg border p-4"
              >
                <p class="text-foreground text-sm">{{ item.quote }}</p>
                <div class="flex items-center gap-3">
                  <img
                    [src]="item.avatar"
                    [alt]="item.name"
                    width="40"
                    height="40"
                    loading="lazy"
                    decoding="async"
                    class="border-border size-10 shrink-0 rounded-full border object-cover"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1">
                      <span
                        class="text-foreground truncate text-sm font-medium"
                      >
                        {{ item.name }}
                      </span>
                      <ng-icon
                        hlm
                        size="sm"
                        name="lucideBadgeCheck"
                        class="text-foreground shrink-0"
                        aria-hidden="true"
                      />
                    </div>
                    <p class="text-muted-foreground truncate text-sm">
                      {{ item.role }}
                    </p>
                  </div>
                </div>
              </li>
            }
          </ul>
        </div>
      </div>

      <ul class="hidden gap-4 px-4 md:grid md:grid-cols-3 md:px-8">
        @for (item of testimonials; track item.name) {
          <li
            class="border-border bg-muted flex flex-col gap-4 rounded-lg border p-4"
          >
            <p class="text-foreground text-sm">{{ item.quote }}</p>
            <div class="flex items-center gap-3">
              <img
                [src]="item.avatar"
                [alt]="item.name"
                width="40"
                height="40"
                loading="lazy"
                decoding="async"
                class="border-border size-10 shrink-0 rounded-full border object-cover"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1">
                  <span class="text-foreground truncate text-sm font-medium">
                    {{ item.name }}
                  </span>
                  <ng-icon
                    hlm
                    size="sm"
                    name="lucideBadgeCheck"
                    class="text-foreground shrink-0"
                    aria-hidden="true"
                  />
                </div>
                <p class="text-muted-foreground truncate text-sm">
                  {{ item.role }}
                </p>
              </div>
            </div>
          </li>
        }
      </ul>
    </section>
  `,
})
export class TestimonialsComponent {
  protected readonly testimonials = TESTIMONIALS;
}
