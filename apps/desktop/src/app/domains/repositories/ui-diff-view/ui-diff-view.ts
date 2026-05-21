import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideRefreshCw } from '@ng-icons/lucide';
import {
  UiHunkExpandBar,
  type HunkExpandDirection,
  type HunkExpandEvent,
} from '../ui-hunk-expand-bar/ui-hunk-expand-bar';
import {
  parseGroupedDiff,
  type DiffHunk,
  type DiffLine,
  type DiffLineKind,
} from '../util-diff-parser/util-diff-parser';

// GitHub-style row classes. Backgrounds are translucent so the diff
// blends with whatever surface it's painted onto; text colors stay
// muted because the marker column (rendered separately) carries the
// strong green/red signal.
const LINE_CLASS: Record<DiffLineKind, string> = {
  add: 'bg-emerald-500/[0.08] text-foreground dark:bg-emerald-400/[0.10]',
  remove: 'bg-rose-500/[0.08] text-foreground dark:bg-rose-400/[0.10]',
  hunk: 'bg-sky-500/[0.06] text-muted-foreground dark:bg-sky-400/[0.08]',
  meta: 'text-muted-foreground/70',
  context: 'text-foreground/80',
};

// Marker column styling — bold +/- glyph for added/removed rows; blank
// (but reserved width) on context rows so the body column stays aligned.
const MARKER_CLASS: Record<DiffLineKind, string> = {
  add: 'text-emerald-600 dark:text-emerald-400',
  remove: 'text-rose-600 dark:text-rose-400',
  context: 'text-muted-foreground/40',
  hunk: 'text-muted-foreground/0',
  meta: 'text-muted-foreground/0',
};

/** Callback the renderer invokes to reveal more context lines. Lines
 *  are 1-based and inclusive on both ends. Resolves with the raw line
 *  bodies in order. */
export type FetchContextLines = (
  from: number,
  to: number,
) => Promise<readonly string[]>;

interface GapExpansion {
  /** Lines revealed just BELOW the previous hunk in this gap. */
  readonly belowPrev: number;
  /** Lines revealed just ABOVE the next hunk in this gap. */
  readonly aboveNext: number;
}

interface PathState {
  readonly expansions: ReadonlyMap<number, GapExpansion>;
  readonly cache: ReadonlyMap<number, string>;
}

const EMPTY_EXPANSION: GapExpansion = { belowPrev: 0, aboveNext: 0 };
const EMPTY_PATH_STATE: PathState = {
  expansions: new Map(),
  cache: new Map(),
};

type RenderItem =
  | { readonly kind: 'line'; readonly line: DiffLine; readonly key: string }
  | { readonly kind: 'hunk-header'; readonly text: string; readonly key: string }
  | {
      readonly kind: 'expand';
      readonly key: string;
      readonly gapIndex: number;
      readonly direction: HunkExpandDirection;
      readonly linesAvailable: number;
    };

