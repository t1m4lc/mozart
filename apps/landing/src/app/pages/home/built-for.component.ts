import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideMegaphone,
  lucideStore,
  lucideTrendingUp,
  lucideUsers,
} from '@ng-icons/lucide';
import { HlmIconImports } from '@spartan-ui/icon';

interface VerticalCard {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly href: string;
}

const VERTICAL_CARDS: readonly VerticalCard[] = [
  {
    icon: 'lucideTrendingUp',
    title: 'Sales',
    description:
      'Prepare accounts, draft follow-ups, and keep deal context organized.',
    href: '/for/sales',
  },
  {
    icon: 'lucideMegaphone',
    title: 'Marketing',
    description:
      'Turn briefs, brand context, and campaign files into review-ready work.',
    href: '/for/marketing',
  },
  {
    icon: 'lucideUsers',
    title: 'Recruiting',
    description:
      'Summarize, draft, and coordinate recruiting work while keeping judgment human.',
    href: '/for/recruiting',
  },
  {
    icon: 'lucideStore',
    title: 'Small Teams',
    description:
      'Handle reports, documents, numbers, and operations from one local workspace.',
    href: '/for/small-business',
  },
] as const;

@Component({
  selector: 'app-built-for',
  imports: [HlmIconImports, NgIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideMegaphone,
      lucideStore,
      lucideTrendingUp,
      lucideUsers,
    }),
  ],
  host: { class: 'block' },
  template: `
    <section class="px-4 py-16 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-5xl">
        <p
          class="text-muted-foreground mb-3 font-mono text-xs tracking-wider uppercase"
        >
          Solutions
        </p>
        <h2 class="text-foreground mb-2 text-2xl font-semibold tracking-tight">
          Built for the way you work
        </h2>
        <p class="text-muted-foreground mb-10 text-sm">
          Same app, your context. See what Mozart looks like for your work.
        </p>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          @for (card of cards; track card.href) {
            <a
              [routerLink]="card.href"
              class="bg-card border-border hover:border-primary/40 group flex flex-col gap-3 rounded-xl border p-5 transition-colors"
            >
              <ng-icon
                hlm
                [name]="card.icon"
                size="sm"
                class="text-muted-foreground"
              />
              <span class="text-foreground text-sm font-semibold">
                {{ card.title }}
              </span>
              <span class="text-muted-foreground flex-1 text-sm leading-relaxed">
                {{ card.description }}
              </span>
              <span
                class="text-primary inline-flex items-center gap-1 text-xs font-medium"
              >
                See Mozart for {{ card.title }}
                <ng-icon
                  hlm
                  size="xs"
                  name="lucideArrowRight"
                  class="transition-transform duration-200 group-hover:translate-x-1"
                />
              </span>
            </a>
          }
        </div>
      </div>
    </section>
  `,
})
export class BuiltForComponent {
  protected readonly cards = VERTICAL_CARDS;
}
