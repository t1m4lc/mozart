import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutter,
  WidgetType,
} from '@codemirror/view';
import { lucideUnfoldVertical } from '@ng-icons/lucide';
import type { DiffLine, DiffLineKind } from '@mozart-ui/diff-parser';
import type {
  HunkExpandDirection,
  HunkExpandEvent,
} from '@mozart-ui/hunk-expand-bar';
import type { RenderItem } from './mz-diff-view';

// Per-line sidecar metadata. Indexed by 1-based CodeMirror line number
// (matching `doc.lineAt(pos).number`). Code lines (add/remove/context)
// AND hunk-header lines occupy doc lines; the hunk gutter button reads
// `hunkGapIndex` to know which gap to expand on click.
export interface LineMeta {
  readonly kind: DiffLineKind;
  readonly oldLine: number | null;
  readonly newLine: number | null;
  readonly hunkGapIndex?: number;
  readonly hunkLinesAvailable?: number;
  // Raw `@@ -a,b +c,d @@` text — surfaced as the line's title attr so
  // hover reveals the original header even though the visible doc text
  // is a human-readable label ("N lines above"). Only set on hunk rows.
  readonly originalHeader?: string;
}

// Stripped-down line body — the unified-diff marker (+, −, space) is
// removed because the gutter + background already carry the signal.
function lineBody(text: string): string {
  if (!text) return '';
  const first = text[0];
  if (first === '+' || first === '-' || first === ' ') return text.slice(1);
  return text;
}

// Diff line bodies that we actually want as text in the CodeMirror doc.
// Preamble meta (diff --git, ---, +++, "no newline" markers, etc.) is
// noise for a code-editor-style view and gets dropped.
function isCodeLine(line: DiffLine): boolean {
  return line.kind === 'add' || line.kind === 'remove' || line.kind === 'context';
}

// How many context lines a single hunk-button click reveals — GitHub
// uses 20 and reviewers are used to it; chunked expansion also keeps
// every fetch bounded for large files.
const HUNK_EXPAND_STEP = 20;

interface ExpandWidgetSpec {
  readonly kind: 'expand';
  readonly pos: number;
  readonly side: 1 | -1;
  readonly gapIndex: number;
  readonly direction: HunkExpandDirection;
  readonly linesAvailable: number;
}

interface RetryWidgetSpec {
  readonly kind: 'expand-error';
  readonly pos: number;
  readonly side: 1 | -1;
  readonly gapIndex: number;
  readonly message: string;
}

export type DocWidgetSpec = ExpandWidgetSpec | RetryWidgetSpec;

export interface DocPlan {
  readonly doc: string;
  readonly lineMeta: readonly LineMeta[];
  readonly widgets: readonly DocWidgetSpec[];
}

