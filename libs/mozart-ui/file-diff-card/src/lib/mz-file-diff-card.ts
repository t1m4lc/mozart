import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { HlmBadgeImports } from '@spartan-ui/badge';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCheck,
  lucideChevronDown,
  lucideChevronRight,
  lucideCopy,
  lucideFoldVertical,
  lucideRefreshCw,
  lucideSquare,
  lucideSquareCheck,
  lucideUnfoldVertical,
} from '@ng-icons/lucide';
import { MzDiffStats } from '@mozart-ui/diff-stats';
import { MzDiffView, type FetchContextLines } from '@mozart-ui/diff-view';
import {
  MzFileTabHeader,
  type FileTabHeaderPathTruncate,
} from '@mozart-ui/file-tab-header';

/** Header + outer-frame variant.
 *  - `card` (default) — full chrome: outer border, rounded corners,
 *    chevron collapse, body can be hidden.
 *  - `flush` — no outer border, no chevron, body always painted. Used
 *    when the card is embedded directly in a file-tab body (the card
 *    sits inside a pane that already has its own borders).
 */
export type FileDiffCardChrome = 'card' | 'flush';

export type FileDiffStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'binary'
  | 'too-large'
  | 'no-diff';

type BodyMode = 'diff' | 'binary' | 'too-large' | 'no-diff';
type CopyState = 'idle' | 'copied' | 'err';

interface StatusBadge {
  readonly label: string;
  readonly tone: 'neutral' | 'add' | 'remove' | 'muted';
}

const STATUS_BADGE: Record<FileDiffStatus, StatusBadge> = {
  modified: { label: 'MOD', tone: 'neutral' },
  added: { label: 'ADD', tone: 'add' },
  deleted: { label: 'DEL', tone: 'remove' },
  renamed: { label: 'REN', tone: 'neutral' },
  binary: { label: 'BIN', tone: 'muted' },
  'too-large': { label: 'BIG', tone: 'muted' },
  'no-diff': { label: 'NIL', tone: 'muted' },
};

// Tone → Tailwind classes for the badge text. Kept here (not on the badge
// variant axis) because we want all six statuses to share the same outline
// shape and only diverge in text color — clearer scanning in a long file
// list than mixing variant shapes.
const BADGE_TONE_CLASS: Record<StatusBadge['tone'], string> = {
  neutral: 'text-muted-foreground',
  add: 'text-[var(--diff-add-marker-fg)]',
  remove: 'text-[var(--diff-remove-marker-fg)]',
  muted: 'text-muted-foreground/70',
};

function statusBodyMode(status: FileDiffStatus): BodyMode {
  if (status === 'binary') return 'binary';
  if (status === 'too-large') return 'too-large';
  if (status === 'no-diff') return 'no-diff';
  return 'diff';
}

interface PathDisplay {
  readonly kind: 'single' | 'rename';
  readonly from: string;
  readonly to: string;
}

