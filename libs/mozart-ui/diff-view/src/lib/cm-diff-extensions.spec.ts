import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { DiffLine } from '@mozart-ui/diff-parser';
import type { HunkExpandEvent } from '@mozart-ui/hunk-expand-bar';
import {
  buildDocPlan,
  buildLineDecorations,
  formatHunkLabel,
  HunkButtonMarker,
  type LineMeta,
} from './cm-diff-extensions';
import type { RenderItem } from './mz-diff-view';

// Small helpers to construct typed RenderItem fixtures without
// repeating shape boilerplate in every case.

function lineItem(
  kind: 'add' | 'remove' | 'context',
  text: string,
  oldLineNumber: number | null,
  newLineNumber: number | null,
  key: string,
): RenderItem {
  const line: DiffLine = { kind, text, oldLineNumber, newLineNumber };
  return { kind: 'line', line, key };
}

function hunkHeader(
  gapIndex: number,
  linesAvailable: number,
  text = `@@ -${gapIndex * 10 + 1},2 +${gapIndex * 10 + 1},2 @@`,
): RenderItem {
  return {
    kind: 'hunk-header',
    text,
    key: `h${gapIndex}:hdr`,
    gapIndex,
    linesAvailable,
  };
}

// ──────────────────────────────────────────────────────────────────────
// 1. formatHunkLabel — pure helper, direction-neutral wording.

describe('formatHunkLabel', () => {
  it('renders plural form for n > 1', () => {
    expect(formatHunkLabel(120)).toBe('120 hidden lines');
  });

  it('renders singular form for n === 1', () => {
    expect(formatHunkLabel(1)).toBe('1 hidden line');
  });

  it('renders the no-more state for n === 0', () => {
    expect(formatHunkLabel(0)).toBe('No more hidden lines');
  });
});

// ──────────────────────────────────────────────────────────────────────
// 2. buildDocPlan hunk-header branch — label swap, originalHeader
// passthrough, and hide-on-both-empty refinement.