// Turn the ordered render items from buildRenderItems into a flat
// CodeMirror plan: doc text, sidecar line metadata, and a list of
// block-widget specs anchored by absolute char position.
//
// Hunk headers are real doc lines (not block widgets) so a per-row
// expand button in the gutter can sit on the same row. Two shifts vs
// the raw `@@` rendering:
//   1. The visible doc text is a direction-neutral human label
//      ("120 hidden lines"); the raw `@@ -a,b +c,d @@` survives as
//      the line's title attr via buildLineDecorations.
//   2. A hunk row is omitted entirely when its gap above has been
//      fully revealed (linesAvailable === 0) — the row's button
//      operates "up" only, so a 0-state row carries no signal and
//      the diff reads as continuous context.
//
// The legacy inter-hunk expand-bar widget is suppressed; only the
// trailing-gap bar (no following hunk to host a button) and any
// expand-error retry strips keep their block-widget treatment.
//
// `hunkCount` is needed so we can tell a trailing-gap `expand` item
// (keep) from an inter-hunk one (drop — the hunk button replaces it).
export function buildDocPlan(
  items: readonly RenderItem[],
  hunkCount: number,
): DocPlan {
  const lineBodies: string[] = [];
  const lineMeta: LineMeta[] = [];
  const widgets: DocWidgetSpec[] = [];
  let pending: DocWidgetSpec[] = [];

  // Char-level cursor that mirrors lineBodies.join('').length so we
  // can stamp widget positions without rebuilding the doc string per
  // iteration.
  let pos = 0;

  const flushPending = (anchorPos: number, side: 1 | -1) => {
    for (const w of pending) {
      widgets.push({ ...w, pos: anchorPos, side } as DocWidgetSpec);
    }
    pending = [];
  };

  const appendLine = (body: string, meta: LineMeta) => {
    flushPending(pos, -1);
    if (lineBodies.length > 0) {
      lineBodies.push('\n');
      pos += 1;
    }
    lineBodies.push(body);
    pos += body.length;
    lineMeta.push(meta);
  };

  for (const item of items) {
    if (item.kind === 'line') {
      if (!isCodeLine(item.line)) continue;
      appendLine(lineBody(item.line.text), {
        kind: item.line.kind,
        oldLine: item.line.oldLineNumber,
        newLine: item.line.newLineNumber,
      });
      continue;
    }
    if (item.kind === 'hunk-header') {
      // Hide the hunk row when its gap above is fully revealed — the
      // row's gutter button only operates "up", so a 0-state row has
      // no actionable affordance and the human label ("No more hidden
      // lines") just adds noise. The hunk's body still renders below;
      // the diff reads as continuous context flowing into the changes.
      const linesAbove = item.linesAvailable;
      if (linesAbove === 0) continue;
      appendLine(formatHunkLabel(linesAbove), {
        kind: 'hunk',
        oldLine: null,
        newLine: null,
        hunkGapIndex: item.gapIndex,
        hunkLinesAvailable: linesAbove,
        originalHeader: item.text,
      });
      continue;
    }
    if (item.kind === 'expand') {
      // Inter-hunk gaps host their expand button on the next hunk's
      // own row — drop the block widget here. The trailing gap has no
      // following hunk to attach to, so we keep its bar.
      if (item.gapIndex < hunkCount) continue;
      pending.push({
        kind: 'expand',
        pos: 0,
        side: -1,
        gapIndex: item.gapIndex,
        direction: item.direction,
        linesAvailable: item.linesAvailable,
      });
      continue;
    }
    if (item.kind === 'expand-error') {
      pending.push({
        kind: 'expand-error',
        pos: 0,
        side: -1,
        gapIndex: item.gapIndex,
        message: item.message,
      });
      continue;
    }
  }

  // Tail widgets (only the trailing-gap expand-bar and any
  // expand-errors) anchor at doc-end with side: 1.
  flushPending(pos, 1);

  return { doc: lineBodies.join(''), lineMeta, widgets };
}

// Line decoration that paints the +/- background via a CSS variable.
// Done via attributes.style so the diff-view component doesn't have to
// own a stylesheet leak across CodeMirror's encapsulation boundary.
const ADD_LINE_DECO = Decoration.line({
  attributes: { style: 'background-color: var(--diff-add-bg);' },
});
const REMOVE_LINE_DECO = Decoration.line({
  attributes: { style: 'background-color: var(--diff-remove-bg);' },
});
// Hunk-row text is metadata, not code. Dim it (muted-foreground) and
// italicize so a glance separates "this row describes the diff" from
// "this row IS the diff".
const HUNK_LINE_DECO = Decoration.line({
  attributes: {
    style:
      'background-color: var(--diff-hunk-bg); color: var(--muted-foreground); font-style: italic;',
    class: 'mz-diff-cm-hunk-row',
  },
});

// Discreet inline marker shown right before the code body — a faint
// "+" / "−" so a glance at the line tells you the direction without
// recoloring the glyph (the line background + line numbers already
// carry the strong signal).
class InlineMarkerWidget extends WidgetType {
  constructor(private readonly glyph: '+' | '−') {
    super();
  }
  override eq(other: WidgetType): boolean {
    return other instanceof InlineMarkerWidget && other.glyph === this.glyph;
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'mz-diff-cm-inline-marker text-muted-foreground/55 select-none';
    el.setAttribute('style', 'margin-right: 0.5ch;');
    el.textContent = this.glyph;
    return el;
  }
  override ignoreEvent(): boolean {
    return true;
  }
}

const ADD_MARKER_DECO = Decoration.widget({
  widget: new InlineMarkerWidget('+'),
  side: -1,
});
const REMOVE_MARKER_DECO = Decoration.widget({
  widget: new InlineMarkerWidget('−'),
  side: -1,
});

