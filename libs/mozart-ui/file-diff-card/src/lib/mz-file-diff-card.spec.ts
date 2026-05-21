import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MzFileDiffCard, type FileDiffStatus } from './mz-file-diff-card';

interface MountOpts {
  readonly path?: string;
  readonly oldPath?: string | null;
  readonly status?: FileDiffStatus;
  readonly additions?: number;
  readonly deletions?: number;
  readonly diffText?: string;
  readonly fetchContext?:
    | ((from: number, to: number) => Promise<readonly string[]>)
    | null;
  readonly fileLineCount?: number | null;
  readonly defaultCollapsed?: boolean;
  readonly active?: boolean;
}

function mount(opts: MountOpts = {}): ComponentFixture<MzFileDiffCard> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection()],
  });
  const fixture = TestBed.createComponent(MzFileDiffCard);
  fixture.componentRef.setInput('path', opts.path ?? 'foo.ts');
  fixture.componentRef.setInput('oldPath', opts.oldPath ?? null);
  fixture.componentRef.setInput('status', opts.status ?? 'modified');
  fixture.componentRef.setInput('additions', opts.additions ?? 0);
  fixture.componentRef.setInput('deletions', opts.deletions ?? 0);
  fixture.componentRef.setInput('diffText', opts.diffText ?? '');
  fixture.componentRef.setInput('fetchContext', opts.fetchContext ?? null);
  fixture.componentRef.setInput('fileLineCount', opts.fileLineCount ?? null);
  fixture.componentRef.setInput(
    'defaultCollapsed',
    opts.defaultCollapsed ?? false,
  );
  fixture.componentRef.setInput('active', opts.active ?? false);
  fixture.detectChanges();
  return fixture;
}

function articleEl(fixture: ComponentFixture<MzFileDiffCard>): HTMLElement {
  return fixture.debugElement.query(By.css('article')).nativeElement;
}

function findBySlot(
  fixture: ComponentFixture<MzFileDiffCard>,
  slot: string,
): HTMLElement | null {
  const node = fixture.debugElement.query(By.css(`[data-slot="${slot}"]`));
  return node ? (node.nativeElement as HTMLElement) : null;
}

const SAMPLE_DIFF = [
  'diff --git a/foo.ts b/foo.ts',
  '--- a/foo.ts',
  '+++ b/foo.ts',
  '@@ -1,1 +1,1 @@',
  '-old',
  '+new',
].join('\n');

describe('MzFileDiffCard — toggle expand/collapse', () => {
  it('defaults to expanded; clicking the chevron collapses and emits true', () => {
    const fixture = mount();
    const card = fixture.componentInstance;
    const emitted: boolean[] = [];
    card.toggleCollapsed.subscribe((v) => emitted.push(v));

    // Body present initially.
    expect(fixture.debugElement.query(By.css('mz-diff-view'))).toBeTruthy();

    const chevron = fixture.debugElement.query(
      By.css('button[aria-label="Collapse file"]'),
    );
    expect(chevron).toBeTruthy();
    chevron.nativeElement.click();
    fixture.detectChanges();

    expect(emitted).toEqual([true]);
    expect(fixture.debugElement.query(By.css('mz-diff-view'))).toBeNull();
    // Aria label flips.
    expect(
      fixture.debugElement.query(By.css('button[aria-label="Expand file"]')),
    ).toBeTruthy();
  });

  it('honors defaultCollapsed=true; clicking the chevron expands and emits false', () => {
    const fixture = mount({ defaultCollapsed: true });
    const card = fixture.componentInstance;
    const emitted: boolean[] = [];
    card.toggleCollapsed.subscribe((v) => emitted.push(v));

    // Body hidden initially.
    expect(fixture.debugElement.query(By.css('mz-diff-view'))).toBeNull();

    const chevron = fixture.debugElement.query(
      By.css('button[aria-label="Expand file"]'),
    );
    chevron.nativeElement.click();
    fixture.detectChanges();

    expect(emitted).toEqual([false]);
    expect(fixture.debugElement.query(By.css('mz-diff-view'))).toBeTruthy();
  });
});

