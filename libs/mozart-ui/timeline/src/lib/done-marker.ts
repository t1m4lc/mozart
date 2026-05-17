import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleCheck } from '@ng-icons/lucide';
import { TimelineItem } from './timeline-item';

// Phase 3b — final marker rendered when state.outcome === 'done'.
// Per spec §A.6 the gutter has the icon but NO connector line below
// (the timeline visually terminates here). Default green tint.

@Component({
  selector: 'mz-done-marker',
  imports: [HlmIconImports, TimelineItem],
  providers: [provideIcons({ lucideCircleCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <mz-timeline-item [showConnector]="false">
      <ng-icon
        hlmRowIcon
        hlm
        name="lucideCircleCheck"
        size="xs"
        class="text-emerald-600 dark:text-emerald-500"
      />
      <p class="text-sm text-muted-foreground">Done</p>
    </mz-timeline-item>
  `,
})
export class DoneMarker {}