export function buildLineDecorations(
  view: EditorView,
  lineMeta: readonly LineMeta[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (let i = 0; i < lineMeta.length; i++) {
    const meta = lineMeta[i];
    const lineNo = i + 1;
    if (lineNo > doc.lines) break;
    const linePos = doc.line(lineNo).from;

    if (meta.kind === 'hunk') {
      builder.add(linePos, linePos, HUNK_LINE_DECO);
      // Surface the raw `@@ -a,b +c,d @@` via the line element's title
      // attr so hover reveals the original header even though the
      // visible doc text is a human-readable label.
      if (meta.originalHeader) {
        builder.add(
          linePos,
          linePos,
          Decoration.line({ attributes: { title: meta.originalHeader } }),
        );
      }
      continue;
    }
    if (meta.kind !== 'add' && meta.kind !== 'remove') continue;
    // Line decoration first (RangeSetBuilder ordering), inline marker
    // widget second at the same position.
    builder.add(
      linePos,
      linePos,
      meta.kind === 'add' ? ADD_LINE_DECO : REMOVE_LINE_DECO,
    );
    builder.add(
      linePos,
      linePos,
      meta.kind === 'add' ? ADD_MARKER_DECO : REMOVE_MARKER_DECO,
    );
  }
  return builder.finish();
}

// ──────────────────────────────────────────────────────────────────────
// Block widgets — only the trailing-gap expand-bar and any
// expand-error retry strips remain as block widgets. Hunk headers
// are real doc lines (host the per-row expand button in their gutter
// cell) and the legacy inline expand-bar was retired with that move.

// Plain-HTML reimplementation of MzHunkExpandBar's visual. Kept in
// sync visually but architecturally separate — CodeMirror widgets
// can't easily host Angular components without ApplicationRef wiring.
export interface ExpandBarCallbacks {
  readonly onExpand: (gapIndex: number, event: HunkExpandEvent) => void;
}

class ExpandBarWidget extends WidgetType {
  constructor(
    private readonly gapIndex: number,
    private readonly direction: HunkExpandDirection,
    private readonly linesAvailable: number,
    private readonly callbacks: ExpandBarCallbacks,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof ExpandBarWidget &&
      other.gapIndex === this.gapIndex &&
      other.direction === this.direction &&
      other.linesAvailable === this.linesAvailable
    );
  }

  toDOM(): HTMLElement {
    const STEP = 10;
    const wrap = document.createElement('div');
    wrap.className =
      'mz-diff-cm-expand-bar flex h-6 items-center justify-center gap-2 border-y border-border/40 px-2 text-[11px]';
    wrap.style.backgroundColor = 'var(--diff-hunk-bg)';

    const showUp =
      this.direction === 'up' || this.direction === 'both';
    const showDown =
      this.direction === 'down' || this.direction === 'both';
    const disabled = this.linesAvailable === 0;

    const makeBtn = (label: string, dir: 'up' | 'down'): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className =
        'text-muted-foreground hover:text-foreground inline-flex h-5 items-center justify-center px-2 disabled:cursor-not-allowed disabled:opacity-50';
      b.disabled = disabled;
      b.setAttribute('aria-label', label);
      b.textContent = dir === 'up' ? '▲' : '▼';
      b.addEventListener('click', (e) => {
        e.preventDefault();
        if (disabled) return;
        const step = e.shiftKey ? STEP * 2 : STEP;
        const count = Math.min(step, this.linesAvailable);
        this.callbacks.onExpand(this.gapIndex, { direction: dir, count });
      });
      return b;
    };

    if (showUp) wrap.appendChild(makeBtn('Show lines above', 'up'));
    const label = document.createElement('span');
    label.className = 'text-muted-foreground/70 font-mono';
    label.textContent = `${this.linesAvailable} hidden lines`;
    wrap.appendChild(label);
    if (showDown) wrap.appendChild(makeBtn('Show lines below', 'down'));

    return wrap;
  }

  override ignoreEvent(): boolean {
    // Let click handlers attached in toDOM run; CodeMirror should NOT
    // treat clicks inside the widget as editor events.
    return false;
  }
}

export interface RetryCallbacks {
  readonly onRetry: (gapIndex: number) => void;
}

