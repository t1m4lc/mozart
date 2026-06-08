import {
  DeferBlockState,
  TestBed,
  type ComponentFixture,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTheme } from '@mozart/shared-util-theme';
import { MzFileDiffCard } from '@mozart-ui/file-diff-card';
import { describe, expect, it, vi } from 'vitest';
import {
  FileViewsFacade,
  RepositoriesFacade,
} from '@mozart/desktop-repositories-data-access';
import { FeatureFileDiff } from './feature-file-diff';

// jsdom doesn't implement matchMedia; ThemeService (injected by
// MzDiffView for CodeMirror theme sync) calls it during construction.
// Stub once before any TestBed mount.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// jsdom doesn't implement IntersectionObserver; Angular uses it for
// @defer (on viewport) — the template defers CodeMirror loading this way.
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  (window as Window & typeof globalThis).IntersectionObserver = class {
    observe() { return undefined; }
    unobserve() { return undefined; }
    disconnect() { return undefined; }
  } as unknown as typeof IntersectionObserver;
}

// Regression suite for the FeatureFileDiff host. Verifies diff
// fetching, per-path context-line cache, stale-response discipline,
// and copy-output forwarding through MzFileDiffCard.

interface FacadeStub {
  loadFileDiff: ReturnType<typeof vi.fn>;
  loadFile: ReturnType<typeof vi.fn>;
}

interface FileViewsFacadeStub {
  entryFor: ReturnType<typeof vi.fn>;
  markViewed: ReturnType<typeof vi.fn>;
  clearViewed: ReturnType<typeof vi.fn>;
}

function makeFileViewsFacade(): FileViewsFacadeStub {
  return {
    entryFor: vi.fn(() => undefined),
    markViewed: vi.fn(() => Promise.resolve()),
    clearViewed: vi.fn(() => Promise.resolve()),
  };
}

interface FacadeOpts {
  readonly diff?: string | ((ws: string, p: string) => string | Promise<string>);
  readonly file?: string | ((ws: string, p: string) => string | Promise<string>);
}

function makeFacade(opts: FacadeOpts = {}): FacadeStub {
  return {
    loadFileDiff: vi.fn(async (ws: string, p: string) => {
      if (typeof opts.diff === 'function') return opts.diff(ws, p);
      return opts.diff ?? '';
    }),
    loadFile: vi.fn(async (ws: string, p: string) => {
      if (typeof opts.file === 'function') return opts.file(ws, p);
      return opts.file ?? '';
    }),
  };
}

interface MountOpts {
  readonly workspaceId?: string | null;
  readonly path?: string | null;
  readonly refreshTick?: number;
}

