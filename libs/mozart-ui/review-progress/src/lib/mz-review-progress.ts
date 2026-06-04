import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { HlmBadgeImports } from '@spartan-ui/badge';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmCollapsibleImports } from '@spartan-ui/collapsible';
import { HlmProgressImports } from '@spartan-ui/progress';
import { HlmSeparatorImports } from '@spartan-ui/separator';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronDown, lucideEye, lucideRotateCcw } from '@ng-icons/lucide';

/**
 * Per-file-state counts surfaced inside the collapsible details panel.
 * The host (Changes tab) supplies these from the workspace's current
 * changed-files list; the component is purely presentational and never
 * fetches data.
 */
export interface FileStateCounts {
  readonly added: number;
  readonly modified: number;
  readonly deleted: number;
  readonly renamed: number;
  readonly copied: number;
  readonly untracked: number;
}

const ZERO_COUNTS: FileStateCounts = Object.freeze({
  added: 0,
  modified: 0,
  deleted: 0,
  renamed: 0,
  copied: 0,
  untracked: 0,
});

/**
 * `<mz-review-progress>` — dense GitHub-style review summary backing
 * the P2.2 Changes tab (see
 * `docs/engineering/planning/dogfood-readiness.md` § P2.2,
 * `[[mozart-viewed-principle]]`).
 *
 * Collapsed row:
 *   `N viewed / M changed`  ▁▂▃▄ progress bar  [Mark all viewed] [▾]
 *
 * Expanded body adds per-file-state chips
 * (added / modified / deleted / renamed / copied / untracked) and a
 * dedicated `changed since viewed` chip when the count is non-zero.
 *
 * Public surface is data-in / event-out only. The host owns durable
 * Viewed state (FileViewsFacade) and UI state (Collapsible expanded
 * goes into UiStateStore) — see `[[feedback_atom_unit]]` for the
 * layering rule.
 */
@Component({
  selector: 'mz-review-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideChevronDown, lucideEye, lucideRotateCcw })],
  imports: [
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmCollapsibleImports,
    HlmProgressImports,
    HlmSeparatorImports,
    HlmTooltipImports,
  ],
  host: {
    class: 'flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs',
    'data-slot': 'review-progress',
  },
  template: `
    <hlm-collapsible
      [expanded]="_expanded()"
      (expandedChange)="_setExpanded($event)"
    >
      <div class="flex items-center gap-2">
        <div class="flex items-baseline gap-1 font-mono tabular-nums">
          <span class="font-medium text-foreground">{{ viewedCount() }}</span>
          <span class="text-muted-foreground">viewed</span>
          <span class="text-muted-foreground/60">/</span>
          <span class="font-medium text-foreground">{{ changedCount() }}</span>
          <span class="text-muted-foreground">changed</span>
        </div>
        <hlm-progress
          class="ml-1 h-1 flex-1"
          [value]="_progressValue()"
          [max]="100"
        >
          <hlm-progress-indicator />
        </hlm-progress>
        @if (_hasChangedSinceViewed()) {
          <span
            hlmBadge
            variant="outline"
            class="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
            hlmTooltip="Files changed since you reviewed them"
          >
            <ng-icon name="lucideRotateCcw" class="text-[10px]" />
            {{ changedSinceViewedCount() }}
          </span>
        }
        <button
          hlmBtn
          size="sm"
          variant="ghost"
          class="h-6 px-2 text-xs"
          [disabled]="!_canMarkAll()"
          (click)="_emitMarkAll()"
          hlmTooltip="Mark every changed file viewed"
        >
          <ng-icon name="lucideEye" class="text-[12px]" />
          Mark all viewed
        </button>
        <button
          hlmBtn
          hlmCollapsibleTrigger
          size="icon"
          variant="ghost"
          class="h-6 w-6"
          [attr.aria-label]="_expanded() ? 'Hide review details' : 'Show review details'"
          (click)="_toggle()"
        >
          <ng-icon
            name="lucideChevronDown"
            class="transition-transform"
            [class.rotate-180]="_expanded()"
          />
        </button>
      </div>
      <div hlmCollapsibleContent class="pt-2">
        <hlm-separator class="mb-2" />
        <div class="flex flex-wrap gap-1.5 text-[11px]">
          @for (chip of _fileStateChips(); track chip.label) {
            <span
              hlmBadge
              variant="outline"
              class="gap-1 font-mono"
              [hlmTooltip]="chip.tooltip"
            >
              {{ chip.label }}
              <span class="font-medium text-foreground">{{ chip.count }}</span>
            </span>
          }
          @if (_hasChangedSinceViewed()) {
            <span
              hlmBadge
              variant="outline"
              class="gap-1 border-amber-500/40 text-amber-700 dark:text-amber-400"
              hlmTooltip="Files changed since you reviewed them"
            >
              changed since viewed
              <span class="font-medium">{{ changedSinceViewedCount() }}</span>
            </span>
          }
          <button
            hlmBtn
            size="sm"
            variant="outline"
            class="ml-auto h-6 px-2 text-xs"
            [disabled]="!_canReviewRemaining()"
            (click)="_emitReviewRemaining()"
          >
            Review remaining
          </button>
        </div>
      </div>
    </hlm-collapsible>
  `,
})
export class MzReviewProgress {
  readonly viewedCount = input<number>(0);
  readonly changedCount = input<number>(0);
  readonly remainingCount = input<number>(0);
  readonly changedSinceViewedCount = input<number>(0);
  readonly fileStateCounts = input<FileStateCounts>(ZERO_COUNTS);
  readonly expanded = input<boolean | undefined>(undefined);

