import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideClipboard,
  lucideClock,
  lucideDollarSign,
  lucideFiles,
  lucideInbox,
  lucideLayers,
  lucideMail,
  lucideSearch,
  lucideShield,
  lucideTerminal,
  lucideUsers,
} from '@ng-icons/lucide';
import { HlmIconImports } from '@spartan-ui/icon';
import type { VerticalPain } from './vertical-config';

@Component({
  selector: 'app-vertical-pains',
  imports: [HlmIconImports, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideClipboard,
      lucideClock,
      lucideDollarSign,
      lucideFiles,
      lucideInbox,
      lucideLayers,
      lucideMail,
      lucideSearch,
      lucideShield,
      lucideTerminal,
      lucideUsers,
    }),
  ],
  host: { class: 'block' },
  template: `
    <section class="border-y border-border bg-muted/30 px-4 py-16 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-5xl">
        <p
          class="text-muted-foreground mb-3 font-mono text-xs tracking-wider uppercase"
        >
          The problem with AI tools today
        </p>
        <h2 class="text-foreground mb-10 text-2xl font-semibold tracking-tight">
          Sound familiar?
        </h2>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          @for (pain of pains(); track pain.title) {
            <div class="bg-card border-border flex flex-col gap-3 rounded-xl border p-5">
              <ng-icon
                hlm
                [name]="pain.icon"
                size="sm"
                class="text-muted-foreground"
              />
              <h3 class="text-foreground text-sm font-semibold leading-snug">
                {{ pain.title }}
              </h3>
              <p class="text-muted-foreground text-sm leading-relaxed">
                {{ pain.body }}
              </p>
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class VerticalPainsComponent {
  readonly pains = input.required<readonly VerticalPain[]>();
}
