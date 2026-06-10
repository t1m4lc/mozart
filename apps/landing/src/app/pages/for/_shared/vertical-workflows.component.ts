import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { VerticalWorkflow } from './vertical-config';

@Component({
  selector: 'app-vertical-workflows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="px-4 py-16 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-5xl">
        <p
          class="text-muted-foreground mb-3 font-mono text-xs tracking-wider uppercase"
        >
          Mozart in action
        </p>
        <h2 class="text-foreground mb-10 text-2xl font-semibold tracking-tight">
          How Mozart works
        </h2>

        <div class="space-y-8">
          @for (workflow of workflows(); track workflow.title; let i = $index) {
            <div>
              <div class="mb-3 flex items-baseline gap-2">
                <span class="text-muted-foreground font-mono text-xs">
                  {{ i + 1 }}.
                </span>
                <h3 class="text-foreground font-semibold">
                  {{ workflow.title }}
                </h3>
              </div>

              <div class="grid gap-3 md:grid-cols-2">
                <!-- Before -->
                <div class="bg-card border-border rounded-xl border p-5">
                  <p
                    class="text-muted-foreground/60 mb-3 font-mono text-xs uppercase tracking-wider"
                  >
                    Without Mozart
                  </p>
                  <p class="text-muted-foreground text-sm leading-relaxed">
                    {{ workflow.without }}
                  </p>
                </div>

                <!-- After -->
                <div
                  class="rounded-xl border border-border bg-primary/5 p-5 dark:bg-primary/10"
                >
                  <p
                    class="mb-3 font-mono text-xs uppercase tracking-wider text-primary"
                  >
                    With Mozart
                  </p>
                  <p class="text-foreground text-sm leading-relaxed">
                    {{ workflow.withMozart }}
                  </p>
                </div>
              </div>
            </div>
          }
        </div>
      </div>
    </section>
  `,
})
export class VerticalWorkflowsComponent {
  readonly workflows = input.required<readonly VerticalWorkflow[]>();
}
