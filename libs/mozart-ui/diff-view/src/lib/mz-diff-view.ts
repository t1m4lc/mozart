import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  defaultHighlightStyle,
  syntaxHighlighting,
} from '@codemirror/language';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
} from '@codemirror/view';
import { mozartThemeFor } from '@mozart-ui/codemirror-theme';
import {
  parseGroupedDiff,
  type DiffHunk,
  type DiffLine,
} from '@mozart-ui/diff-parser';
import type {
  HunkExpandDirection,
  HunkExpandEvent,
} from '@mozart-ui/hunk-expand-bar';
import { ThemeService } from '@mozart/shared-util-theme';
import {
  buildDocPlan,
  buildLineDecorations,
  buildWidgetDecorations,
  newLineGutter,
  oldLineGutter,
  type LineMeta,
} from './cm-diff-extensions';
import { languageFromPath, loadLanguageExtension } from './language';

/** Callback the renderer invokes to reveal more context lines. Lines
 *  are 1-based and inclusive on both ends. Resolves with the raw line
 *  bodies in order. */
export type FetchContextLines = (
  from: number,
  to: number,
) => Promise<readonly string[]>;

// The interfaces below are exported to allow same-lib tests to assemble
// fixtures for the pure-function helpers (buildRenderItems,
// computeExpandRange). They are intentionally NOT re-exported from
// `index.ts`, so they stay library-internal to consumers.

export interface GapExpansion {
  /** Lines revealed just BELOW the previous hunk in this gap. */
  readonly belowPrev: number;
  /** Lines revealed just ABOVE the next hunk in this gap. */
  readonly aboveNext: number;
}

/** Remembers the failed attempt so the Retry strip can replay it with
 *  the same direction + count the user originally clicked. */
export interface ExpandError {
  readonly message: string;
  readonly direction: 'up' | 'down';
  readonly count: number;
}

export interface PathState {
  readonly expansions: ReadonlyMap<number, GapExpansion>;
  readonly cache: ReadonlyMap<number, string>;
  readonly errors: ReadonlyMap<number, ExpandError>;
}

const EMPTY_EXPANSION: GapExpansion = { belowPrev: 0, aboveNext: 0 };
const EMPTY_PATH_STATE: PathState = {
  expansions: new Map(),
  cache: new Map(),
  errors: new Map(),
};

export type RenderItem =
  | { readonly kind: 'line'; readonly line: DiffLine; readonly key: string }
  | {
      readonly kind: 'hunk-header';
      readonly text: string;
      readonly key: string;
      /** Gap above this hunk header; used by the inline "expand 20 lines
       *  up" gutter button on the hunk's own row. */
      readonly gapIndex: number;
      /** Number of still-hidden context lines in the gap above. 0 hides
       *  the gutter button (no more lines to expand). */
      readonly linesAvailable: number;
    }
  | {
      readonly kind: 'expand';
      readonly key: string;
      readonly gapIndex: number;
      readonly direction: HunkExpandDirection;
      readonly linesAvailable: number;
    }
  | {
      readonly kind: 'expand-error';
      readonly key: string;
      readonly gapIndex: number;
      readonly message: string;
    };

@Component({
  selector: 'mz-diff-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full w-full overflow-auto' },
  template: `
    @if (!path()) {
      <p class="text-muted-foreground px-3 py-3 text-xs">
        Select a file to see its changes.
      </p>
    } @else if (loading() && _isEmpty()) {
      <p class="text-muted-foreground px-3 py-3 text-xs">Loading…</p>
    } @else if (error(); as err) {
      <p class="text-destructive px-3 py-3 text-xs">
        Failed to load diff: {{ err }}
      </p>
    } @else if (_isEmpty()) {
      <p class="text-muted-foreground px-3 py-3 text-xs">No changes.</p>
    } @else {
      <div
        #host
        class="mz-diff-cm-host h-full w-full min-h-0 select-text"
      ></div>
    }
  `,
})
export class MzDiffView {
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
  /** Extra paddingBottom on `.cm-content` so the document can scroll
   *  past the visible viewport bottom. Used when a fixed UI element
   *  overlays the diff's bottom region (e.g. the workspace composer
   *  on file tabs in diff mode). 0 disables. */
  readonly scrollPaddingBottom = input<number>(0);

  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  private readonly hostRef = viewChild<ElementRef<HTMLDivElement>>('host');

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

