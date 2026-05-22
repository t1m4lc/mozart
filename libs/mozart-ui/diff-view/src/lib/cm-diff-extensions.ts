import { RangeSetBuilder, type Extension } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  GutterMarker,
  gutter,
  WidgetType,
} from '@codemirror/view';
import type { DiffLine, DiffLineKind } from '@mozart-ui/diff-parser';
import type {
  HunkExpandDirection,
  HunkExpandEvent,
} from '@mozart-ui/hunk-expand-bar';
import type { RenderItem } from './mz-diff-view';

// Per-line sidecar metadata. Indexed by 1-based CodeMirror line number
// (matching `doc.lineAt(pos).number`). Hunk headers + expand bars are
// rendered as block widgets and don't occupy a doc line, so the meta
// only covers the actual code lines.
export interface LineMeta {
  readonly kind: DiffLineKind;
  readonly oldLine: number | null;
  readonly newLine: number | null;
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

export interface HunkHeaderWidgetSpec {
  readonly kind: 'hunk-header';
  readonly pos: number;
  readonly side: 1 | -1;
  readonly text: string;
}

export type DocWidgetSpec =
  | ExpandWidgetSpec
  | RetryWidgetSpec
  | HunkHeaderWidgetSpec;

export interface DocPlan {
  readonly doc: string;
  readonly lineMeta: readonly LineMeta[];
  readonly widgets: readonly DocWidgetSpec[];
}

// Turn the ordered render items from buildRenderItems into a flat
// CodeMirror plan: doc text, sidecar line metadata, and a list of
// block-widget specs anchored by absolute char position.
//
// Widget anchoring: every non-line item attaches to the next line that
// follows it in the item stream (side: -1, renders above). Trailing
// non-line items with no following line anchor to doc-end (side: 1).
export function buildDocPlan(items: readonly RenderItem[]): DocPlan {
  const lineBodies: string[] = [];
  const lineMeta: LineMeta[] = [];
  const widgets: DocWidgetSpec[] = [];
  let pending: DocWidgetSpec[] = [];

  // Position once we've appended one body B and a newline: pos = B.length + 1.
  // To know the pos for "before the next line", we compute the would-be
  // doc length at that point.
  let pos = 0;

  for (const item of items) {
    if (item.kind === 'line') {
      if (!isCodeLine(item.line)) continue;
      const body = lineBody(item.line.text);
      // Flush any pending widgets at this line's start (side: -1 → above).
      for (const w of pending) {
        widgets.push({ ...w, pos, side: -1 } as DocWidgetSpec);
      }
      pending = [];
      // Newline separator added for every line except the very first;
      // CodeMirror's doc uses LF as the line separator.
      if (lineBodies.length > 0) {
        lineBodies.push('\n');
        pos += 1;
      }
      lineBodies.push(body);
      pos += body.length;
      lineMeta.push({
        kind: item.line.kind,
        oldLine: item.line.oldLineNumber,
        newLine: item.line.newLineNumber,
      });
      continue;
    }
    if (item.kind === 'hunk-header') {
      pending.push({ kind: 'hunk-header', pos: 0, side: -1, text: item.text });
      continue;
    }
    if (item.kind === 'expand') {
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

  // Any tail widgets with no following line anchor at doc-end side: 1.
  for (const w of pending) {
    widgets.push({ ...w, pos, side: 1 } as DocWidgetSpec);
  }

  return { doc: lineBodies.join(''), lineMeta, widgets };
}

// Line decoration that paints the +/- background via a CSS variable.
// Done via attributes.style so the diff-view component doesn't have to
// own a stylesheet leak across CodeMirror's encapsulation boundary.
const ADD_LINE_DECO = Decoration.line({
  attributes: {
    style:
      'background-color: var(--diff-add-bg); border-left: 2px solid var(--diff-add-marker-fg);',
  },
});
const REMOVE_LINE_DECO = Decoration.line({
  attributes: {
    style:
      'background-color: var(--diff-remove-bg); border-left: 2px solid var(--diff-remove-marker-fg);',
  },
});

export function buildLineDecorations(
  view: EditorView,
  lineMeta: readonly LineMeta[],
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (let i = 0; i < lineMeta.length; i++) {
    const meta = lineMeta[i];
    if (meta.kind !== 'add' && meta.kind !== 'remove') continue;
    const lineNo = i + 1;
    if (lineNo > doc.lines) break;
    const linePos = doc.line(lineNo).from;
    builder.add(linePos, linePos, meta.kind === 'add' ? ADD_LINE_DECO : REMOVE_LINE_DECO);
  }
  return builder.finish();
}

// ──────────────────────────────────────────────────────────────────────
// Block widgets

export class HunkHeaderWidget extends WidgetType {
  constructor(private readonly text: string) {
    super();
  }

  override eq(other: WidgetType): boolean {
    return other instanceof HunkHeaderWidget && other.text === this.text;
  }

  toDOM(): HTMLElement {
    const el = document.createElement('div');
    el.className =
      'mz-diff-cm-hunk-header text-muted-foreground px-2 py-0.5 font-mono text-[11px] select-text';
    el.style.backgroundColor = 'var(--diff-hunk-bg)';
    el.textContent = this.text;
    return el;
  }
}

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
    if (w.kind === 'hunk-header') widget = new HunkHeaderWidget(w.text);
    else if (w.kind === 'expand')
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

class NumberGutterMarker extends GutterMarker {
  constructor(private readonly text: string) {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof NumberGutterMarker && other.text === this.text;
  }
  override toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'mz-diff-cm-line-num text-muted-foreground/60 px-1 text-right tabular-nums';
    el.textContent = this.text;
    return el;
  }
}

function formatNumber(n: number | null): string {
  return n === null ? '' : String(n);
}

export function oldLineGutter(
  getMeta: (line: number) => LineMeta | undefined,
): Extension {
  return gutter({
    class: 'mz-diff-cm-gutter-old',
    lineMarker: (view, line) => {
      const lineNum = view.state.doc.lineAt(line.from).number;
      const m = getMeta(lineNum);
      if (!m) return null;
      return new NumberGutterMarker(formatNumber(m.oldLine));
    },
    initialSpacer: () => new NumberGutterMarker('99999'),
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
      return new NumberGutterMarker(formatNumber(m.newLine));
    },
    initialSpacer: () => new NumberGutterMarker('99999'),
  });
}