  readonly markAllViewed = output<void>();
  readonly reviewRemaining = output<void>();
  readonly expandedChange = output<boolean>();

  /** Internal expanded state used when the host does not control the
   *  Collapsible. When `expanded()` is provided, the host owns the
   *  state and this signal mirrors it via the effect below; otherwise
   *  the component manages it itself. */
  protected readonly _internalExpanded = signal(false);
  protected readonly _expanded = computed(() => {
    const external = this.expanded();
    if (external === undefined) return this._internalExpanded();
    return external;
  });

  protected readonly _progressValue = computed(() => {
    const total = this.changedCount();
    if (total <= 0) return 0;
    const ratio = this.viewedCount() / total;
    return Math.min(100, Math.max(0, ratio * 100));
  });

  protected readonly _hasChangedSinceViewed = computed(
    () => this.changedSinceViewedCount() > 0,
  );

  protected readonly _canMarkAll = computed(
    () => this.changedCount() > 0 && this.remainingCount() > 0,
  );

  protected readonly _canReviewRemaining = computed(
    () => this.remainingCount() > 0,
  );

  protected readonly _fileStateChips = computed(() => {
    const c = this.fileStateCounts();
    return (
      [
        { key: 'added', label: 'added', count: c.added, tooltip: 'Files added in this workspace' },
        {
          key: 'modified',
          label: 'modified',
          count: c.modified,
          tooltip: 'Files modified in this workspace',
        },
        {
          key: 'deleted',
          label: 'deleted',
          count: c.deleted,
          tooltip: 'Files deleted in this workspace',
        },
        {
          key: 'renamed',
          label: 'renamed',
          count: c.renamed,
          tooltip: 'Files renamed in this workspace',
        },
        {
          key: 'copied',
          label: 'copied',
          count: c.copied,
          tooltip: 'Files copied in this workspace',
        },
        {
          key: 'untracked',
          label: 'untracked',
          count: c.untracked,
          tooltip: 'New files not yet tracked by git',
        },
      ] as const
    ).filter((chip) => chip.count > 0);
  });

  protected _toggle(): void {
    this._setExpanded(!this._expanded());
  }

  protected _setExpanded(next: boolean): void {
    if (this.expanded() === undefined) {
      this._internalExpanded.set(next);
    }
    this.expandedChange.emit(next);
  }

  protected _emitMarkAll(): void {
    if (!this._canMarkAll()) return;
    this.markAllViewed.emit();
  }

  protected _emitReviewRemaining(): void {
    if (!this._canReviewRemaining()) return;
    this.reviewRemaining.emit();
  }
}
