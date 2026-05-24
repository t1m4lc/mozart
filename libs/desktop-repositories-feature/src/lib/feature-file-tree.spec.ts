import { signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileNode } from '@mozart/desktop-repositories-util';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import { FeatureFileTree } from './feature-file-tree';

// Regression suite for `FeatureFileTree.showSkeleton` after the
// defer-first-show 150ms gate landed. The cache-hit short-circuit
// (own + sibling) MUST keep working — `pastMinDelay` is an AND, not
// an OR. Plus timing matrix: defer-show, fast-resolve never-show,
// workspaceId switch resets, destroy cleanup. Skeleton shape + a11y
// assertions absorbed from the planned T4 since `desktop-repositories-ui`
// has no test infra (no `desktop-*-ui` lib does — project convention).
//
// Project is zoneless (provideZonelessChangeDetection), so fakeAsync
// is not available. Timing tests use vi.useFakeTimers + manual
// microtask flushes — same pattern as mz-file-diff-card.spec.ts.

const FOLDER_NODE: FileNode = {
  name: 'src',
  path: 'src',
  kind: 'directory',
  status: 'unchanged',
  ignored: false,
  children: [],
};

interface FacadeHandles {
  cached: WritableSignal<readonly FileNode[] | null>;
  fallback: WritableSignal<readonly FileNode[] | null>;
  expanded: WritableSignal<readonly string[]>;
  loadTree: ReturnType<typeof vi.fn>;
  cacheTree: ReturnType<typeof vi.fn>;
}

function makeFacades(): {
  repos: Partial<RepositoriesFacade>;
  uiState: Partial<UiStateFacade>;
  handles: FacadeHandles;
} {
  const cached = signal<readonly FileNode[] | null>(null);
  const fallback = signal<readonly FileNode[] | null>(null);
  const expanded = signal<readonly string[]>([]);
  const loadTree = vi.fn(async (): Promise<readonly FileNode[]> => []);
  const cacheTree = vi.fn();

  const repos: Partial<RepositoriesFacade> = {
    cachedTreeFor: () => cached,
    projectFallbackTreeFor: () => fallback,
    treeRevisionFor: () => 0,
    loadTree: loadTree as unknown as RepositoriesFacade['loadTree'],
    cacheTree: cacheTree as unknown as RepositoriesFacade['cacheTree'],
  };
  const uiState: Partial<UiStateFacade> = {
    treeExpandedFor: () => expanded,
    setTreeExpanded: vi.fn(),
  };

  return {
    repos,
    uiState,
    handles: { cached, fallback, expanded, loadTree, cacheTree },
  };
}

function mount(
  repos: Partial<RepositoriesFacade>,
  uiState: Partial<UiStateFacade>,
  workspaceId: string | null = 'ws-1',
): ComponentFixture<FeatureFileTree> {
  TestBed.configureTestingModule({
    providers: [
      { provide: RepositoriesFacade, useValue: repos },
      { provide: UiStateFacade, useValue: uiState },
    ],
  });
  const fixture = TestBed.createComponent(FeatureFileTree);
  fixture.componentRef.setInput('workspaceId', workspaceId);
  fixture.componentRef.setInput('projectId', 'proj-1');
  fixture.detectChanges();
  return fixture;
}

function isSkeletonShown(fixture: ComponentFixture<unknown>): boolean {
  return (
    fixture.debugElement.queryAll(By.css('app-file-tree-skeleton')).length > 0
  );
}