@Component({
  selector: 'app-diff-view',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
    UiHunkExpandBar,
  ],
  providers: [provideIcons({ lucideRefreshCw })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col ' },
  template: `
    <div
      class="flex h-8 shrink-0 items-center gap-1 border-b border-sidebar-border px-2"
    >
      <span
        class="min-w-0 flex-1 truncate text-[11px] font-medium text-muted-foreground"
      >
        @if (path()) {
          {{ path() }}
        } @else {
          Diff
        }
      </span>
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        class="size-6 text-muted-foreground"
        hlmTooltip="Refresh diff"
        position="left"
        [disabled]="!path() || loading()"
        (click)="refresh.emit()"
      >
        <ng-icon hlm name="lucideRefreshCw" size="xs" />
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-auto">
      @if (!path()) {
        <p class="px-3 py-3 text-xs text-muted-foreground">
          Select a file to see its changes.
        </p>
      } @else if (loading() && renderItems().length === 0) {
        <p class="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
      } @else if (error(); as err) {
        <p class="px-3 py-3 text-xs text-destructive">
          Failed to load diff: {{ err }}
        </p>
      } @else if (renderItems().length === 0) {
        <p class="px-3 py-3 text-xs text-muted-foreground">No changes.</p>
      } @else {
        <div
          class="m-0 font-mono text-[11px] leading-snug whitespace-pre-wrap break-all"
        >
          @for (item of renderItems(); track item.key) {
            @switch (item.kind) {
              @case ('expand') {
                <app-hunk-expand-bar
                  [direction]="item.direction"
                  [linesAvailable]="item.linesAvailable"
                  (expand)="onExpand(item.gapIndex, $event)"
                />
              }
              @case ('hunk-header') {
                <span [class]="hunkClass" class="block px-2 py-0.5">{{ item.text }}</span>
              }
              @default {
                <span
                  [class]="lineClass(item.line.kind)"
                  class="flex items-start"
                >
                  <span
                    [class]="markerClass(item.line.kind)"
                    class="select-none shrink-0 w-5 text-center font-bold"
                    aria-hidden="true"
                  >{{ markerGlyph(item.line.kind) }}</span>
                  <span class="min-w-0 flex-1 pr-2">{{ lineBody(item.line.text) || nbsp }}</span>
                </span>
              }
            }
          }
        </div>
      }
    </div>
  `,
})
export class DiffView {
  // U+00A0 NBSP — preserves line height on empty diff lines. Lifted
  // out of the template because angular-eslint flags NBSP literals
  // in templates as "irregular whitespace".
  protected readonly nbsp = ' ';
  protected readonly hunkClass = LINE_CLASS.hunk;

  readonly path = input<string | null>(null);
  readonly diffText = input<string>('');
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);
  /** When provided, expand bars are enabled. Without this, the bars
   *  still render between hunks for visibility but the buttons are
   *  inert. */
  readonly fetchContext = input<FetchContextLines | null>(null);
  /** Total line count of the new-side file. Drives the below-last-hunk
   *  bar and the bar's linesAvailable indicator. Null hides the
   *  below-last-hunk bar. */
  readonly fileLineCount = input<number | null>(null);

  readonly refresh = output<void>();

  // Per-path state — survives diffText input changes for the same path
  // and across switching to another file and back.
  private readonly stateByPath = signal<ReadonlyMap<string, PathState>>(
    new Map(),
  );

  private readonly parsedDiff = computed(() =>
    parseGroupedDiff(this.diffText()),
  );

  private readonly currentState = computed<PathState>(() => {
    const p = this.path();
    if (!p) return EMPTY_PATH_STATE;
    return this.stateByPath().get(p) ?? EMPTY_PATH_STATE;
  });

  protected readonly renderItems = computed<readonly RenderItem[]>(() => {
    const parsed = this.parsedDiff();
    const state = this.currentState();
    const fileLines = this.fileLineCount();
    return buildRenderItems(parsed.preamble, parsed.hunks, state, fileLines);
  });

  protected lineClass(kind: DiffLineKind): string {
    return LINE_CLASS[kind];
  }

  protected markerClass(kind: DiffLineKind): string {
    return MARKER_CLASS[kind];
  }

  // The marker column draws +/- (or a centered dot for context) so the
  // body column can render the line content without the prefix char.
  // Hunk/meta rows render the marker as a non-breaking space at zero
  // opacity to keep the body column aligned with line rows above/below.
  protected markerGlyph(kind: DiffLineKind): string {
    if (kind === 'add') return '+';
    if (kind === 'remove') return '−';
    return this.nbsp;
  }

  // Strip the leading +/-/space marker emitted by unified-diff. Context
  // lines are stored with a leading space; add/remove with +/-. Removing
  // it here keeps the body column visually aligned with the marker
  // column. Empty input passes through as empty (no nbsp injection — the
  // caller adds nbsp when the resulting body is empty so the line keeps
  // its height).
  protected lineBody(text: string): string {
    if (!text) return '';
    const first = text[0];
    if (first === '+' || first === '-' || first === ' ') {
      return text.slice(1);
    }
    return text;
  }

  protected onExpand(gapIndex: number, event: HunkExpandEvent): void {
    const fetcher = this.fetchContext();
    if (!fetcher) return;

    const p = this.path();
    if (!p) return;

    const parsed = this.parsedDiff();
    const range = computeExpandRange(
      gapIndex,
      event.direction,
      event.count,
      parsed.hunks,
      this.fileLineCount(),
      this.stateByPath().get(p)?.expansions.get(gapIndex) ?? EMPTY_EXPANSION,
    );
    if (!range) return;

    // Bump counters optimistically so a second click queues correctly
    // against the new (visible) state. The fetch fills the cache; any
    // gap line missing from the cache renders as an empty row until
    // the fetch resolves.
    this.bumpExpansion(p, gapIndex, event.direction, range.count);

    void fetcher(range.from, range.to).then(
      (lines) => {
        // Path may have changed under us — only apply to the path the
        // request was made for.
        this.mergeCache(p, range.from, lines);
      },
      (err) => {
        console.warn(
          `[diff-view] context fetch failed (${p} ${range.from}-${range.to}):`,
          err,
        );
      },
    );
  }

  private bumpExpansion(
    path: string,
    gapIndex: number,
    direction: 'up' | 'down',
    count: number,
  ): void {
    this.stateByPath.update((prev) => {
      const next = new Map(prev);
      const pathState = next.get(path) ?? EMPTY_PATH_STATE;
      const expansions = new Map(pathState.expansions);
      const current = expansions.get(gapIndex) ?? EMPTY_EXPANSION;
      const updated: GapExpansion =
        direction === 'up'
          ? { ...current, aboveNext: current.aboveNext + count }
          : { ...current, belowPrev: current.belowPrev + count };
      expansions.set(gapIndex, updated);
      next.set(path, { ...pathState, expansions });
      return next;
    });
  }

  private mergeCache(
    path: string,
    from: number,
    lines: readonly string[],
  ): void {
    if (lines.length === 0) return;
    this.stateByPath.update((prev) => {
      const next = new Map(prev);
      const pathState = next.get(path) ?? EMPTY_PATH_STATE;
      const cache = new Map(pathState.cache);
      for (let i = 0; i < lines.length; i++) {
        cache.set(from + i, lines[i]);
      }
      next.set(path, { ...pathState, cache });
      return next;
    });
  }
}

