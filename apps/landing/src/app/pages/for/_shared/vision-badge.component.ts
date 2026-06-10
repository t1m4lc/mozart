import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { FeatureStatus } from './vertical-config';

// Honesty guardrail rendered by the template, not optional copy: every
// workflow visibly declares whether it works in the developer preview today
// or is part of the vision we're building toward.
@Component({
  selector: 'app-vision-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    @if (status() === 'today') {
      <span
        class="bg-muted border-border text-muted-foreground inline-flex items-center rounded-sm border px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
      >
        In developer preview
      </span>
    } @else {
      <span
        class="text-muted-foreground/80 border-border inline-flex items-center rounded-sm border border-dashed px-1 py-0.5 font-mono text-xs tracking-wider uppercase"
      >
        Vision
      </span>
    }
  `,
})
export class VisionBadgeComponent {
  readonly status = input.required<FeatureStatus>();
}