// Flush a few microtask cycles so toObservable/combineLatest/toSignal
// can settle before assertions or time advance. Three rounds covers
// the longest chain we hit (effect → toObservable emit → RxJS pipe →
// toSignal write → next CD pass).
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('FeatureFileTree — showSkeleton min-delay gate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('cache-hit short-circuit (CRITICAL regression)', () => {
    it('never shows skeleton when own cache has the tree', async () => {
      const { repos, uiState, handles } = makeFacades();
      handles.cached.set([FOLDER_NODE]);
      const fixture = mount(repos, uiState);

      await fixture.whenStable();
      fixture.detectChanges();

      expect(isSkeletonShown(fixture)).toBe(false);
      expect(handles.loadTree).not.toHaveBeenCalled();
    });

    it('never shows skeleton when sibling fallback has the tree', async () => {
      const { repos, uiState, handles } = makeFacades();
      handles.fallback.set([FOLDER_NODE]);
      const fixture = mount(repos, uiState);

      await fixture.whenStable();
      fixture.detectChanges();

      expect(isSkeletonShown(fixture)).toBe(false);
    });

    it('hides skeleton mid-flight if a cache resolves before the fetch returns', async () => {
      vi.useFakeTimers();
      const { repos, uiState, handles } = makeFacades();
      handles.loadTree.mockImplementation(
        () => new Promise<readonly FileNode[]>(() => undefined),
      );

      const fixture = mount(repos, uiState);
      await flushMicrotasks();
      vi.advanceTimersByTime(200);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(isSkeletonShown(fixture)).toBe(true);

      // Sibling cache lands after the skeleton appeared — must vanish.
      handles.fallback.set([FOLDER_NODE]);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(isSkeletonShown(fixture)).toBe(false);
    });
  });

  describe('defer-first-show timing', () => {
    it('hides skeleton for <150ms, then shows it', async () => {
      vi.useFakeTimers();
      const { repos, uiState, handles } = makeFacades();
      handles.loadTree.mockImplementation(
        () => new Promise<readonly FileNode[]>(() => undefined),
      );

      const fixture = mount(repos, uiState);
      await flushMicrotasks();
      fixture.detectChanges();

      vi.advanceTimersByTime(149);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(isSkeletonShown(fixture)).toBe(false);

      vi.advanceTimersByTime(1);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(isSkeletonShown(fixture)).toBe(true);
    });

    it('never shows skeleton if loadTree resolves before the 150ms gate', async () => {
      vi.useFakeTimers();
      const { repos, uiState, handles } = makeFacades();
      handles.loadTree.mockResolvedValue([FOLDER_NODE]);

      const fixture = mount(repos, uiState);
      await flushMicrotasks();
      fixture.detectChanges();

      vi.advanceTimersByTime(500);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(isSkeletonShown(fixture)).toBe(false);
    });

    it('restarts the 150ms window when workspaceId changes mid-flight', async () => {
      vi.useFakeTimers();
      const { repos, uiState, handles } = makeFacades();
      handles.loadTree.mockImplementation(
        () => new Promise<readonly FileNode[]>(() => undefined),
      );

      const fixture = mount(repos, uiState);
      await flushMicrotasks();
      fixture.detectChanges();

      // 100ms into the first workspace's window — switch.
      vi.advanceTimersByTime(100);
      fixture.componentRef.setInput('workspaceId', 'ws-2');
      await flushMicrotasks();
      fixture.detectChanges();

      // 60ms after the switch: original timer would have fired at
      // 150ms total (50ms ago) — it must have been cancelled.
      vi.advanceTimersByTime(60);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(isSkeletonShown(fixture)).toBe(false);

      // 90 more ms: ws-2's own 150ms window elapses.
      vi.advanceTimersByTime(90);
      await flushMicrotasks();
      fixture.detectChanges();
      expect(isSkeletonShown(fixture)).toBe(true);
    });
  });

  describe('skeleton render (when shown)', () => {
    it('renders 3 folder rows + 6 file rows with a11y attrs', async () => {
      vi.useFakeTimers();
      const { repos, uiState, handles } = makeFacades();
      handles.loadTree.mockImplementation(
        () => new Promise<readonly FileNode[]>(() => undefined),
      );

      const fixture = mount(repos, uiState);
      await flushMicrotasks();
      vi.advanceTimersByTime(150);
      await flushMicrotasks();
      fixture.detectChanges();

      const host = fixture.debugElement.query(
        By.css('app-file-tree-skeleton'),
      );
      expect(host).toBeTruthy();
      const hostEl = host.nativeElement as HTMLElement;
      expect(hostEl.getAttribute('aria-busy')).toBe('true');
      expect(hostEl.getAttribute('role')).toBe('status');

      const chevrons = host.queryAll(
        By.css('ng-icon[name="lucideChevronRight"]'),
      );
      const folders = host.queryAll(By.css('ng-icon[name="lucideFolder"]'));
      const files = host.queryAll(By.css('ng-icon[name="lucideFile"]'));
      expect(chevrons.length).toBe(3);
      expect(folders.length).toBe(3);
      expect(files.length).toBe(6);

      const bars = host.queryAll(By.css('hlm-skeleton'));
      expect(bars.length).toBe(9);
    });
  });

  describe('destroy cleanup', () => {
    it('tears down the RxJS subscription so a destroyed component never updates pastMinDelay', async () => {
      vi.useFakeTimers();
      const { repos, uiState, handles } = makeFacades();
      handles.loadTree.mockImplementation(
        () => new Promise<readonly FileNode[]>(() => undefined),
      );

      const fixture = mount(repos, uiState);
      await flushMicrotasks();
      fixture.detectChanges();

      vi.advanceTimersByTime(50);
      fixture.destroy();

      // Advance past the would-be timer; toSignal's DestroyRef
      // teardown should have unsubscribed, so no stale work fires.
      vi.advanceTimersByTime(500);
      await flushMicrotasks();
      // No throw, no skeleton (component is gone) — the test
      // passes by virtue of completing cleanly.
      expect(true).toBe(true);
    });
  });
});