describe('MzFileDiffCard — status branches', () => {
  const diffStatuses: readonly FileDiffStatus[] = [
    'modified',
    'added',
    'deleted',
    'renamed',
  ];

  for (const status of diffStatuses) {
    it(`mounts MzDiffView for status='${status}'`, () => {
      const fixture = mount({
        status,
        oldPath: status === 'renamed' ? 'old.ts' : null,
        diffText: SAMPLE_DIFF,
      });
      expect(fixture.debugElement.query(By.css('mz-diff-view'))).toBeTruthy();
      expect(findBySlot(fixture, 'binary-placeholder')).toBeNull();
      expect(findBySlot(fixture, 'too-large-placeholder')).toBeNull();
      expect(findBySlot(fixture, 'no-diff-placeholder')).toBeNull();
    });
  }

  it('renders the binary placeholder for status=binary', () => {
    const fixture = mount({ status: 'binary' });
    const placeholder = findBySlot(fixture, 'binary-placeholder');
    if (!placeholder) throw new Error('expected binary placeholder');
    expect(placeholder.textContent).toMatch(/Binary file changed/);
    expect(fixture.debugElement.query(By.css('mz-diff-view'))).toBeNull();
  });

  it('renders the too-large placeholder with a Show anyway button that emits', () => {
    const fixture = mount({
      status: 'too-large',
      additions: 5234,
      deletions: 1892,
    });
    const placeholder = findBySlot(fixture, 'too-large-placeholder');
    if (!placeholder) throw new Error('expected too-large placeholder');
    expect(placeholder.textContent).toMatch(/5234 additions, 1892 deletions/);

    const card = fixture.componentInstance;
    let emitted = 0;
    card.showAnyway.subscribe(() => emitted++);

    const showBtn = findBySlot(fixture, 'show-anyway-button');
    if (!showBtn) throw new Error('expected show-anyway button');
    showBtn.click();
    expect(emitted).toBe(1);
  });

  it('renders the no-diff placeholder for status=no-diff', () => {
    const fixture = mount({ status: 'no-diff' });
    const placeholder = findBySlot(fixture, 'no-diff-placeholder');
    if (!placeholder) throw new Error('expected no-diff placeholder');
    expect(placeholder.textContent).toMatch(/No textual changes/);
    expect(fixture.debugElement.query(By.css('mz-diff-view'))).toBeNull();
  });

  it('hides the expand-all button when the body is not a diff', () => {
    const fixture = mount({ status: 'binary' });
    expect(findBySlot(fixture, 'expand-all-button')).toBeNull();
  });

  it('disables expand-all when fetchContext is null but body is diff', () => {
    const fixture = mount({ status: 'modified', diffText: SAMPLE_DIFF });
    const btn = findBySlot(fixture, 'expand-all-button') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    // Disabled because no fetchContext was supplied.
    expect(btn.disabled).toBe(true);
  });
});