describe('buildDocPlan hunk-header handling', () => {
  it('emits one doc line per hunk header with the human label as text', () => {
    const items: readonly RenderItem[] = [hunkHeader(0, 50, '@@ -1,3 +1,3 @@')];
    const plan = buildDocPlan(items, 1);
    expect(plan.doc).toBe('50 hidden lines');
    expect(plan.lineMeta).toHaveLength(1);
    expect(plan.lineMeta[0].kind).toBe('hunk');
    expect(plan.lineMeta[0].originalHeader).toBe('@@ -1,3 +1,3 @@');
    expect(plan.lineMeta[0].hunkGapIndex).toBe(0);
    expect(plan.lineMeta[0].hunkLinesAvailable).toBe(50);
  });

  it('hides a hunk row whose gap above is fully revealed', () => {
    const items: readonly RenderItem[] = [hunkHeader(0, 0, '@@ -1,3 +1,3 @@')];
    const plan = buildDocPlan(items, 1);
    expect(plan.lineMeta).toHaveLength(0);
    expect(plan.doc).toBe('');
  });

  it('hides every hunk whose gap above is fully revealed independently', () => {
    const items: readonly RenderItem[] = [
      hunkHeader(0, 0, '@@ -1,2 +1,2 @@'),
      hunkHeader(1, 0, '@@ -10,2 +10,2 @@'),
    ];
    const plan = buildDocPlan(items, 2);
    expect(plan.lineMeta).toHaveLength(0);
  });

  it('hides only the hunk whose gap above is empty, keeping the other', () => {
    const items: readonly RenderItem[] = [
      hunkHeader(0, 0, '@@ -1,2 +1,2 @@'),
      hunkHeader(1, 7, '@@ -10,2 +10,2 @@'),
    ];
    const plan = buildDocPlan(items, 2);
    expect(plan.lineMeta).toHaveLength(1);
    expect(plan.lineMeta[0].originalHeader).toBe('@@ -10,2 +10,2 @@');
    expect(plan.doc).toBe('7 hidden lines');
  });

  it('keeps code-line items between hunk-headers in document order', () => {
    const items: readonly RenderItem[] = [
      hunkHeader(0, 5, '@@ -1,3 +1,3 @@'),
      lineItem('context', ' ctx', 1, 1, 'h0:l0'),
      lineItem('add', '+added', null, 2, 'h0:l1'),
      hunkHeader(1, 3, '@@ -10,2 +10,2 @@'),
      lineItem('remove', '-old', 10, null, 'h1:l0'),
    ];
    const plan = buildDocPlan(items, 2);
    expect(plan.doc.split('\n')).toEqual([
      '5 hidden lines',
      'ctx',
      'added',
      '3 hidden lines',
      'old',
    ]);
    expect(plan.lineMeta.map((m) => m.kind)).toEqual([
      'hunk',
      'context',
      'add',
      'hunk',
      'remove',
    ]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// 3. buildLineDecorations — verify the new title decoration flows
// through alongside the existing HUNK_LINE_DECO, and that add/remove
// paths still emit their line+marker decos (regression guard).

function mountView(doc: string): EditorView {
  return new EditorView({
    state: EditorState.create({ doc }),
    parent: document.body,
  });
}

describe('buildLineDecorations', () => {
  it('adds a title attr decoration on a hunk row when originalHeader is set', () => {
    const view = mountView('50 hidden lines');
    const meta: LineMeta[] = [
      {
        kind: 'hunk',
        oldLine: null,
        newLine: null,
        hunkGapIndex: 0,
        hunkLinesAvailable: 50,
        originalHeader: '@@ -1,3 +1,3 @@',
      },
    ];
    const set = buildLineDecorations(view, meta);
    const decos: Array<{ from: number; to: number; spec: unknown }> = [];
    set.between(0, view.state.doc.length, (from, to, value) => {
      decos.push({ from, to, spec: value.spec });
    });
    // Expect 2 decos at pos 0: HUNK_LINE_DECO + title decoration.
    expect(decos).toHaveLength(2);
    const specs = decos.map(
      (d) => d.spec as { attributes?: Record<string, string> },
    );
    const titleSpec = specs.find((s) => s.attributes?.['title']);
    expect(titleSpec?.attributes?.['title']).toBe('@@ -1,3 +1,3 @@');
    view.destroy();
  });

  it('skips the title decoration when originalHeader is absent', () => {
    const view = mountView('No more hidden lines');
    const meta: LineMeta[] = [
      {
        kind: 'hunk',
        oldLine: null,
        newLine: null,
        hunkGapIndex: 0,
        hunkLinesAvailable: 0,
      },
    ];
    const set = buildLineDecorations(view, meta);
    let count = 0;
    set.between(0, view.state.doc.length, () => {
      count++;
    });
    expect(count).toBe(1);
    view.destroy();
  });

  it('still emits line + marker decorations for add and remove kinds', () => {
    const view = mountView('added\nremoved');
    const meta: LineMeta[] = [
      { kind: 'add', oldLine: null, newLine: 1 },
      { kind: 'remove', oldLine: 1, newLine: null },
    ];
    const set = buildLineDecorations(view, meta);
    let count = 0;
    set.between(0, view.state.doc.length, () => {
      count++;
    });
    // 2 lines × (line deco + inline marker widget) = 4 decorations.
    expect(count).toBe(4);
    view.destroy();
  });
});

// ──────────────────────────────────────────────────────────────────────
// 4. HunkButtonMarker — eq() identity, disabled state, count badge,
// and shift-click semantics.

describe('HunkButtonMarker', () => {
  const noop = (_gap: number, _ev: HunkExpandEvent) => undefined;

  it('eq() treats markers with the same gapIndex + linesAvailable as equal', () => {
    const a = new HunkButtonMarker(2, 30, noop);
    const b = new HunkButtonMarker(2, 30, noop);
    expect(a.eq(b)).toBe(true);
  });

  it('eq() distinguishes markers when linesAvailable changes', () => {
    const a = new HunkButtonMarker(2, 30, noop);
    const b = new HunkButtonMarker(2, 10, noop);
    expect(a.eq(b)).toBe(false);
  });

  it('toDOM() disables the button and updates the title when fully revealed', () => {
    const marker = new HunkButtonMarker(0, 0, noop);
    const cell = marker.toDOM();
    const btn = cell.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(true);
    expect(btn!.title).toBe('No more hidden lines');
  });

  it('toDOM() renders just the unfold icon when lines remain', () => {
    const marker = new HunkButtonMarker(0, 50, noop);
    const cell = marker.toDOM();
    const btn = cell.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn!.disabled).toBe(false);
    expect(btn!.title).toBe('Show 20 lines above');
    expect(cell.querySelector('svg')).not.toBeNull();
    // No count badge — the button is icon-only by design.
    expect(cell.querySelector('.mz-diff-cm-hunk-btn-count')).toBeNull();
    // Button spans both gutter columns via width: 200%.
    expect(btn!.getAttribute('style')).toContain('width: 200%');
  });

  it('toDOM() click invokes onExpand with HUNK_EXPAND_STEP by default', () => {
    let received: { gap: number; ev: HunkExpandEvent } | null = null;
    const marker = new HunkButtonMarker(3, 100, (gap, ev) => {
      received = { gap, ev };
    });
    const btn = marker.toDOM().querySelector('button')!;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(received).not.toBeNull();
    expect(received!.gap).toBe(3);
    expect(received!.ev).toEqual({ direction: 'up', count: 20 });
  });

  it('toDOM() shift-click doubles the expansion step', () => {
    let received: { gap: number; ev: HunkExpandEvent } | null = null;
    const marker = new HunkButtonMarker(3, 100, (gap, ev) => {
      received = { gap, ev };
    });
    const btn = marker.toDOM().querySelector('button')!;
    btn.dispatchEvent(
      new MouseEvent('click', { bubbles: true, shiftKey: true }),
    );
    expect(received!.ev).toEqual({ direction: 'up', count: 40 });
  });

  it('toDOM() clamps the requested step to linesAvailable', () => {
    let received: { gap: number; ev: HunkExpandEvent } | null = null;
    const marker = new HunkButtonMarker(0, 7, (gap, ev) => {
      received = { gap, ev };
    });
    const btn = marker.toDOM().querySelector('button')!;
    // Shift would ask for 40, but only 7 lines remain.
    btn.dispatchEvent(
      new MouseEvent('click', { bubbles: true, shiftKey: true }),
    );
    expect(received!.ev.count).toBe(7);
    // Default click also clamps to 7.
    received = null;
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(received!.ev.count).toBe(7);
  });
});