  protected readonly _renderItems = computed<readonly RenderItem[]>(() => {
    const parsed = this.parsedDiff();
    const state = this.currentState();
    const fileLines = this.fileLineCount();
    return buildRenderItems(parsed.preamble, parsed.hunks, state, fileLines);
  });

  // Empty when there's nothing renderable — either no hunks AND no
  // preamble lines, or a path is set but the input diff is blank.
  protected readonly _isEmpty = computed(() => {
    const parsed = this.parsedDiff();
    return parsed.preamble.length === 0 && parsed.hunks.length === 0;
  });

  // The flattened CodeMirror plan (doc text + per-line meta + widget
  // specs). Recomputed whenever the render items or fileLineCount
  // change; pushed into the editor via reconfigureCmState below.
  private readonly _docPlan = computed(() =>
    buildDocPlan(this._renderItems(), this.parsedDiff().hunks.length),
  );

  private view: EditorView | null = null;
  private currentLineMeta: readonly LineMeta[] = [];
  private readonly themeCompartment = new Compartment();
  private readonly languageCompartment = new Compartment();
  private readonly decorationsCompartment = new Compartment();
  private readonly readOnlyCompartment = new Compartment();
  private currentLanguageRequest = 0;

  constructor() {
    afterNextRender(() => this.initEditor());

    // Rebuild doc + decorations whenever the plan changes. The effect
    // is created in the constructor so it ticks on first render too.
    effect(() => {
      const plan = this._docPlan();
      const v = this.view;
      if (!v) return;
      this.applyPlan(v, plan);
    });

    // Theme follows ThemeService (mozart's `.dark` class on <html>).
    effect(() => {
      const isDark = this.theme.isDark();
      const v = this.view;
      if (!v) return;
      v.dispatch({
        effects: this.themeCompartment.reconfigure(
          mozartThemeFor(isDark ? 'dark' : 'light'),
        ),
      });
    });

    // Language extension follows the file path. Async-loaded so we
    // dispatch a reconfigure once the dynamic import resolves.
    effect(() => {
      const lang = languageFromPath(this.path());
      void this.applyLanguage(lang);
    });

    this.destroyRef.onDestroy(() => {
      this.view?.destroy();
      this.view = null;
    });
  }

  /** Reveal every still-hidden context line across every gap in the
   *  current diff. Bounded by `fileLineCount` for the trailing gap;
   *  no-op if `fetchContext` is null. Issues one fetch per gap with
   *  remaining lines — the parent component owns batching if it
   *  wants to coalesce. */
  expandAll(): void {
    if (!this.fetchContext()) return;
    const p = this.path();
    if (!p) return;
    const parsed = this.parsedDiff();
    if (parsed.hunks.length === 0) return;
    const fileLines = this.fileLineCount();

    for (let gi = 0; gi <= parsed.hunks.length; gi++) {
      const isFirstGap = gi === 0;
      const isLastGap = gi === parsed.hunks.length;
      const gapStart = isFirstGap ? 1 : parsed.hunks[gi - 1].endLine + 1;
      const gapEnd = isLastGap ? fileLines : parsed.hunks[gi].startLine - 1;
      // No known end → mirror appendGap's bar suppression.
      if (gapEnd === null) continue;
      // Empty gap (hunk @ line 1, or contiguous hunks).
      if (gapEnd < gapStart) continue;

      const gapState =
        this.stateByPath().get(p)?.expansions.get(gi) ?? EMPTY_EXPANSION;
      const remaining =
        gapEnd - gapStart + 1 - gapState.belowPrev - gapState.aboveNext;
      if (remaining <= 0) continue;

      // First gap has no "previous hunk" so its bar is direction='up';
      // every other gap can use 'down' (reveal from the top).
      const direction: 'up' | 'down' = isFirstGap ? 'up' : 'down';
      this.onExpand(gi, { direction, count: remaining });
    }
  }

