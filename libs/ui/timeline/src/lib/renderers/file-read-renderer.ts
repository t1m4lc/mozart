import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { HlmIconImports } from '@mozart/ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideFileText } from '@ng-icons/lucide';
import { SHIMMER_TEXT_STYLES } from '../_shimmer.styles';
import { FileChip } from '../file-chip';
import { FileChipBus } from '../file-chip-bus';
import { TimelineItem } from '../timeline-item';
import type { TurnItem } from '../turn-state.types';

// Phase 3b — file read renderer (view, read_file). Shows the path in
// a `read` chip variant; no diff stats. The body slot is unused —
// reads don't have a meaningful expandable detail.

@Component({
  selector: 'hlm-file-read-renderer',
  imports: [HlmIconImports, TimelineItem, FileChip],
  providers: [provideIcons({ lucideFileText })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <hlm-timeline-item
      [showSpacer]="showSpacer()"
      [showConnector]="showConnector()"
    >
      <ng-icon
        hlmRowIcon
        hlm
        name="lucideFileText"
        size="xs"
        [class]="_iconClass()"
      />
      <div class="flex flex-wrap items-center gap-2">
        <span
          class="text-sm"
          [class.shimmer-text]="_isActive()"
          [class.text-destructive]="_isError()"
          [class.text-muted-foreground]="!_isActive() && !_isError()"
        >
          {{ item().title || 'Read' }}
        </span>
        @if (item().fileChip; as chip) {
          <hlm-file-chip
            [chip]="chip"
            variant="read"
            (chipClick)="_onChipClick($event)"
          />
        }
      </div>
    </hlm-timeline-item>
  `,
  styles: [SHIMMER_TEXT_STYLES],
})
export class FileReadRenderer {
  readonly item = input.required<TurnItem>();
  readonly showSpacer = input<boolean>(true);
  readonly showConnector = input<boolean>(true);
  readonly chipClick = output<string>();

  protected readonly _isActive = computed(
    () => this.item().state === 'active',
  );
  protected readonly _isError = computed(() => this.item().state === 'error');
  protected readonly _iconClass = computed(() => {
    const state = this.item().state;
    if (state === 'error') return 'text-destructive';
    if (state === 'active') return 'text-foreground';
    return 'text-muted-foreground';
  });

  private readonly _bus = inject(FileChipBus, { optional: true });

  protected _onChipClick(path: string): void {
    this.chipClick.emit(path);
    this._bus?.emit(path);
  }
}
