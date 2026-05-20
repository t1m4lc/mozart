import { ChangeDetectionStrategy, Component } from '@angular/core';

const PLACEHOLDER_BRANDS = [
  'Helix Labs',
  'Stagewise',
  'Supabase',
  'Loop Robotics',
  'Cartograph',
  'Vela',
  'Sentry',
  'PostHog',
] as const;

@Component({
  selector: 'app-trusted-by',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="mx-auto max-w-6xl px-4 pt-16 pb-6 md:px-8">
      <p class="text-muted-foreground mb-6 w-full text-center text-sm">
        Trusted by builders at
      </p>
      <ul
        class="mx-auto grid max-w-2xl grid-cols-2 md:grid-cols-4 items-center gap-3 md:gap-6"
      >
        @for (brand of brands; track brand) {
          <li
            class="uppercase text-muted-foreground flex h-8 items-baseline justify-center font-mono text-sm font-semibold tracking-wider sm:h-10 sm:text-base"
          >
            {{ brand }}
          </li>
        }
      </ul>
    </section>
  `,
})
export class TrustedByComponent {
  protected readonly brands = PLACEHOLDER_BRANDS;
}