  /** Reset every revealed context line for the current path. Inverse of
   *  expandAll() — drops the path's expansion/cache/error state so the
   *  diff renders the way it did before any expand-bar click. No-op if
   *  the path was never expanded. */
  collapseAll(): void {
    const p = this.path();
    if (!p) return;
    this.stateByPath.update((prev) => {
      if (!prev.has(p)) return prev;
      const next = new Map(prev);
      next.delete(p);
      return next;
    });
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
    if (range === null) return;

    // Optimistic local bump so the user gets immediate feedback while
    // the fetch is in flight; rolled back on failure.
    this.bumpExpansion(p, gapIndex, event.direction, range.count);
    this.clearError(p, gapIndex);

    void fetcher(range.from, range.to).then(
      (lines) => {
        this.mergeCache(p, range.from, lines);
      },
      (err) => {
        this.bumpExpansion(p, gapIndex, event.direction, -range.count);
        this.setError(p, gapIndex, {
          message: err instanceof Error ? err.message : String(err),
          direction: event.direction,
          count: event.count,
        });
      },
    );
  }

  protected onRetry(gapIndex: number): void {
    const p = this.path();
    if (!p) return;
    const err = this.stateByPath().get(p)?.errors.get(gapIndex);
    if (!err) return;
    this.onExpand(gapIndex, { direction: err.direction, count: err.count });
  }

  private initEditor(): void {
    const host = this.hostRef()?.nativeElement;
    if (!host) return;

    const plan = this._docPlan();
    const getMeta = (line: number): LineMeta | undefined =>
      this.currentLineMeta[line - 1];
    this.currentLineMeta = plan.lineMeta;

    const extensions: Extension[] = [
      oldLineGutter(getMeta, (gi, ev) => this.onExpand(gi, ev)),
      newLineGutter(getMeta),
      drawSelection(),
      highlightActiveLine(),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      // GitHub-style: zero gap between the gutters and the code so the
      // colored line/gutter bands butt up against each other. The
      // active-line treatment is a brightness filter on the existing
      // line background, so context/hunk lines retain their tint and
      // diff lines just go a touch darker.
      EditorView.theme({
        '.cm-gutters': {
          borderRight: 'none',
          backgroundColor: 'transparent',
          // Let the hunk-row button overflow OLD's right edge onto
          // the NEW gutter so its centerline lands on the seam.
          overflow: 'visible',
        },
        '.cm-gutter': { overflow: 'visible' },
        '.cm-gutterElement': { padding: '0', overflow: 'visible' },
        '.cm-lineNumbers .cm-gutterElement': { padding: '0' },
        '.cm-content': { paddingLeft: '0' },
        '.cm-line': { paddingLeft: '0.5ch' },
        '.cm-activeLine': {
          backgroundColor: 'transparent',
          filter: 'brightness(0.9)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: 'transparent',
          filter: 'brightness(0.9)',
        },
        // Hunk rows are metadata, not code. The syntax highlighter
        // would otherwise paint numbers/identifiers in token colors
        // and override the muted/italic intent set on the line itself
        // (cm-diff-extensions HUNK_LINE_DECO).
        '.cm-line.mz-diff-cm-hunk-row *': {
          color: 'var(--muted-foreground)',
          fontStyle: 'italic',
        },
      }),
      EditorView.lineWrapping,
      this.themeCompartment.of(
        mozartThemeFor(this.theme.isDark() ? 'dark' : 'light'),
      ),
      this.languageCompartment.of([]),
      this.decorationsCompartment.of([]),
      this.readOnlyCompartment.of(EditorState.readOnly.of(true)),
    ];

    const pb = this.scrollPaddingBottom();
    if (pb > 0) {
      extensions.push(
        EditorView.theme({
          '.cm-content': { paddingBottom: `${pb}px` },
        }),
      );
    }

    const state = EditorState.create({
      doc: plan.doc,
      extensions,
    });
    this.view = new EditorView({ state, parent: host });

    // Decorations need the EditorView to compute line positions, so we
    // can't include them in the initial extension set — push them in a
    // follow-up transaction once the view exists.
    this.applyPlan(this.view, plan);

    void this.applyLanguage(languageFromPath(this.path()));
  }

