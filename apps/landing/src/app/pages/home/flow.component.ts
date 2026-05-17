import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-flow',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="px-4 py-16 sm:px-8">
      <div class="mx-auto max-w-4xl">
        <span
          class="bg-muted border-border text-muted-foreground mb-8 inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
        >
          The Flow
        </span>
        <div
          class="border-border bg-muted/40 flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed"
        >
          <span class="text-muted-foreground font-mono text-sm">
            [ Soon available ]
          </span>
        </div>
      </div>
    </section>
  `,
})
export class FlowComponent {}