class RetryStripWidget extends WidgetType {
  constructor(
    private readonly gapIndex: number,
    private readonly message: string,
    private readonly callbacks: RetryCallbacks,
  ) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return (
      other instanceof RetryStripWidget &&
      other.gapIndex === this.gapIndex &&
      other.message === this.message
    );
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className =
      'mz-diff-cm-retry-strip flex items-center justify-between gap-2 border-y border-destructive/20 bg-destructive/5 px-3 py-1 text-[11px] text-destructive';
    wrap.setAttribute('role', 'alert');

    const msg = document.createElement('span');
    msg.className = 'min-w-0 truncate';
    msg.title = this.message;
    msg.textContent = `Failed to load context: ${this.message}`;
    wrap.appendChild(msg);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'shrink-0 inline-flex h-5 items-center gap-1 px-2 text-destructive hover:text-destructive font-medium';
    btn.textContent = 'Retry';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      this.callbacks.onRetry(this.gapIndex);
    });
    wrap.appendChild(btn);

    return wrap;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export function buildWidgetDecorations(
  widgets: readonly DocWidgetSpec[],
  callbacks: ExpandBarCallbacks & RetryCallbacks,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  // Sort by (pos asc, side asc) so RangeSetBuilder accepts them.
  const sorted = [...widgets].sort((a, b) =>
    a.pos !== b.pos ? a.pos - b.pos : a.side - b.side,
  );
  for (const w of sorted) {
    let widget: WidgetType;
    if (w.kind === 'expand')
      widget = new ExpandBarWidget(
        w.gapIndex,
        w.direction,
        w.linesAvailable,
        callbacks,
      );
    else widget = new RetryStripWidget(w.gapIndex, w.message, callbacks);

    const deco = Decoration.widget({ widget, block: true, side: w.side });
    builder.add(w.pos, w.pos, deco);
  }
  return builder.finish();
}

// ──────────────────────────────────────────────────────────────────────
// Two-column gutter — old and new file-line numbers, derived from the
// per-line meta sidecar (NOT CodeMirror's intrinsic line count). For
// add lines: only newLine. For remove: only oldLine. Hunk headers don't
// occupy a doc line (they're block widgets) so the gutter never asks.

// Line-number cell. Text stays muted across all kinds — the gutter
// background (add/remove tinted via --diff-*-bg) and the inline
// marker carry the directional signal. block+h-full so the colored
// background fills the whole cell even when the number itself is
// empty (add row's old column / remove row's new column).
const NUM_BASE_CLASS =
  'mz-diff-cm-line-num block h-full px-1 text-right tabular-nums text-muted-foreground/55';
// Gutter cell background uses the STRONG token so the column reads
// as a saturated label band next to the softer-tinted line body.
const NUM_BG_STYLE: Partial<Record<DiffLineKind, string>> = {
  add: 'background-color: var(--diff-add-bg-strong);',
  remove: 'background-color: var(--diff-remove-bg-strong);',
  hunk: 'background-color: var(--diff-hunk-bg-strong);',
};

class NumberGutterMarker extends GutterMarker {
  constructor(
    private readonly text: string,
    private readonly kind: DiffLineKind,
  ) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return (
      other instanceof NumberGutterMarker &&
      other.text === this.text &&
      other.kind === this.kind
    );
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = NUM_BASE_CLASS;
    const bgStyle = NUM_BG_STYLE[this.kind];
    if (bgStyle) el.setAttribute('style', bgStyle);
    el.textContent = this.text;
    return el;
  }
}

// A four-character spacer keeps the gutter narrower than the old
// 5-char "99999" while still fitting line numbers up to 9999.
class SpacerMarker extends GutterMarker {
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = `${NUM_BASE_CLASS} text-transparent`;
    el.textContent = '9999';
    return el;
  }
}