describe('MzFileDiffCard — rename display', () => {
  it('renders a rename arrow when status=renamed and oldPath differs', () => {
    const fixture = mount({
      status: 'renamed',
      oldPath: 'src/old/path.ts',
      path: 'src/new/path.ts',
    });
    const header = fixture.debugElement.query(By.css('header'));
    const text = (header.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('src/old/path.ts');
    expect(text).toContain('src/new/path.ts');
    // The arrow icon should be present.
    expect(
      fixture.debugElement.queryAll(By.css('ng-icon[name="lucideArrowRight"]')),
    ).not.toHaveLength(0);
  });

  it('renders a single path when status=renamed but oldPath equals path', () => {
    const fixture = mount({
      status: 'renamed',
      oldPath: 'same.ts',
      path: 'same.ts',
    });
    const arrows = fixture.debugElement.queryAll(
      By.css('ng-icon[name="lucideArrowRight"]'),
    );
    expect(arrows).toHaveLength(0);
  });

  it('renders a single path when status=renamed but oldPath is null', () => {
    const fixture = mount({
      status: 'renamed',
      oldPath: null,
      path: 'only.ts',
    });
    expect(
      fixture.debugElement.queryAll(By.css('ng-icon[name="lucideArrowRight"]')),
    ).toHaveLength(0);
  });
});

describe('MzFileDiffCard — copyPath', () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
  });

  function stubClipboard(impl: (text: string) => Promise<void>): {
    writeText: ReturnType<typeof vi.fn>;
  } {
    const writeText = vi.fn(impl);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
      writable: true,
    });
    return { writeText };
  }

  it('writes the path on click, sets tooltip to Copied!, and emits pathCopy', async () => {
    vi.useFakeTimers();
    try {
      const { writeText } = stubClipboard(() => Promise.resolve());
      const fixture = mount({ path: 'foo.ts' });
      const card = fixture.componentInstance;
      const emitted: string[] = [];
      card.pathCopy.subscribe((p) => emitted.push(p));

      const copyBtn = findBySlot(fixture, 'copy-button') as HTMLButtonElement;
      copyBtn.click();
      // Let the microtask queue (the await navigator.clipboard.writeText)
      // settle without advancing the fake timer.
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      expect(writeText).toHaveBeenCalledWith('foo.ts');
      expect(emitted).toEqual(['foo.ts']);
      expect(copyBtn.getAttribute('aria-label')).toBe('Copied!');

      // After 1500ms the tooltip resets to 'Copy path'.
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
      fixture.detectChanges();
      expect(copyBtn.getAttribute('aria-label')).toBe('Copy path');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports failure: tooltip morphs to Copy failed and (copyError) emits', async () => {
    stubClipboard(() => Promise.reject(new Error('insecure context')));
    const fixture = mount({ path: 'foo.ts' });
    const card = fixture.componentInstance;
    const errors: Error[] = [];
    card.copyError.subscribe((e) => errors.push(e));

    const copyBtn = findBySlot(fixture, 'copy-button') as HTMLButtonElement;
    copyBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('insecure context');
    expect(copyBtn.getAttribute('aria-label')).toBe('Copy failed');
  });

  it('clears the pending reset timer on destroy', async () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      stubClipboard(() => Promise.resolve());
      const fixture = mount({ path: 'foo.ts' });
      const copyBtn = findBySlot(fixture, 'copy-button') as HTMLButtonElement;
      copyBtn.click();
      await Promise.resolve();
      await Promise.resolve();
      fixture.detectChanges();

      // Timer is pending; destroying should clear it.
      const callsBeforeDestroy = clearSpy.mock.calls.length;
      fixture.destroy();
      expect(clearSpy.mock.calls.length).toBeGreaterThan(callsBeforeDestroy);
    } finally {
      clearSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe('MzFileDiffCard — expandAll', () => {
  it('forwards expandAll() to the mounted MzDiffView', async () => {
    const fetchContext = vi.fn(async (from: number, to: number) => {
      const out: string[] = [];
      for (let i = from; i <= to; i++) out.push(`line${i}`);
      return out;
    });
    const fixture = mount({
      status: 'modified',
      diffText: [
        'diff --git a/foo.ts b/foo.ts',
        '--- a/foo.ts',
        '+++ b/foo.ts',
        '@@ -10,3 +10,3 @@',
        ' line10',
        '-old11',
        '+new11',
        ' line12',
      ].join('\n'),
      fetchContext,
      fileLineCount: 30,
    });

    fixture.componentInstance.expandAll();
    await fixture.whenStable();
    // The diff has 2 gaps (1-9 and 13-30), both with hidden lines.
    expect(fetchContext).toHaveBeenCalledTimes(2);
  });

  it('is a no-op when viewChild is absent (status=binary)', () => {
    const fetchContext = vi.fn(async () => []);
    const fixture = mount({ status: 'binary', fetchContext });
    // Should not throw — no MzDiffView is mounted.
    expect(() => fixture.componentInstance.expandAll()).not.toThrow();
    expect(fetchContext).not.toHaveBeenCalled();
  });
});

describe('MzFileDiffCard — active state', () => {
  it('applies the ring accent classes when active=true', () => {
    const fixture = mount({ active: true });
    const article = articleEl(fixture);
    expect(article.classList).toContain('ring-2');
  });

  it('omits the ring accent classes when active=false', () => {
    const fixture = mount({ active: false });
    const article = articleEl(fixture);
    expect(article.classList).not.toContain('ring-2');
  });
});

describe('MzFileDiffCard — refresh output', () => {
  it('emits refresh when the refresh button is clicked', () => {
    const fixture = mount();
    const card = fixture.componentInstance;
    let count = 0;
    card.refresh.subscribe(() => count++);

    const btn = findBySlot(fixture, 'refresh-button') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.click();
    expect(count).toBe(1);
  });
});