/** Resolve the [from, to] new-side line range to fetch for a single
 *  expand click. Caps the count at the gap's remaining hidden lines
 *  and at the file's known length. Returns null when no fetch is
 *  warranted (e.g. clicking a button that's already at its limit). */
function computeExpandRange(
  gapIndex: number,
  direction: 'up' | 'down',
  rawCount: number,
  hunks: readonly DiffHunk[],
  fileLineCount: number | null,
  state: GapExpansion,
): { from: number; to: number; count: number } | null {
  const gapStart = gapIndex === 0 ? 1 : hunks[gapIndex - 1].endLine + 1;
  const gapEndKnown =
    gapIndex === hunks.length ? fileLineCount : hunks[gapIndex].startLine - 1;

  if (direction === 'down') {
    // Reveal lines from the TOP of the gap (just below the previous hunk).
    // For gap 0 there's no previous hunk; the down button shouldn't be
    // rendered, but defensive: bail out.
    if (gapIndex === 0) return null;
    const cursor = gapStart + state.belowPrev;
    const upperBound = gapEndKnown ?? cursor + rawCount - 1;
    const remaining =
      gapEndKnown !== null ? gapEndKnown - cursor - state.aboveNext + 1 : rawCount;
    if (remaining <= 0) return null;
    const count = Math.min(rawCount, remaining);
    const from = cursor;
    const to = Math.min(cursor + count - 1, upperBound);
    return { from, to, count: to - from + 1 };
  }

  // direction === 'up' — reveal lines from the BOTTOM of the gap (just
  // above the next hunk). For the trailing gap there's no next hunk;
  // the up button shouldn't be rendered there.
  if (gapEndKnown === null) return null;
  const cursor = gapEndKnown - state.aboveNext;
  const remaining = gapEndKnown - gapStart + 1 - state.belowPrev - state.aboveNext;
  if (remaining <= 0) return null;
  const count = Math.min(rawCount, remaining);
  const to = cursor;
  const from = Math.max(gapStart + state.belowPrev, cursor - count + 1);
  return { from, to, count: to - from + 1 };
}

