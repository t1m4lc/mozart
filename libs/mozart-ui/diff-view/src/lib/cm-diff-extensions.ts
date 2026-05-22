import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutter,
  WidgetType,
} from '@codemirror/view';
import { lucideChevronUp } from '@ng-icons/lucide';
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
export const HUNK_EXPAND_STEP = 20;

export interface ExpandWidgetSpec {
  readonly kind: 'expand';
  readonly pos: number;
  readonly side: 1 | -1;
  readonly gapIndex: number;
  readonly direction: HunkExpandDirection;
  readonly linesAvailable: number;
}

export interface RetryWidgetSpec {
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
// Hunk headers are now real doc lines (not block widgets) so a per-row
// expand button in the gutter can sit on the same row as the
// `@@ … @@` text — GitHub style. The legacy inter-hunk expand-bar
// widget is suppressed; only the trailing-gap bar (no following hunk
// to host a button) and any expand-error retry strips keep their
// block-widget treatment.
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
      appendLine(item.text, {
        kind: 'hunk',
        oldLine: null,
        newLine: null,
        hunkGapIndex: item.gapIndex,
        hunkLinesAvailable: item.linesAvailable,
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
const HUNK_LINE_DECO = Decoration.line({
  attributes: {
    style: 'background-color: var(--diff-hunk-bg);',
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

export class ExpandBarWidget extends WidgetType {
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

export class RetryStripWidget extends WidgetType {
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

// Hunk-row "expand 20 lines up" button. Single icon visually
// centered on the seam between the two gutter columns: lives in the
// LEFT cell with the button absolutely positioned at the cell's
// right edge and translated 50% rightward so its center sits exactly
// where the gutters meet. The RIGHT cell renders a HunkEmptyMarker
// (same strong bg, no content) so the band reads as one continuous
// strip. Chevron icon matches MzHunkExpandBar (lucideChevronUp).
// Disabled when the gap above is fully revealed.
class HunkButtonMarker extends GutterMarker {
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
      'mz-diff-cm-hunk-btn absolute top-1/2 right-0 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40';
    btn.setAttribute(
      'style',
      'transform: translate(50%, -50%); background-color: var(--diff-hunk-bg-strong); padding: 0; border: none; cursor: pointer; z-index: 2;',
    );
    btn.innerHTML = lucideChevronUp;
    const svg = btn.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '12');
      svg.setAttribute('height', '12');
    }
    btn.disabled = this.linesAvailable === 0;
    btn.title =
      this.linesAvailable === 0
        ? 'No more hidden lines'
        : `Show ${Math.min(HUNK_EXPAND_STEP, this.linesAvailable)} lines above`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (btn.disabled) return;
      const count = Math.min(HUNK_EXPAND_STEP, this.linesAvailable);
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
