import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowDown,
  lucideFileText,
  lucideSparkles,
} from '@ng-icons/lucide';
import { HlmIconImports } from '@spartan-ui/icon';
import type { VerticalScenario } from './vertical-config';

@Component({
  selector: 'app-vertical-scenarios',
  imports: [HlmIconImports, NgIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({ lucideArrowDown, lucideFileText, lucideSparkles }),
  ],
  host: { class: 'block' },
  template: `
    <section class="px-4 py-16 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-5xl">
        <p
          class="text-muted-foreground mb-3 font-mono text-xs tracking-wider uppercase"
        >
          How it feels
        </p>
        <h2 class="text-foreground mb-10 text-2xl font-semibold tracking-tight">
          Tell an agent what you need
        </h2>

        <div class="grid gap-4 md:grid-cols-2">
          @for (scenario of scenarios(); track scenario.instruction) {
            <div
              class="bg-card border-border flex flex-col gap-4 rounded-xl border p-5"
            >
              <!-- instruction -->
              <div>
                <p
                  class="text-muted-foreground/60 mb-1.5 font-mono text-[10px] uppercase tracking-wider"
                >
                  You
                </p>
                <p class="text-foreground text-sm leading-relaxed">
                  “{{ scenario.instruction }}”
                </p>
              </div>

              <!-- agent reads -->
              <div>
                <p
                  class="text-muted-foreground/60 mb-1.5 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider"
                >
                  <ng-icon hlm size="xs" name="lucideSparkles" />
                  Agent reads
                </p>
                <div class="flex flex-wrap gap-1.5">
                  @for (file of scenario.files; track file) {
                    <span
                      class="text-muted-foreground border-border inline-flex max-w-full items-center gap-1 rounded border px-2 py-0.5 font-mono text-xs"
                    >
                      <ng-icon hlm size="xs" name="lucideFileText" />
                      <span class="truncate">{{ file }}</span>
                    </span>
                  }
                </div>
              </div>

              <ng-icon
                hlm
                size="xs"
                name="lucideArrowDown"
                class="text-muted-foreground/50"
              />

              <!-- output -->
              <div
                class="border-border bg-primary/5 dark:bg-primary/10 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <span
                  class="text-foreground/80 truncate font-mono text-xs"
                  >✓ {{ scenario.output }}</span
                >
                <span
                  class="text-primary shrink-0 font-mono text-[10px] uppercase tracking-wider"
                >
                  Ready to review
                </span>
              </div>
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class VerticalScenariosComponent {
  readonly scenarios = input.required<readonly VerticalScenario[]>();
}