  private applyPlan(
    view: EditorView,
    plan: ReturnType<typeof buildDocPlan>,
  ): void {
    // Replace the entire doc; for diff-view the doc is small and full
    // replacement is simpler than a structural diff.
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== plan.doc) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: plan.doc },
      });
    }

    this.currentLineMeta = plan.lineMeta;

    const lineDeco = buildLineDecorations(view, plan.lineMeta);
    const widgetDeco = buildWidgetDecorations(plan.widgets, {
      onExpand: (gi, ev) => this.onExpand(gi, ev),
      onRetry: (gi) => this.onRetry(gi),
    });
    // Two RangeSets in a flat extension list so both get applied; the
    // newer compartment reconfigure clobbers the previous one cleanly.
    view.dispatch({
      effects: this.decorationsCompartment.reconfigure([
        EditorView.decorations.of(lineDeco),
        EditorView.decorations.of(widgetDeco),
      ]),
    });
  }

  private async applyLanguage(
    language: ReturnType<typeof languageFromPath>,
  ): Promise<void> {
    const requestId = ++this.currentLanguageRequest;
    const ext = await loadLanguageExtension(language);
    if (requestId !== this.currentLanguageRequest) return;
    const v = this.view;
    if (!v) return;
    v.dispatch({
      effects: this.languageCompartment.reconfigure(ext ?? []),
    });
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
      // Clamp to 0 — a failed retry reverts the optimistic bump with a
      // negative count, and we never want a negative reveal counter.
      const updated: GapExpansion =
        direction === 'up'
          ? { ...current, aboveNext: Math.max(0, current.aboveNext + count) }
          : { ...current, belowPrev: Math.max(0, current.belowPrev + count) };
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

  private setError(path: string, gapIndex: number, err: ExpandError): void {
    this.stateByPath.update((prev) => {
      const next = new Map(prev);
      const pathState = next.get(path) ?? EMPTY_PATH_STATE;
      const errors = new Map(pathState.errors);
      errors.set(gapIndex, err);
      next.set(path, { ...pathState, errors });
      return next;
    });
  }

  private clearError(path: string, gapIndex: number): void {
    this.stateByPath.update((prev) => {
      const pathState = prev.get(path);
      if (!pathState || !pathState.errors.has(gapIndex)) return prev;
      const next = new Map(prev);
      const errors = new Map(pathState.errors);
      errors.delete(gapIndex);
      next.set(path, { ...pathState, errors });
      return next;
    });
  }
}

/** Resolve the [from, to] new-side line range to fetch for a single
 *  expand click. Caps the count at the gap's remaining hidden lines
 *  and at the file's known length. Returns null when no fetch is
 *  warranted (e.g. clicking a button that's already at its limit). */
export function computeExpandRange(
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
      gapEndKnown !== null
        ? gapEndKnown - cursor - state.aboveNext + 1
        : rawCount;
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
  const remaining =
    gapEndKnown - gapStart + 1 - state.belowPrev - state.aboveNext;
  if (remaining <= 0) return null;
  const count = Math.min(rawCount, remaining);
  const to = cursor;
  const from = Math.max(gapStart + state.belowPrev, cursor - count + 1);
  return { from, to, count: to - from + 1 };
}

export function buildRenderItems(
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
        gapIndex: gi,
        linesAvailable: gapRemaining(gi, hunks, state, fileLineCount),
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

function gapRemaining(
  gapIndex: number,
  hunks: readonly DiffHunk[],
  state: PathState,
  fileLineCount: number | null,
): number {
  const isFirst = gapIndex === 0;
  const isLast = gapIndex === hunks.length;
  const gapStart = isFirst ? 1 : hunks[gapIndex - 1].endLine + 1;
  const gapEnd = isLast ? fileLineCount : hunks[gapIndex].startLine - 1;
  if (gapEnd === null) return 0;
  if (gapEnd < gapStart) return 0;
  const known = gapEnd - gapStart + 1;
  const exp = state.expansions.get(gapIndex) ?? EMPTY_EXPANSION;
  return Math.max(0, known - exp.belowPrev - exp.aboveNext);
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

  // Failed fetches replace the expand bar with a retry strip — keeps
  // the bar's row footprint so the gap doesn't collapse and reflow.
  const error = state.errors.get(gapIndex);
  if (error !== undefined) {
    items.push({
      kind: 'expand-error',
      gapIndex,
      message: error.message,
      key: `g${gapIndex}:err`,
    });
  } else if (remaining > 0) {
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