function buildRenderItems(
  preamble: readonly DiffLine[],
  hunks: readonly DiffHunk[],
  state: PathState,
  fileLineCount: number | null,
): readonly RenderItem[] {
  const items: RenderItem[] = [];

  for (let i = 0; i < preamble.length; i++) {
    items.push({ kind: 'line', line: preamble[i], key: `p:${i}` });
  }

  if (hunks.length === 0) return items;

  for (let gi = 0; gi <= hunks.length; gi++) {
    appendGap(items, gi, hunks, state, fileLineCount);
    if (gi < hunks.length) {
      const hunk = hunks[gi];
      items.push({
        kind: 'hunk-header',
        text: hunk.header,
        key: `h${gi}:hdr`,
      });
      for (let li = 0; li < hunk.lines.length; li++) {
        items.push({
          kind: 'line',
          line: hunk.lines[li],
          key: `h${gi}:l${li}`,
        });
      }
    }
  }
  return items;
}

function appendGap(
  items: RenderItem[],
  gapIndex: number,
  hunks: readonly DiffHunk[],
  state: PathState,
  fileLineCount: number | null,
): void {
  const isFirstGap = gapIndex === 0;
  const isLastGap = gapIndex === hunks.length;

  const gapStart = isFirstGap ? 1 : hunks[gapIndex - 1].endLine + 1;
  const gapEnd = isLastGap ? fileLineCount : hunks[gapIndex].startLine - 1;

  // First-gap with hunk[0] starting at line 1 → no gap.
  if (gapEnd !== null && gapEnd < gapStart) return;
  // Last gap with no known file length → suppress the bar entirely;
  // we don't know whether there are lines below the last hunk.
  if (isLastGap && gapEnd === null) return;

  const gapState = state.expansions.get(gapIndex) ?? EMPTY_EXPANSION;
  const knownSize = gapEnd !== null ? gapEnd - gapStart + 1 : null;
  const consumed = gapState.belowPrev + gapState.aboveNext;
  const remaining =
    knownSize === null ? Number.MAX_SAFE_INTEGER : knownSize - consumed;

  // Top-side expanded lines — appear just below the previous hunk.
  for (let n = gapStart; n < gapStart + gapState.belowPrev; n++) {
    items.push({
      kind: 'line',
      line: synthContextLine(n, state.cache.get(n) ?? ''),
      key: `g${gapIndex}:t${n}`,
    });
  }

  // Expand bar, if there's anything left to reveal.
  if (remaining > 0) {
    const direction: HunkExpandDirection = isFirstGap
      ? 'up'
      : isLastGap
        ? 'down'
        : 'both';
    items.push({
      kind: 'expand',
      gapIndex,
      direction,
      linesAvailable: knownSize === null ? 0 : remaining,
      key: `g${gapIndex}:bar`,
    });
  }

  // Bottom-side expanded lines — appear just above the next hunk.
  if (gapEnd !== null) {
    for (let n = gapEnd - gapState.aboveNext + 1; n <= gapEnd; n++) {
      // Skip if the line was already covered by the top-side range
      // (the two ranges meet when the gap is fully expanded).
      if (n < gapStart + gapState.belowPrev) continue;
      items.push({
        kind: 'line',
        line: synthContextLine(n, state.cache.get(n) ?? ''),
        key: `g${gapIndex}:b${n}`,
      });
    }
  }
}

function synthContextLine(newLineNumber: number, text: string): DiffLine {
  // Match the leading-space marker used by real context lines in
  // unified diff output, so width/highlight rules stay consistent.
  return {
    kind: 'context',
    text: ' ' + text,
    oldLineNumber: null,
    newLineNumber,
  };
}
