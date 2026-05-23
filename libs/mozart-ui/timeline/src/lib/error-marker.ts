import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { HlmIconImports } from '@spartan-ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideCircleX } from '@ng-icons/lucide';
import { TimelineItem } from './timeline-item';

// Phase 3b — final marker rendered when state.outcome === 'error'
// (or 'stopped' — caller decides). Per spec §A.6 / §6.3 the icon is
// destructive-tinted. The label defaults to "Error" but the host can
// override (e.g. "Stopped" for user-cancellation).

@Component({
  selector: 'mz-error-marker',
  imports: [HlmIconImports, TimelineItem],
  providers: [provideIcons({ lucideCircleX })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <mz-timeline-item [showConnector]="false">
      <ng-icon
        hlmRowIcon
        hlm
        name="lucideCircleX"
        size="xs"
        class="text-destructive"
      />
      <p class="text-sm text-destructive">{{ label() }}</p>
    </mz-timeline-item>
  `,
})
export class ErrorMarker {
  readonly label = input<string>('Error');
}
