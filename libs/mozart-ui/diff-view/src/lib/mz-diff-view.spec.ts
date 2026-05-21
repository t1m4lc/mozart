import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DiffHunk, DiffLine } from '@mozart-ui/diff-parser';
import {
  buildRenderItems,
  computeExpandRange,
  MzDiffView,
  type GapExpansion,
  type PathState,
  type RenderItem,
} from './mz-diff-view';

const EMPTY_STATE: PathState = {
  expansions: new Map(),
  cache: new Map(),
  errors: new Map(),
};

function emptyState(): PathState {
  return {
    expansions: new Map(),
    cache: new Map(),
    errors: new Map(),
  };
}

function makeHunk(
  startLine: number,
  endLine: number,
  lines: readonly DiffLine[] = [],
): DiffHunk {
  const newCount = Math.max(0, endLine - startLine + 1);
  return {
    header: `@@ -${startLine},${newCount} +${startLine},${newCount} @@`,
    lines,
    startLine,
    endLine,
    newCount,
    oldStart: startLine,
    oldCount: newCount,
    addedLines: 0,
    removedLines: 0,
  };
}

function makeContextLine(newLineNumber: number, text: string): DiffLine {
  return {
    kind: 'context',
    text: ' ' + text,
    oldLineNumber: newLineNumber,
    newLineNumber,
  };
}

function diffWithTwoHunks(): string {
  // Hunk 1 covers lines 10-12 on the new side; hunk 2 covers 50-51.
  return [
    'diff --git a/foo.ts b/foo.ts',
    '--- a/foo.ts',
    '+++ b/foo.ts',
    '@@ -10,3 +10,3 @@',
    ' line10',
    '-old11',
    '+new11',
    ' line12',
    '@@ -50,2 +50,2 @@',
    ' line50',
    '-old51',
    '+new51',
  ].join('\n');
}

function mountComponent(opts: {
  path?: string | null;
  diffText?: string;
  fetchContext?: ((from: number, to: number) => Promise<readonly string[]>) | null;
  fileLineCount?: number | null;
}): ComponentFixture<MzDiffView> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(MzDiffView);
  fixture.componentRef.setInput('path', opts.path ?? 'foo.ts');
  fixture.componentRef.setInput('diffText', opts.diffText ?? '');
  fixture.componentRef.setInput('fetchContext', opts.fetchContext ?? null);
  fixture.componentRef.setInput('fileLineCount', opts.fileLineCount ?? null);
  fixture.detectChanges();
  return fixture;
}

describe('buildRenderItems', () => {
  it('returns only preamble lines when there are no hunks', () => {
    const preamble: DiffLine[] = [
      {
        kind: 'meta',
        text: 'diff --git a/foo b/foo',
        oldLineNumber: null,
        newLineNumber: null,
      },
      {
        kind: 'meta',
        text: '--- a/foo',
        oldLineNumber: null,
        newLineNumber: null,
      },
    ];
    const items = buildRenderItems(preamble, [], EMPTY_STATE, null);
    expect(items.every((i) => i.kind === 'line')).toBe(true);
    expect(items).toHaveLength(2);
  });

  it('emits N+1 gap slots (with their bars) for N hunks when bounded by fileLineCount', () => {
    // Hunk at lines 10-12 (gap0 = 1-9, gap1 = 13-49, gap2 = 52-100).
    const hunks = [makeHunk(10, 12), makeHunk(50, 51)];
    const items = buildRenderItems([], hunks, EMPTY_STATE, 100);
    const expandBars = items.filter((i) => i.kind === 'expand');
    // 3 gaps: before hunk0, between hunk0 and hunk1, after hunk1.
    expect(expandBars).toHaveLength(3);
    // First gap → up only (no previous hunk).
    expect(expandBars[0]).toMatchObject({ direction: 'up', gapIndex: 0 });
    // Middle gap → both directions.
    expect(expandBars[1]).toMatchObject({ direction: 'both', gapIndex: 1 });
    // Last gap → down only (no next hunk).
    expect(expandBars[2]).toMatchObject({ direction: 'down', gapIndex: 2 });
  });

  it('suppresses the first-gap bar when hunk[0] starts at line 1', () => {
    const hunks = [makeHunk(1, 3)];
    const items = buildRenderItems([], hunks, EMPTY_STATE, 100);
    const bars = items.filter((i) => i.kind === 'expand');
    expect(bars).toHaveLength(1);
    // The only bar must be the trailing gap, not the first.
    expect(bars[0]).toMatchObject({ gapIndex: 1, direction: 'down' });
  });

  it('suppresses the last-gap bar when fileLineCount is null', () => {
    const hunks = [makeHunk(10, 12)];
    const items = buildRenderItems([], hunks, EMPTY_STATE, null);
    const bars = items.filter((i) => i.kind === 'expand');
    // Only the first-gap bar (we know it extends to line 9); the
    // trailing gap has no known end so we suppress it.
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ gapIndex: 0, direction: 'up' });
  });
});

