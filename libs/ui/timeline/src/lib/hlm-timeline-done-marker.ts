import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheck } from '@ng-icons/lucide';

@Component({
  selector: 'hlm-timeline-done-marker',
  imports: [NgIcon, HlmIconImports],
  providers: [provideIcons({ lucideCircleCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex items-center gap-3' },
  template: `
    <span class="relative flex w-5 shrink-0 justify-center">
      <ng-icon
        hlm
        name="lucideCircleCheck"
        size="sm"
        class="text-green-600 dark:text-green-400"
      />
    </span>
    <span class="text-sm font-medium text-foreground">Done</span>
  `,
})
export class HlmTimelineDoneMarker {}
