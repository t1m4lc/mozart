import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-vertical-roadmap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="px-4 py-12 sm:px-6 lg:px-8">
      <div class="mx-auto max-w-5xl">
        <p
          class="text-muted-foreground mb-4 font-mono text-xs tracking-wider uppercase"
        >
          What's coming
        </p>
        <p class="text-muted-foreground mb-5 text-sm">
          We're actively building connections to the tools you already use.
        </p>
        <ul class="flex flex-wrap gap-2">
          @for (integration of integrations(); track integration) {
            <li
              class="text-muted-foreground border-border inline-flex items-center gap-1.5 rounded-md border border-dashed px-3 py-1 text-sm"
            >
              {{ integration }}
            </li>
          }
        </ul>
      </div>
    </section>
  `,
})
export class VerticalRoadmapComponent {
  readonly integrations = input.required<readonly string[]>();
}