async function mountWith(
  facade: FacadeStub,
  opts: MountOpts = {},
  fileViews: FileViewsFacadeStub = makeFileViewsFacade(),
): Promise<ComponentFixture<FeatureFileDiff>> {
  await TestBed.configureTestingModule({
    imports: [FeatureFileDiff],
    providers: [
      { provide: RepositoriesFacade, useValue: facade },
      { provide: FileViewsFacade, useValue: fileViews },
      provideTheme(),
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(FeatureFileDiff);
  fixture.componentRef.setInput('workspaceId', opts.workspaceId ?? 'ws1');
  fixture.componentRef.setInput('path', opts.path ?? 'foo.ts');
  fixture.componentRef.setInput('refreshTick', opts.refreshTick ?? 0);
  fixture.detectChanges();
  return fixture;
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  // @defer (on viewport) wraps <mz-file-diff-card> in production for bundle
  // size. jsdom never fires viewport triggers, so render every pending
  // defer block to Complete so the tests see the real card.
  for (const block of await fixture.getDeferBlocks()) {
    await block.render(DeferBlockState.Complete);
  }
  await fixture.whenStable();
}

function getCard(fixture: ComponentFixture<unknown>): MzFileDiffCard | null {
  const de = fixture.debugElement.query(By.directive(MzFileDiffCard));
  return de ? (de.componentInstance as MzFileDiffCard) : null;
}

describe('FeatureFileDiff — rendering', () => {
  it('renders the file-diff card for markdown paths', async () => {
    const fixture = await mountWith(makeFacade(), { path: 'README.md' });
    await settle(fixture);
    expect(fixture.debugElement.query(By.css('mz-file-diff-card'))).toBeTruthy();
  });

  it('renders the file-diff card for non-markdown paths', async () => {
    const fixture = await mountWith(makeFacade(), { path: 'src/foo.ts' });
    await settle(fixture);
    expect(fixture.debugElement.query(By.css('mz-file-diff-card'))).toBeTruthy();
  });

  it('passes chrome=flush + collapsible=false + pathTruncate=start to the card', async () => {
    const fixture = await mountWith(makeFacade(), { path: 'src/foo.ts' });
    await settle(fixture);
    const card = getCard(fixture);
    if (!card) throw new Error('expected card');
    expect(card.chrome()).toBe('flush');
    expect(card.collapsible()).toBe(false);
    expect(card.pathTruncate()).toBe('start');
  });

  it('forwards the status input to the card', async () => {
    const fixture = await mountWith(makeFacade(), { path: 'src/foo.ts' });
    fixture.componentRef.setInput('status', 'added');
    await settle(fixture);
    const card = getCard(fixture);
    if (!card) throw new Error('expected card');
    expect(card.status()).toBe('added');
  });

  it('wires viewedChange to FileViewsFacade.markViewed / clearViewed', async () => {
    const fileViews = makeFileViewsFacade();
    const fixture = await mountWith(
      makeFacade(),
      { workspaceId: 'ws', path: 'src/foo.ts' },
      fileViews,
    );
    await settle(fixture);

    const card = getCard(fixture);
    if (!card) throw new Error('expected card');

    card.viewedChange.emit(true);
    expect(fileViews.markViewed).toHaveBeenCalledWith('ws', 'src/foo.ts');
    expect(fileViews.clearViewed).not.toHaveBeenCalled();

    card.viewedChange.emit(false);
    expect(fileViews.clearViewed).toHaveBeenCalledWith('ws', 'src/foo.ts');
  });
});

describe('FeatureFileDiff — diff fetch lifecycle', () => {
  it('fetches the diff on workspaceId / path / refreshTick change', async () => {
    const facade = makeFacade({ diff: (ws, p) => `DIFF<${ws}|${p}>` });
    const fixture = await mountWith(facade, { workspaceId: 'wsA', path: 'a.ts' });
    await settle(fixture);
    expect(facade.loadFileDiff).toHaveBeenCalledWith('wsA', 'a.ts');

    fixture.componentRef.setInput('path', 'b.ts');
    fixture.detectChanges();
    await settle(fixture);
    expect(facade.loadFileDiff).toHaveBeenCalledWith('wsA', 'b.ts');

    fixture.componentRef.setInput('workspaceId', 'wsB');
    fixture.detectChanges();
    await settle(fixture);
    expect(facade.loadFileDiff).toHaveBeenCalledWith('wsB', 'b.ts');

    fixture.componentRef.setInput('refreshTick', 1);
    fixture.detectChanges();
    await settle(fixture);
    // 4th call: same ws + path, tick bumped — still re-fetches.
    expect(facade.loadFileDiff).toHaveBeenCalledTimes(4);
  });

  it('discards stale diff responses (out-of-order resolution)', async () => {
    let resolveFirst!: (text: string) => void;
    const firstPending = new Promise<string>((r) => {
      resolveFirst = r;
    });
    let callIndex = 0;
    const facade: FacadeStub = {
      loadFileDiff: vi.fn(() => {
        callIndex++;
        if (callIndex === 1) return firstPending;
        return Promise.resolve('SECOND');
      }),
      loadFile: vi.fn(),
    };

    const fixture = await mountWith(facade, { workspaceId: 'ws', path: 'a.ts' });
    // First fetch in flight (firstPending never settles yet).

    fixture.componentRef.setInput('path', 'b.ts');
    fixture.detectChanges();
    await settle(fixture);
    // Second fetch settled with 'SECOND'.

    const card = getCard(fixture);
    if (!card) throw new Error('expected card');
    expect(card.diffText()).toBe('SECOND');

    // Late resolution of the stale first call must NOT overwrite.
    resolveFirst('FIRST');
    await settle(fixture);
    expect(card.diffText()).toBe('SECOND');
  });
});

describe('FeatureFileDiff — fetchContext + file-body cache', () => {
  it('slices the requested 1-based range from the loaded file body', async () => {
    const facade = makeFacade({ file: 'line1\nline2\nline3\nline4\nline5' });
    const fixture = await mountWith(facade, { workspaceId: 'ws', path: 'a.ts' });
    await settle(fixture);

    const card = getCard(fixture);
    if (!card) throw new Error('expected card');
    const callback = card.fetchContext();
    if (!callback) throw new Error('expected fetchContext callback');

    const lines = await callback(2, 4);
    expect(lines).toEqual(['line2', 'line3', 'line4']);
    expect(facade.loadFile).toHaveBeenCalledTimes(1);
  });

  it('caches the body across context fetches and invalidates on refreshTick', async () => {
    const facade = makeFacade({ file: 'l1\nl2\nl3\nl4\nl5' });
    const fixture = await mountWith(facade, { workspaceId: 'ws', path: 'a.ts' });
    await settle(fixture);

    const card = getCard(fixture);
    if (!card) throw new Error('expected card');
    const callbackBefore = card.fetchContext();
    if (!callbackBefore) throw new Error('expected callback');

    await callbackBefore(1, 2);
    await callbackBefore(3, 4);
    expect(facade.loadFile).toHaveBeenCalledTimes(1);

    fixture.componentRef.setInput('refreshTick', 1);
    fixture.detectChanges();
    await settle(fixture);

    const cardAfter = getCard(fixture);
    if (!cardAfter) throw new Error('expected card after tick');
    const callbackAfter = cardAfter.fetchContext();
    if (!callbackAfter) throw new Error('expected callback after tick');

    await callbackAfter(1, 2);
    expect(facade.loadFile).toHaveBeenCalledTimes(2);
  });
});

describe('FeatureFileDiff — output forwarding', () => {
  it('re-emits (pathCopy) from the card to the host', async () => {
    const fixture = await mountWith(makeFacade(), { workspaceId: 'ws', path: 'a.ts' });
    await settle(fixture);

    const card = getCard(fixture);
    if (!card) throw new Error('expected card');

    const emitted: string[] = [];
    fixture.componentInstance.pathCopy.subscribe((p) => emitted.push(p));

    card.pathCopy.emit('a.ts');
    expect(emitted).toEqual(['a.ts']);
  });

  it('re-emits (copyError) from the card to the host', async () => {
    const fixture = await mountWith(makeFacade(), { workspaceId: 'ws', path: 'a.ts' });
    await settle(fixture);

    const card = getCard(fixture);
    if (!card) throw new Error('expected card');

    const errors: Error[] = [];
    fixture.componentInstance.copyError.subscribe((e) => errors.push(e));

    const err = new Error('clipboard denied');
    card.copyError.emit(err);
    expect(errors).toEqual([err]);
  });
});