// Hunk-row expand button. Fills the full hunk-row gutter band (both
// OLD and NEW number columns) with just an unfold icon — same lucide
// glyph as the Expand-all action on MzFileDiffCard so the "reveal
// hidden lines" affordance reads consistently. The button lives in
// the OLD cell and stretches rightward via `width: 200%` so it visually
// covers the NEW cell too; the NEW cell's HunkEmptyMarker provides the
// strong background behind it. Disabled when the gap above is fully
// revealed.
export class HunkButtonMarker extends GutterMarker {
  constructor(
    private readonly gapIndex: number,
    private readonly linesAvailable: number,
    private readonly onExpand: (
      gapIndex: number,
      event: HunkExpandEvent,
    ) => void,
  ) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return (
      other instanceof HunkButtonMarker &&
      other.gapIndex === this.gapIndex &&
      other.linesAvailable === this.linesAvailable
    );
  }
  override toDOM(): HTMLElement {
    const cell = document.createElement('span');
    cell.className = 'mz-diff-cm-hunk-cell relative block h-full w-full';
    cell.setAttribute(
      'style',
      'background-color: var(--diff-hunk-bg-strong);',
    );

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'mz-diff-cm-hunk-btn absolute inset-y-0 left-0 inline-flex items-center justify-center text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';
    // width: 200% stretches the button across both gutter cells (OLD +
    // NEW). z-index keeps it above the NEW cell's HunkEmptyMarker.
    btn.setAttribute(
      'style',
      'width: 200%; background-color: var(--diff-hunk-bg-strong); border: none; cursor: pointer; padding: 0; z-index: 2;',
    );
    btn.disabled = this.linesAvailable === 0;
    btn.title =
      this.linesAvailable === 0
        ? 'No more hidden lines'
        : `Show ${Math.min(HUNK_EXPAND_STEP, this.linesAvailable)} lines above`;

    // Same lucide glyph as the Expand-all button on MzFileDiffCard.
    btn.innerHTML = lucideUnfoldVertical;
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '12');
      svg.setAttribute('height', '12');
    }

    // Shift-click doubles the step, matching ExpandBarWidget's idiom.
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      const requested = e.shiftKey ? HUNK_EXPAND_STEP * 2 : HUNK_EXPAND_STEP;
      const count = Math.min(requested, this.linesAvailable);
      this.onExpand(this.gapIndex, { direction: 'up', count });
    });

    cell.appendChild(btn);
    return cell;
  }
}

// Right-side cell of a hunk row — no number, no button, just the
// strong background so the column reads as a continuous band with
// the OLD cell. The HunkButtonMarker's icon is absolutely positioned
// across the seam between this cell and the OLD one.
class HunkEmptyMarker extends GutterMarker {
  override eq(other: GutterMarker): boolean {
    return other instanceof HunkEmptyMarker;
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = `${NUM_BASE_CLASS}`;
    el.setAttribute(
      'style',
      'background-color: var(--diff-hunk-bg-strong);',
    );
    el.textContent = '';
    return el;
  }
}

function formatNumber(n: number | null): string {
  return n === null ? '' : String(n);
}

// Human-readable label for the hunk row, keyed off the number of
// still-hidden context lines around this hunk. Replaces the raw
// `@@ -a,b +c,d @@` text in the visible doc; the raw header survives
// as the row's title attr (see buildLineDecorations). Wording is
// direction-neutral — the gutter button (which IS directional) carries
// the "above" / "below" affordance.
export function formatHunkLabel(linesAvailable: number): string {
  if (linesAvailable <= 0) return 'No more hidden lines';
  if (linesAvailable === 1) return '1 hidden line';
  return `${linesAvailable} hidden lines`;
}

export function oldLineGutter(
  getMeta: (line: number) => LineMeta | undefined,
  onExpand: (gapIndex: number, event: HunkExpandEvent) => void,
): Extension {
  return gutter({
    class: 'mz-diff-cm-gutter-old',
    lineMarker: (view, line) => {
      const lineNum = view.state.doc.lineAt(line.from).number;
      const m = getMeta(lineNum);
      if (!m) return null;
      if (m.kind === 'hunk') {
        return new HunkButtonMarker(
          m.hunkGapIndex ?? 0,
          m.hunkLinesAvailable ?? 0,
          onExpand,
        );
      }
      return new NumberGutterMarker(formatNumber(m.oldLine), m.kind);
    },
    initialSpacer: () => new SpacerMarker(),
  });
}

export function newLineGutter(
  getMeta: (line: number) => LineMeta | undefined,
): Extension {
  return gutter({
    class: 'mz-diff-cm-gutter-new',
    lineMarker: (view, line) => {
      const lineNum = view.state.doc.lineAt(line.from).number;
      const m = getMeta(lineNum);
      if (!m) return null;
      // Hunk rows get the empty strong-bg cell — the button sits in
      // the OLD cell and visually spans the seam into this one.
      if (m.kind === 'hunk') return new HunkEmptyMarker();
      return new NumberGutterMarker(formatNumber(m.newLine), m.kind);
    },
    initialSpacer: () => new SpacerMarker(),
  });
}
