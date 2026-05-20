import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideColumns2,
  lucideEye,
  lucideFileDiff,
  lucideFilePen,
  lucideListTree,
  lucideRotateCcw,
  lucideTrash2,
} from '@ng-icons/lucide';

/** Reviewer's Viewed state for the file currently in the toolbar. Mirrors
 *  the three-way decoration described in `[[mozart-viewed-principle]]`:
 *  `not_viewed` (no record), `viewed` (record + hash matches),
 *  `changed_since_viewed` (record + hash diverged). The discreet
 *  visual lock keeps this surface light: a single checkbox-style toggle
 *  with a refresh glyph when the file changed under review. */
export type FileViewedState = 'not_viewed' | 'viewed' | 'changed_since_viewed';

/** Layout for the diff pane — unified is the existing fallback;
 *  `split` is wired here so P2.3 can flip the data without touching
 *  the toolbar surface. The toolbar never renders the diff itself. */
export type DiffMode = 'unified' | 'split';

/** Top-level switch between the read surface (diff or rendered preview)
 *  and the editable CodeMirror surface. */
export type FileMode = 'diff' | 'edit';

/**
 * `feature-file-toolbar` — the badge + Viewed + diff-mode + file-mode
 * row that sits above every file pane in the middle shell.
 *
 * P2.2 spec layout:
 * ```
 *   src/foo.ts   ✓ Viewed  [⌫]   [Unified|Split]   [Diff|Edit]
 * ```
 *
 * The toolbar is presentational — it takes the file path + the
 * current modes + the Viewed state and emits explicit events back to
 * the host. Mounting a file in this toolbar never marks it viewed;
 * only the user clicking the toggle does. That's the
 * `[[mozart-viewed-principle]]` rule: passive on open, explicit on
 * action.
 *
 * `[Unified|Split]` and `[Diff|Edit]` are both `<hlm-tabs>` tablists
 * (not toggles) per the plan note: BrnTabs already supplies
 * `role="tab"`, `aria-selected`, `aria-controls`, and arrow / Home /
 * End / Tab keyboard nav — re-using it here keeps the right-aside
 * Files/Changes a11y story consistent with this new control.
 */