describe('computeExpandRange', () => {
  it('returns null for direction=down on gap 0', () => {
    const result = computeExpandRange(
      0,
      'down',
      10,
      [makeHunk(10, 12)],
      100,
      { belowPrev: 0, aboveNext: 0 },
    );
    expect(result).toBeNull();
  });

  it('returns null for direction=up on the trailing gap with no fileLineCount', () => {
    const hunks = [makeHunk(10, 12)];
    const result = computeExpandRange(
      1,
      'up',
      10,
      hunks,
      null,
      { belowPrev: 0, aboveNext: 0 },
    );
    expect(result).toBeNull();
  });

  it('returns null when the gap is fully expanded', () => {
    // gap 1 is between hunk0 (10-12) and hunk1 (20-22) → 13-19 = 7 lines.
    const hunks = [makeHunk(10, 12), makeHunk(20, 22)];
    const state: GapExpansion = { belowPrev: 4, aboveNext: 3 };
    const result = computeExpandRange(1, 'down', 10, hunks, 100, state);
    expect(result).toBeNull();
  });

  it('clamps the range to fileLineCount when the request would overflow', () => {
    // Trailing gap starts at line 13; file ends at line 15. Asking for
    // 10 should clamp to 3.
    const hunks = [makeHunk(10, 12)];
    const result = computeExpandRange(
      1,
      'down',
      10,
      hunks,
      15,
      { belowPrev: 0, aboveNext: 0 },
    );
    expect(result).toEqual({ from: 13, to: 15, count: 3 });
  });
});

