import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { HlmIconImports } from '@spartan-ui/icon';
import { provideIcons } from '@ng-icons/core';
import { lucideFilePen } from '@ng-icons/lucide';
import { SHIMMER_TEXT_STYLES } from '../_shimmer.styles';
import { FileChip } from '../file-chip';
import { FileChipBus } from '../file-chip-bus';
import { TimelineItem } from '../timeline-item';
import type { TurnItem } from '../turn-state.types';

// Phase 3b — virtual renderer for a run of consecutive file-edit
// items. Replaces the noisy "edit, edit, edit" cascade with a single
// row that still carries every edit's file chip, so the diff stats
// per file remain glanceable.
//
// `items` is the slice the parent Timeline grouped together; the
// renderer treats the run as "active" if any one is still active and
// "error" if any errored, falling back to "done" otherwise. Title
// surfaces the count so the eye reads the magnitude of the change
// without counting chips.

@Component({
  selector: 'mz-file-edit-group-renderer',
  imports: [HlmIconImports, TimelineItem, FileChip],
  providers: [provideIcons({ lucideFilePen })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <mz-timeline-item
      [showSpacer]="showSpacer()"
      [showConnector]="showConnector()"
    >
      <ng-icon
        hlmRowIcon
        hlm
        name="lucideFilePen"
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
          {{ _title() }}
        </span>
        @for (chip of _chips(); track chip.label) {
          <mz-file-chip
            [chip]="chip"
            variant="edit"
            (chipClick)="_onChipClick($event)"
          />
        }
      </div>
    </mz-timeline-item>
  `,
  styles: [SHIMMER_TEXT_STYLES],
})
export class FileEditGroupRenderer {
  readonly items = input.required<readonly TurnItem[]>();
  readonly showSpacer = input<boolean>(true);
  readonly showConnector = input<boolean>(true);
  readonly chipClick = output<string>();

  protected readonly _isActive = computed(() =>
    this.items().some((i) => i.state === 'active'),
  );
  protected readonly _isError = computed(() =>
    this.items().some((i) => i.state === 'error'),
  );
  protected readonly _iconClass = computed(() => {
    if (this._isError()) return 'text-destructive';
    if (this._isActive()) return 'text-foreground';
    return 'text-muted-foreground';
  });

  // Tone matches the per-file renderer's title ("Edit" / item title)
  // but collapses the action verb to a single phrase. Count is hidden
  // when only one chip is present — at that point the group looks
  // identical to a single edit row.
  protected readonly _title = computed(() => {
    const n = this.items().length;
    if (n <= 1) return 'Edited file';
    return `Edited ${n} files`;
  });

  protected readonly _chips = computed(() =>
    this.items()
      .map((i) => i.fileChip)
      .filter((c): c is NonNullable<typeof c> => c != null),
  );

  private readonly _bus = inject(FileChipBus, { optional: true });

  protected _onChipClick(path: string): void {
    this.chipClick.emit(path);
    this._bus?.emit(path);
  }
}