@Component({
  selector: 'app-feature-file-toolbar',
  imports: [
    HlmButtonImports,
    HlmIconImports,
    HlmTabsImports,
    HlmTooltipImports,
    NgIcon,
  ],
  providers: [
    provideIcons({
      lucideColumns2,
      lucideEye,
      lucideFileDiff,
      lucideFilePen,
      lucideListTree,
      lucideRotateCcw,
      lucideTrash2,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-2',
    'data-slot': 'file-toolbar',
  },
  template: `
    <!-- Filename badge — selectable so the user can copy the path. -->
    <div class="flex min-w-0 items-center gap-2">
      <span
        class="select-text truncate font-mono text-[11px] text-muted-foreground"
        [attr.title]="filePath()"
      >
        {{ filePath() ?? '' }}
      </span>
      @if (viewedState() === 'changed_since_viewed') {
        <span
          class="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400"
          hlmTooltip="This file changed since you reviewed it"
        >
          <ng-icon name="lucideRotateCcw" class="text-[10px]" />
          changed since viewed
        </span>
      }
    </div>

    <div class="flex items-center gap-2">
      <!-- Viewed checkbox — explicit reviewer action. Disabled (but
           still rendered) when no file is selected. Frozen workspaces
           keep the toggle enabled so a final pass is possible. -->
      <button
        type="button"
        hlmBtn
        variant="ghost"
        size="xs"
        class="h-7 gap-1.5 px-2 text-[11px]"
        [class.text-foreground]="_isViewed()"
        [class.text-muted-foreground]="!_isViewed()"
        [disabled]="!filePath()"
        [attr.aria-pressed]="_isViewed()"
        hlmTooltip="Mark this file viewed"
        (click)="_toggleViewed()"
      >
        <ng-icon
          name="lucideEye"
          class="text-[12px]"
          [class.opacity-60]="!_isViewed()"
        />
        Viewed
        <span
          class="ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] leading-none"
          [class.border-brand]="_isViewed()"
          [class.bg-brand]="_isViewed()"
          [class.text-brand-foreground]="_isViewed()"
          [class.border-border]="!_isViewed()"
        >
          @if (_isViewed()) {
            ✓
          }
        </span>
      </button>

      @if (showDiscard()) {
        <button
          type="button"
          hlmBtn
          variant="ghost"
          size="icon-xs"
          class="size-7 text-muted-foreground"
          [disabled]="isFrozen() || !filePath()"
          hlmTooltip="Discard changes to this file"
          aria-label="Discard changes"
          (click)="discard.emit()"
        >
          <ng-icon hlm name="lucideTrash2" size="xs" />
        </button>
      }

      <!-- Diff-layout tabs (unified / split). Hidden in Edit mode. -->
      @if (fileMode() === 'diff') {
        <hlm-tabs
          class="contents"
          [tab]="diffMode()"
          (tabActivated)="_setDiffMode($any($event))"
        >
          <hlm-tabs-list
            variant="line"
            class="flex h-7 items-center gap-1"
            aria-label="Diff layout"
          >
            <button
              hlmTabsTrigger="unified"
              class="inline-flex h-7 items-center justify-center rounded-md border-transparent! bg-transparent! px-2 text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none after:hidden!"
              hlmTooltip="Unified diff"
              aria-label="Unified diff"
            >
              <ng-icon hlm name="lucideListTree" size="xs" />
            </button>
            <button
              hlmTabsTrigger="split"
              class="inline-flex h-7 items-center justify-center rounded-md border-transparent! bg-transparent! px-2 text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none after:hidden!"
              hlmTooltip="Split diff"
              aria-label="Split diff"
            >
              <ng-icon hlm name="lucideColumns2" size="xs" />
            </button>
          </hlm-tabs-list>
        </hlm-tabs>
      }

      <!-- File-mode tabs (diff / edit). -->
      <hlm-tabs
        class="contents"
        [tab]="fileMode()"
        (tabActivated)="_setFileMode($any($event))"
      >
        <hlm-tabs-list
          variant="line"
          class="flex h-7 items-center gap-1"
          aria-label="File mode"
        >
          <button
            hlmTabsTrigger="diff"
            class="inline-flex h-7 items-center gap-1.5 rounded-md border-transparent! bg-transparent! px-2 text-xs font-normal text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none after:hidden!"
            hlmTooltip="Review (diff)"
          >
            <ng-icon hlm name="lucideFileDiff" size="xs" />
            <span>Diff</span>
          </button>
          <button
            hlmTabsTrigger="edit"
            class="inline-flex h-7 items-center gap-1.5 rounded-md border-transparent! bg-transparent! px-2 text-xs font-normal text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none after:hidden!"
            [disabled]="isFrozen()"
            [hlmTooltip]="isFrozen() ? 'Workspace is done — edits disabled' : 'Edit'"
          >
            <ng-icon hlm name="lucideFilePen" size="xs" />
            <span>Edit</span>
          </button>
        </hlm-tabs-list>
      </hlm-tabs>
    </div>
  `,
})
export class FeatureFileToolbar {
  readonly filePath = input<string | null>(null);
  readonly viewedState = input<FileViewedState>('not_viewed');
  readonly isFrozen = input<boolean>(false);
  readonly diffMode = input<DiffMode>('unified');
  readonly fileMode = input<FileMode>('diff');
  /** Show the per-file discard button between the Viewed checkbox and
   *  the diff-mode tabs. Off by default; the Changes-tab host opts in,
   *  All Files leaves it off. */
  readonly showDiscard = input<boolean>(false);

  readonly markViewed = output<void>();
  readonly markUnviewed = output<void>();
  readonly diffModeChange = output<DiffMode>();
  readonly fileModeChange = output<FileMode>();
  readonly discard = output<void>();

  protected readonly _isViewed = computed(
    () => this.viewedState() === 'viewed',
  );

  protected _toggleViewed(): void {
    if (!this.filePath()) return;
    if (this._isViewed()) this.markUnviewed.emit();
    else this.markViewed.emit();
  }

  protected _setDiffMode(value: string): void {
    if (value !== 'unified' && value !== 'split') return;
    this.diffModeChange.emit(value);
  }

  protected _setFileMode(value: string): void {
    if (value !== 'diff' && value !== 'edit') return;
    if (this.isFrozen() && value === 'edit') return;
    this.fileModeChange.emit(value);
  }
}