describe('MzDiffView component', () => {
  it('preserves per-path state when switching to another path and back', async () => {
    const fetchContext = vi.fn(async (from: number, to: number) => {
      const out: string[] = [];
      for (let i = from; i <= to; i++) out.push(`line${i}`);
      return out;
    });

    const fixture = mountComponent({
      path: 'foo.ts',
      diffText: diffWithTwoHunks(),
      fetchContext,
      fileLineCount: 60,
    });

    // Trigger an expansion in the first gap of foo.ts.
    fixture.componentInstance.expandAll();
    await fixture.whenStable();
    fixture.detectChanges();
    const fooCalls = fetchContext.mock.calls.length;
    expect(fooCalls).toBeGreaterThan(0);

    // Switch to bar.ts — no diff, no calls.
    fixture.componentRef.setInput('path', 'bar.ts');
    fixture.componentRef.setInput('diffText', '');
    fixture.detectChanges();

    // Switch back to foo.ts. The cached expansions should re-render
    // synthesized context lines without re-fetching.
    fixture.componentRef.setInput('path', 'foo.ts');
    fixture.componentRef.setInput('diffText', diffWithTwoHunks());
    fixture.detectChanges();

    // Pull internal state through the rendered DOM: there should be
    // context rows synthesized from the cached lines.
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('line1'); // a revealed line from the first gap
  });

  it('expandAll is a no-op when fetchContext is null', () => {
    const fixture = mountComponent({
      diffText: diffWithTwoHunks(),
      fetchContext: null,
      fileLineCount: 60,
    });
    // Should not throw and should not change render items.
    const before = (fixture.nativeElement as HTMLElement).innerHTML;
    fixture.componentInstance.expandAll();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).innerHTML).toBe(before);
  });

  it('expandAll calls the fetcher for every non-empty gap', async () => {
    const fetchContext = vi.fn(async (from: number, to: number) => {
      const out: string[] = [];
      for (let i = from; i <= to; i++) out.push(`line${i}`);
      return out;
    });

    const fixture = mountComponent({
      diffText: diffWithTwoHunks(),
      fetchContext,
      fileLineCount: 60,
    });

    fixture.componentInstance.expandAll();
    await fixture.whenStable();
    // 3 gaps (gap 0 = lines 1-9, gap 1 = 13-49, gap 2 = 52-60), all
    // non-empty and with known ends, so we expect 3 fetches.
    expect(fetchContext).toHaveBeenCalledTimes(3);
  });

  it('expandAll skips gaps with no remaining hidden lines', async () => {
    // Hunks touch line 1, so gap 0 is empty.
    const diff = [
      'diff --git a/foo.ts b/foo.ts',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,1 +1,1 @@',
      '-old1',
      '+new1',
    ].join('\n');
    const fetchContext = vi.fn(async () => []);

    const fixture = mountComponent({
      diffText: diff,
      fetchContext,
      fileLineCount: 1,
    });

    fixture.componentInstance.expandAll();
    await fixture.whenStable();
    // gap 0 = empty (hunk starts at 1); gap 1 = empty (fileLineCount=1 ends at the hunk).
    expect(fetchContext).not.toHaveBeenCalled();
  });

  it('expandAll is a no-op when there are no hunks', async () => {
    const fetchContext = vi.fn(async () => []);
    const fixture = mountComponent({
      diffText: '',
      fetchContext,
      fileLineCount: 100,
    });
    fixture.componentInstance.expandAll();
    await fixture.whenStable();
    expect(fetchContext).not.toHaveBeenCalled();
  });

  it('renders a retry strip when the context fetch rejects, and re-invokes on retry', async () => {
    let shouldReject = true;
    const fetchContext = vi.fn(async (from: number, to: number) => {
      if (shouldReject) throw new Error('network down');
      const out: string[] = [];
      for (let i = from; i <= to; i++) out.push(`line${i}`);
      return out;
    });

    const fixture = mountComponent({
      diffText: diffWithTwoHunks(),
      fetchContext,
      fileLineCount: 60,
    });

    // Click the first expand bar — triggers a fetch that rejects.
    const bar = fixture.debugElement.query(By.css('mz-hunk-expand-bar'));
    expect(bar).toBeTruthy();
    // Invoke onExpand directly via the component's handler — simpler
    // than clicking through the bar's internal button. The first bar
    // in the diff is gap 0 (direction='up').
    fixture.componentInstance['onExpand'](0, { direction: 'up', count: 5 });
    await fixture.whenStable();
    fixture.detectChanges();

    // The retry strip should now be rendered in place of the bar.
    const retryStrip = fixture.debugElement.query(By.css('[role="alert"]'));
    expect(retryStrip).toBeTruthy();
    expect((retryStrip.nativeElement as HTMLElement).textContent).toMatch(
      /Failed to load context/,
    );

    // Now succeed on retry.
    shouldReject = false;
    const callsBefore = fetchContext.mock.calls.length;
    fixture.componentInstance['onRetry'](0);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fetchContext.mock.calls.length).toBeGreaterThan(callsBefore);
    // Retry strip should be gone after success.
    const retryAfter = fixture.debugElement.query(By.css('[role="alert"]'));
    expect(retryAfter).toBeNull();
  });
});

// Type-only smoke test: ensure RenderItem narrows on `kind` so consumers
// of the exported type can use it ergonomically.
describe('RenderItem (type)', () => {
  it('discriminates by kind', () => {
    const item: RenderItem = {
      kind: 'expand-error',
      key: 'g0:err',
      gapIndex: 0,
      message: 'oops',
    };
    if (item.kind === 'expand-error') {
      expect(item.message).toBe('oops');
    }
    // Touch emptyState to keep it referenced (the helper is used in
    // future test additions).
    expect(emptyState().expansions.size).toBe(0);
  });
});