@Component({
  selector: 'mz-file-diff-card',
  imports: [
    NgIcon,
    HlmBadgeImports,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
    MzDiffStats,
    MzDiffView,
    MzFileTabHeader,
  ],
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCheck,
      lucideChevronDown,
      lucideChevronRight,
      lucideCopy,
      lucideFoldVertical,
      lucideRefreshCw,
      lucideSquare,
      lucideSquareCheck,
      lucideUnfoldVertical,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <article
      class="w-full"
      [class.block]="chrome() === 'card'"
      [class.flex]="chrome() === 'flush'"
      [class.h-full]="chrome() === 'flush'"
      [class.min-h-0]="chrome() === 'flush'"
      [class.flex-col]="chrome() === 'flush'"
      [class.border-border]="chrome() === 'card'"
      [class.bg-card]="chrome() === 'card'"
      [class.text-card-foreground]="chrome() === 'card'"
      [class.rounded-md]="chrome() === 'card'"
      [class.border]="chrome() === 'card'"
      [class.ring-2]="active()"
      [class.ring-ring/30]="active()"
      data-slot="file-diff-card"
    >
      <mz-file-tab-header [pathTruncate]="pathTruncate()">
        @if (_showChevron()) {
          <button
            mzFileTabHeaderLeading
            hlmBtn
            variant="ghost"
            size="xs"
            type="button"
            class="text-muted-foreground hover:text-foreground -ml-1 h-6 w-6 shrink-0 p-0"
            [attr.aria-expanded]="!_effectiveCollapsed()"
            [attr.aria-label]="_effectiveCollapsed() ? 'Expand file' : 'Collapse file'"
            data-slot="collapse-chevron"
            (click)="_toggle()"
          >
            <ng-icon
              hlm
              [name]="
                _effectiveCollapsed() ? 'lucideChevronRight' : 'lucideChevronDown'
              "
              size="md"
            />
          </button>
        }

        <span [title]="_pathTitle()" data-slot="card-path">
          @if (_pathDisplay().kind === 'rename') {
            <span class="text-muted-foreground/80">{{ _pathDisplay().from }}</span>
            <ng-icon
              hlm
              name="lucideArrowRight"
              size="xs"
              class="text-muted-foreground/60 mx-1 inline-block align-middle"
              aria-hidden="true"
            />
            <span class="text-foreground">{{ _pathDisplay().to }}</span>
          } @else {
            <span class="text-foreground">{{ _pathDisplay().to }}</span>
          }
        </span>

        <div mzFileTabHeaderActions class="contents">
          <button
            hlmBtn
            variant="ghost"
            size="xs"
            type="button"
            class="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 p-0"
            [hlmTooltip]="_copyTooltip()"
            [attr.aria-label]="_copyTooltip()"
            data-slot="copy-button"
            (click)="_copyPath()"
          >
            <ng-icon
              hlm
              [name]="_copyState() === 'copied' ? 'lucideCheck' : 'lucideCopy'"
              size="md"
              [class.text-status-ok]="_copyState() === 'copied'"
              [class.text-destructive]="_copyState() === 'err'"
            />
          </button>

          @if (_bodyMode() === 'diff') {
            <button
              hlmBtn
              variant="ghost"
              size="xs"
              type="button"
              class="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 p-0"
              [hlmTooltip]="_expandAllTooltip()"
              [attr.aria-label]="_expandAllTooltip()"
              [attr.aria-pressed]="_allExpanded()"
              data-slot="expand-all-button"
              [disabled]="!fetchContext()"
              (click)="_toggleExpandAll()"
            >
              <ng-icon
                hlm
                [name]="
                  _allExpanded() ? 'lucideFoldVertical' : 'lucideUnfoldVertical'
                "
                size="md"
              />
            </button>
          }

          <mz-diff-stats
            class="shrink-0"
            [added]="additions()"
            [removed]="deletions()"
          />

          <span
            hlmBadge
            variant="outline"
            class="h-5 shrink-0 px-1.5 font-mono text-[10px] tracking-wider"
            [class]="_badgeToneClass()"
            [attr.aria-label]="'Status: ' + _badge().label"
            data-slot="status-badge"
          >{{ _badge().label }}</span>

          <button
            hlmBtn
            variant="ghost"
            size="xs"
            type="button"
            class="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 p-0"
            hlmTooltip="Refresh"
            aria-label="Refresh diff"
            data-slot="refresh-button"
            (click)="refresh.emit()"
          >
            <ng-icon
              hlm
              name="lucideRefreshCw"
              size="md"
              [class.animate-spin]="loading()"
            />
          </button>

          <button
            hlmBtn
            variant="outline"
            size="xs"
            type="button"
            class="text-muted-foreground hover:text-foreground hover:bg-accent h-6 shrink-0 gap-1.5 rounded-full px-2.5 text-[11px]"
            [class.text-foreground]="_viewed()"
            [class.bg-accent]="_viewed()"
            [hlmTooltip]="_viewed() ? 'Mark unviewed' : 'Mark as viewed'"
            [attr.aria-pressed]="_viewed()"
            [attr.aria-label]="_viewed() ? 'Mark unviewed' : 'Mark as viewed'"
            data-slot="viewed-button"
            (click)="_toggleViewed()"
          >
            <ng-icon
              hlm
              [name]="_viewed() ? 'lucideSquareCheck' : 'lucideSquare'"
              size="md"
            />
            Viewed
          </button>

          <ng-content select="[mzFileDiffCardTrailing]" />
        </div>
      </mz-file-tab-header>

      @if (!_effectiveCollapsed()) {
        @switch (_bodyMode()) {
          @case ('diff') {
            <mz-diff-view
              class="w-full overflow-auto"
              [class.block]="chrome() === 'card'"
              [class.max-h-[60vh]]="chrome() === 'card'"
              [class.flex-1]="chrome() === 'flush'"
              [class.min-h-0]="chrome() === 'flush'"
              [path]="path()"
              [diffText]="diffText()"
              [loading]="loading()"
              [error]="error()"
              [fetchContext]="fetchContext()"
              [fileLineCount]="fileLineCount()"
              [scrollPaddingBottom]="scrollPaddingBottom()"
            />
          }
          @case ('binary') {
            <p
              class="text-muted-foreground px-3 py-3 text-xs"
              data-slot="binary-placeholder"
            >
              Binary file changed.
            </p>
          }
          @case ('too-large') {
            <div
              class="flex items-center justify-between gap-2 px-3 py-3 text-xs"
              data-slot="too-large-placeholder"
            >
              <span class="text-muted-foreground">
                Diff too large to render ({{ additions() }} additions,
                {{ deletions() }} deletions).
              </span>
              <button
                hlmBtn
                variant="outline"
                size="xs"
                type="button"
                class="h-6 shrink-0 px-2 text-[11px]"
                data-slot="show-anyway-button"
                (click)="showAnyway.emit()"
              >
                Show anyway
              </button>
            </div>
          }
          @case ('no-diff') {
            <p
              class="text-muted-foreground px-3 py-3 text-xs"
              data-slot="no-diff-placeholder"
            >
              No textual changes.
            </p>
          }
        }
      }
    </article>
  `,
})
export class MzFileDiffCard {
  readonly path = input.required<string>();
  readonly oldPath = input<string | null>(null);
  readonly status = input<FileDiffStatus>('modified');

  readonly additions = input<number>(0);
  readonly deletions = input<number>(0);

  readonly diffText = input<string>('');
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly fetchContext = input<FetchContextLines | null>(null);
  readonly fileLineCount = input<number | null>(null);

  readonly defaultCollapsed = input<boolean>(false);
  readonly active = input<boolean>(false);
  readonly viewed = input<boolean>(false);
  // Chrome variant — `card` (default) renders the bordered, rounded,
  // collapsible review surface. `flush` drops the outer border and the
  // chevron and always paints the body; use it when the card is
  // embedded inside a pane that already provides its own framing
  // (e.g. the file-tab body in `feature-file-content.ts`).
  readonly chrome = input<FileDiffCardChrome>('card');
  // Truncation strategy for the path slot. `'end'` (default) keeps the
  // standalone-card sandbox visual stable; `'start'` is for file-tab
  // embedding where the filename matters more than the workspace prefix.
  readonly pathTruncate = input<FileTabHeaderPathTruncate>('end');
  // Whether the card can collapse. `false` removes the chevron and
  // keeps the body painted. `chrome='flush'` also forces this off; the
  // two inputs are independent so a future card consumer can opt out
  // of collapse without dropping the rest of the card chrome.
  readonly collapsible = input<boolean>(true);
  // Forwarded to the inner MzDiffView. Bottom padding (px) inside the
  // diff's CodeMirror so the last hunk can scroll past UI that overlays
  // the bottom (e.g. the file-tab composer). 0 disables — the default
  // for standalone card usage.
  readonly scrollPaddingBottom = input<number>(0);

  readonly refresh = output<void>();
  // Plan §5.3 named this `copy`, but Angular flags `copy` as a DOM event
  // name. Renamed to `pathCopy` to keep the meaning while satisfying
  // @angular-eslint/no-output-native.
  readonly pathCopy = output<string>();
  readonly copyError = output<Error>();
  readonly showAnyway = output<void>();
  readonly toggleCollapsed = output<boolean>();
  readonly viewedChange = output<boolean>();

  // linkedSignal seeds from defaultCollapsed and resyncs if the caller
  // changes it — but local _toggle() updates take precedence in between.
  protected readonly _collapsed = linkedSignal(() => this.defaultCollapsed());
  // viewed mirrors the input but the in-card button can flip it locally;
  // each local toggle emits viewedChange so a host can persist + reorder.
  protected readonly _viewed = linkedSignal(() => this.viewed());
  protected readonly _copyState = signal<CopyState>('idle');
  // Tracks whether the user clicked expand-all. Resets when the path
  // changes so a sibling file doesn't inherit the prior state.
  protected readonly _allExpanded = linkedSignal(() => {
    this.path();
    return false;
  });

  // Collapse intent (local toggle) AND-gated by chrome / collapsible.
  // flush variants and non-collapsible cards always paint the body.
  protected readonly _effectiveCollapsed = computed(() => {
    if (this.chrome() === 'flush') return false;
    if (!this.collapsible()) return false;
    return this._collapsed();
  });

  // Chevron only renders for the collapsible card chrome.
  protected readonly _showChevron = computed(
    () => this.chrome() === 'card' && this.collapsible(),
  );

  protected readonly _bodyMode = computed<BodyMode>(() =>
    statusBodyMode(this.status()),
  );
  protected readonly _badge = computed<StatusBadge>(
    () => STATUS_BADGE[this.status()],
  );
  protected readonly _badgeToneClass = computed(
    () => BADGE_TONE_CLASS[this._badge().tone],
  );

  protected readonly _pathDisplay = computed<PathDisplay>(() => {
    const cur = this.path();
    const old = this.oldPath();
    if (this.status() === 'renamed' && old && old !== cur) {
      return { kind: 'rename', from: old, to: cur };
    }
    return { kind: 'single', from: cur, to: cur };
  });

  protected readonly _pathTitle = computed(() => {
    const d = this._pathDisplay();
    return d.kind === 'rename' ? `${d.from} → ${d.to}` : d.to;
  });

  protected readonly _copyTooltip = computed(() => {
    switch (this._copyState()) {
      case 'copied':
        return 'Copied!';
      case 'err':
        return 'Copy failed';
      default:
        return 'Copy path';
    }
  });

  protected readonly _expandAllTooltip = computed(() =>
    this._allExpanded() ? 'Collapse all hidden lines' : 'Expand all hidden lines',
  );

  // viewChild returns a Signal — undefined when the diff body isn't
  // mounted (binary/too-large/no-diff/collapsed).
  private readonly _diffView = viewChild(MzDiffView);

  // Wall-clock timer ID. Cleared on destroy so a copy click immediately
  // before unmount can't reset state on a dead component.
  private _copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      if (this._copyResetTimer !== null) {
        clearTimeout(this._copyResetTimer);
        this._copyResetTimer = null;
      }
    });
  }

  /** Reveal every still-hidden context line across every gap. Forwards
   *  to the mounted `MzDiffView`. No-op when the diff body isn't
   *  mounted (e.g. status=binary, collapsed). */
  expandAll(): void {
    this._diffView()?.expandAll();
    this._allExpanded.set(true);
  }

  /** Inverse of expandAll(). Drops every revealed context line for the
   *  current path. No-op when the diff body isn't mounted. */
  collapseAll(): void {
    this._diffView()?.collapseAll();
    this._allExpanded.set(false);
  }

  protected _toggleExpandAll(): void {
    if (this._allExpanded()) {
      this.collapseAll();
    } else {
      this.expandAll();
    }
  }

  protected _toggle(): void {
    const next = !this._collapsed();
    this._collapsed.set(next);
    this.toggleCollapsed.emit(next);
  }

  protected _toggleViewed(): void {
    const next = !this._viewed();
    this._viewed.set(next);
    this.viewedChange.emit(next);
    // Marking-as-viewed implies the reviewer is done with this card —
    // auto-collapse so the file list stays scannable. Unmarking does NOT
    // auto-expand: if the host moved the card elsewhere or the reviewer
    // wants to revisit, they'll click the chevron themselves.
    if (next) this._collapsed.set(true);
  }

  protected async _copyPath(): Promise<void> {
    const path = this.path();
    this._clearResetTimer();
    try {
      await navigator.clipboard.writeText(path);
      this._copyState.set('copied');
      this.pathCopy.emit(path);
    } catch (err) {
      this._copyState.set('err');
      const wrapped = err instanceof Error ? err : new Error(String(err));
      this.copyError.emit(wrapped);
    }
    this._scheduleReset();
  }

  private _scheduleReset(): void {
    this._copyResetTimer = setTimeout(() => {
      this._copyState.set('idle');
      this._copyResetTimer = null;
    }, 1500);
  }

  private _clearResetTimer(): void {
    if (this._copyResetTimer !== null) {
      clearTimeout(this._copyResetTimer);
      this._copyResetTimer = null;
    }
  }
}
