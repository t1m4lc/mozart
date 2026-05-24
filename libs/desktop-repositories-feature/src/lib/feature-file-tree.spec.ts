import { signal, type WritableSignal } from '@angular/core';
import {
  DeferBlockState,
  TestBed,
  type ComponentFixture,
} from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, vi } from 'vitest';
import type { FileNode } from '@mozart/desktop-repositories-util';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import { FeatureFileTree } from './feature-file-tree';

// Regression suite for `FeatureFileTree.showSkeleton` after the
// defer-first-show 150ms gate landed. The skeleton lives inside a
// `@defer (on immediate)` block with `@placeholder (minimum 150ms)`,
// so the only thing the JS layer controls is whether the outer
// `@if (showSkeleton())` branch enters at all — Angular's @defer
// machinery owns the 150ms timing.
//
// Critical invariant: when EITHER cache (own or sibling) has the
// tree, the @defer block must never enter the DOM. Otherwise a
// cache hit could eventually flash the skeleton once the minimum
// elapses.
//
// Skeleton shape + a11y assertions are folded in here since
// `desktop-repositories-ui` has no test infra (no `desktop-*-ui`
// lib does — project convention).

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
  // A never-resolving promise keeps `loading` true so showSkeleton
  // stays true through the assertions. Cache-hit tests bypass this
  // by populating one of the caches up front.
  const loadTree = vi.fn(
    (): Promise<readonly FileNode[]> =>
      new Promise<readonly FileNode[]>(() => undefined),
  );
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

async function mount(
  repos: Partial<RepositoriesFacade>,
  uiState: Partial<UiStateFacade>,
): Promise<ComponentFixture<FeatureFileTree>> {
  // `compileComponents()` is required by `@defer` blocks; without
  // it TestBed throws "Component has unresolved metadata."
  await TestBed.configureTestingModule({
    imports: [FeatureFileTree],
    providers: [
      { provide: RepositoriesFacade, useValue: repos },
      { provide: UiStateFacade, useValue: uiState },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(FeatureFileTree);
  fixture.componentRef.setInput('workspaceId', 'ws-1');
  fixture.componentRef.setInput('projectId', 'proj-1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

function querySkeleton(
  fixture: ComponentFixture<unknown>,
): HTMLElement | null {
  const de = fixture.debugElement.query(By.css('app-file-tree-skeleton'));
  return de ? (de.nativeElement as HTMLElement) : null;
}

function queryStatusWrapper(
  fixture: ComponentFixture<unknown>,
): HTMLElement | null {
  const de = fixture.debugElement.query(By.css('[role="status"]'));
  return de ? (de.nativeElement as HTMLElement) : null;
}

describe('FeatureFileTree — showSkeleton + @defer skeleton gate', () => {
  describe('cache-hit short-circuit (CRITICAL regression)', () => {
    it('renders no defer block when own cache has the tree', async () => {
      const { repos, uiState, handles } = makeFacades();
      handles.cached.set([FOLDER_NODE]);
      const fixture = await mount(repos, uiState);

      // No skeleton can ever appear because the outer @if never enters.
      expect(querySkeleton(fixture)).toBeNull();
      expect(await fixture.getDeferBlocks()).toHaveLength(0);
      expect(handles.loadTree).not.toHaveBeenCalled();
    });

    it('renders no defer block when sibling fallback has the tree', async () => {
      const { repos, uiState, handles } = makeFacades();
      handles.fallback.set([FOLDER_NODE]);
      const fixture = await mount(repos, uiState);

      expect(querySkeleton(fixture)).toBeNull();
      expect(await fixture.getDeferBlocks()).toHaveLength(0);
    });

    it('tears the defer block down when a cache lands mid-flight', async () => {
      const { repos, uiState, handles } = makeFacades();
      const fixture = await mount(repos, uiState);

      // Both caches empty + loadTree pending → defer block is mounted
      // (placeholder visible, skeleton not yet rendered).
      expect(await fixture.getDeferBlocks()).toHaveLength(1);
      expect(querySkeleton(fixture)).toBeNull();

      // Sibling cache lands → outer @if flips false → defer block
      // disappears entirely, taking the placeholder with it.
      handles.fallback.set([FOLDER_NODE]);
      fixture.detectChanges();
      expect(await fixture.getDeferBlocks()).toHaveLength(0);
      expect(querySkeleton(fixture)).toBeNull();
    });
  });

  describe('skeleton path (no caches, loading in flight)', () => {
    it('mounts a single defer block with the placeholder visible and the busy wrapper announced', async () => {
      const { repos, uiState } = makeFacades();
      const fixture = await mount(repos, uiState);

      const blocks = await fixture.getDeferBlocks();
      expect(blocks).toHaveLength(1);
      // Before the 150ms minimum elapses, the skeleton is NOT in the
      // DOM — only the placeholder template is. The busy wrapper IS
      // present, so SR users on fast fetches still hear the loading
      // signal (this is the bug move-aria-to-wrapper fixed).
      expect(querySkeleton(fixture)).toBeNull();
      const status = queryStatusWrapper(fixture);
      expect(status).not.toBeNull();
      expect(status?.getAttribute('aria-busy')).toBe('true');
    });

    it('keeps the skeleton hidden if Complete fires before the 150ms minimum', async () => {
      vi.useFakeTimers();
      try {
        const { repos, uiState } = makeFacades();
        const fixture = await mount(repos, uiState);

        // Force Complete BEFORE the 150ms minimum. The placeholder's
        // `minimum 150ms` must hold the skeleton out of the DOM.
        // Regression guard: if the `minimum 150ms` is ever removed
        // from the template, this test fails because the skeleton
        // appears at 50ms instead of being held back.
        vi.advanceTimersByTime(50);
        for (const block of await fixture.getDeferBlocks()) {
          await block.render(DeferBlockState.Complete);
        }
        await fixture.whenStable();
        fixture.detectChanges();

        expect(querySkeleton(fixture)).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('renders the tree-shaped skeleton once the defer reaches Complete after the minimum', async () => {
      vi.useFakeTimers();
      try {
        const { repos, uiState } = makeFacades();
        const fixture = await mount(repos, uiState);

        // The @placeholder (minimum 150ms) gates the Complete
        // transition. Advance past the minimum AND request Complete
        // — jsdom does not run Angular's defer timing scheduler on
        // its own, so we need both halves.
        vi.advanceTimersByTime(200);
        for (const block of await fixture.getDeferBlocks()) {
          await block.render(DeferBlockState.Complete);
        }
        await fixture.whenStable();
        fixture.detectChanges();

        expect(querySkeleton(fixture)).not.toBeNull();
        // a11y attrs live on the outer wrapper, not the skeleton host.
        const status = queryStatusWrapper(fixture);
        expect(status?.getAttribute('aria-busy')).toBe('true');

        const skeletonDe = fixture.debugElement.query(
          By.css('app-file-tree-skeleton'),
        );
        expect(
          skeletonDe.queryAll(By.css('ng-icon[name="lucideChevronRight"]'))
            .length,
        ).toBe(3);
        expect(
          skeletonDe.queryAll(By.css('ng-icon[name="lucideFolder"]')).length,
        ).toBe(3);
        expect(
          skeletonDe.queryAll(By.css('ng-icon[name="lucideFile"]')).length,
        ).toBe(6);
        expect(skeletonDe.queryAll(By.css('hlm-skeleton')).length).toBe(9);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
