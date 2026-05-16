import { ChangeDetectionStrategy, Component } from '@angular/core';

const PLACEHOLDER_BRANDS = [
  'ACME',
  'BUILDR',
  'STACKLY',
  'FORGE',
  'NOVA',
  'PRISM',
  'AXIOM',
  'OCTAVE',
] as const;

@Component({
  selector: 'app-trusted-by',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="mx-auto max-w-6xl px-4 py-16 md:px-8">
      <p class="text-muted-foreground mb-6 w-full text-center text-sm">
        Trusted by builders at
      </p>
      <ul
        class="mx-auto grid max-w-2xl grid-cols-4 items-center gap-4 sm:gap-6"
      >
        @for (brand of brands; track brand) {
          <li
            class="text-muted-foreground flex h-8 items-center justify-center font-mono text-sm font-semibold tracking-wider sm:h-10 sm:text-base"
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
