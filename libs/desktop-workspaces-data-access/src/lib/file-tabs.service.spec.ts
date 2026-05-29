import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FileTabsService } from './file-tabs.service';

// FileTabsService is now pure orchestration over SessionStore +
// router. No localStorage interactions; the freeze-loop regression at
// the persist-mirror layer is gone with the mirror itself. Active-tab
// state is derived from the router URL — assertions that need it should
// drive the router. Most tests below assert the open list / preview
// slot lifecycle, which doesn't depend on routing.

const wsA = 'workspace-a';
const projectA = 'project-a';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  return TestBed.inject(FileTabsService);
}

function setupWithRouterMock() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      {
        provide: Router,
        useValue: { navigate: vi.fn().mockResolvedValue(true) },
      },
    ],
  });
  return {
    svc: TestBed.inject(FileTabsService),
    router: TestBed.inject(Router),
  };
}

beforeEach(() => {
  window.localStorage.removeItem('mozart-last-url-v1');
});

describe('FileTabsService — preview / pin model', () => {
  it('previewForPath opens a new tab with preview state', () => {
    const svc = setup();
    svc.previewForPath(wsA, 'src/a.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(true);
  });

  it('previewForPath replaces the existing preview slot (one preview per workspace)', () => {
    const svc = setup();
    svc.previewForPath(wsA, 'src/a.ts');
    svc.previewForPath(wsA, 'src/b.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/b.ts']);
    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
    expect(svc.isPreviewFor(wsA, 'src/b.ts')).toBe(true);
  });

  it('previewForPath reuses an existing tab instead of opening a second', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.pinForPath(wsA, 'src/b.ts');
    // No active file tab + no preview slot → reuse the last open tab.
    svc.previewForPath(wsA, 'src/c.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts', 'src/c.ts']);
    expect(svc.isPreviewFor(wsA, 'src/c.ts')).toBe(true);
  });

  it('previewForPath on an already-pinned path is a no-op', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.previewForPath(wsA, 'src/a.ts');

    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
  });

  it('pinForPath opens a new tab when not yet open', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
  });

  it('pinForPath promotes an existing preview to pinned (flips italic)', () => {
    const svc = setup();
    svc.previewForPath(wsA, 'src/a.ts');
    svc.pinForPath(wsA, 'src/a.ts');

    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
  });

  it('pinForPath on already-pinned is a no-op', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.pinForPath(wsA, 'src/b.ts');
    svc.pinForPath(wsA, 'src/a.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts', 'src/b.ts']);
  });
});

describe('FileTabsService — no cap (R3)', () => {
  it('R3: opening a second pinned tab does NOT evict the first', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.pinForPath(wsA, 'src/b.ts');
    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('opens many tabs without eviction', () => {
    const svc = setup();
    for (let i = 0; i < 10; i++) {
      svc.pinForPath(wsA, `src/file-${i}.ts`);
    }
    expect(svc.forWorkspace(wsA)()).toHaveLength(10);
  });
});

describe('FileTabsService — closeFor', () => {
  it('removes the closed path and returns the neighbour to navigate to', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.pinForPath(wsA, 'src/b.ts');
    svc.pinForPath(wsA, 'src/c.ts');

    const next = svc.closeFor(wsA, 'src/b.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts', 'src/c.ts']);
    expect(next).toBe('src/a.ts');
  });

  it('clears the preview slot when the closing tab was the preview', () => {
    const svc = setup();
    // Preview first, then pin a DIFFERENT file: single-click reuses the
    // sole open tab, so a preview + pinned pair only forms when the
    // preview exists before the pin appends alongside it.
    svc.previewForPath(wsA, 'src/preview.ts');
    svc.pinForPath(wsA, 'src/pinned.ts');
    expect(svc.isPreviewFor(wsA, 'src/preview.ts')).toBe(true);

    svc.closeFor(wsA, 'src/preview.ts');

    expect(svc.previewFor(wsA)()).toBeNull();
    expect(svc.forWorkspace(wsA)()).toEqual(['src/pinned.ts']);
  });

  it('is idempotent on a path that is not open', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    const next = svc.closeFor(wsA, 'src/does-not-exist.ts');
    expect(next).toBeNull();
    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
  });

  it('returns null neighbour when the workspace had only one tab', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    const next = svc.closeFor(wsA, 'src/a.ts');

    expect(svc.forWorkspace(wsA)()).toEqual([]);
    expect(next).toBeNull();
  });
});

describe('FileTabsService — freshly constructed', () => {
  it('has no open tabs for any workspace', () => {
    const svc = setup();
    expect(svc.forWorkspace(wsA)()).toEqual([]);
    expect(svc.previewFor(wsA)()).toBeNull();
    expect(svc.activeFor(wsA)()).toBeNull();
  });
});

describe('FileTabsService — findTab', () => {
  it('returns null for an unopened path', () => {
    const svc = setup();
    expect(svc.findTab(wsA, 'src/missing.ts')).toBeNull();
  });

  it('returns a FileTab with isPreview=true for an open preview', () => {
    const svc = setup();
    svc.previewForPath(wsA, 'src/a.ts');

    const tab = svc.findTab(wsA, 'src/a.ts');
    expect(tab?.kind).toBe('file');
    expect(tab?.isPreview).toBe(true);
    expect(tab?.title).toBe('a.ts');
  });

  it('returns a FileTab with isPreview=false for a pinned tab', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');

    const tab = svc.findTab(wsA, 'src/a.ts');
    expect(tab?.isPreview).toBe(false);
  });
});

describe('FileTabsService — navigateToFileTab', () => {
  it('passes state={intent:preview} + replaceUrl=true for preview navigations', async () => {
    const { svc, router } = setupWithRouterMock();

    await svc.navigateToFileTab({
      projectId: projectA,
      workspaceId: wsA,
      path: 'src/a.ts',
      intent: 'preview',
      mode: 'edit',
      source: 'all-files',
    });

    expect(router.navigate).toHaveBeenCalled();
    const callArgs = vi.mocked(router.navigate).mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      state: { intent: 'preview' },
      replaceUrl: true,
    });
  });

  it('omits state and replaceUrl=false for pin navigations', async () => {
    const { svc, router } = setupWithRouterMock();

    await svc.navigateToFileTab({
      projectId: projectA,
      workspaceId: wsA,
      path: 'src/a.ts',
      intent: 'pin',
      mode: 'edit',
      source: 'all-files',
    });

    const callArgs = vi.mocked(router.navigate).mock.calls[0];
    expect(callArgs[1]).toMatchObject({
      state: undefined,
      replaceUrl: false,
    });
  });

  // Eager mutation: covers the regression where the router's default
  // `onSameUrlNavigation: 'ignore'` silently drops re-clicks. The
  // service applies preview/pin BEFORE router.navigate so the click
  // handler is the source of truth.
  it('eagerly opens a preview tab even when router.navigate is a same-URL no-op', async () => {
    const { svc, router } = setupWithRouterMock();
    vi.mocked(router.navigate).mockResolvedValue(false);

    await svc.navigateToFileTab({
      projectId: projectA,
      workspaceId: wsA,
      path: 'src/a.ts',
      intent: 'preview',
      mode: 'edit',
      source: 'all-files',
    });

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(true);
  });

  it('eagerly promotes preview → pinned when a dblclick navigates to an already-open path', async () => {
    const { svc, router } = setupWithRouterMock();
    // Simulate Angular's default same-URL behavior — second nav resolves
    // false (route ignored) — to prove the pin still happens locally.
    vi.mocked(router.navigate).mockResolvedValueOnce(true);
    vi.mocked(router.navigate).mockResolvedValueOnce(false);

    await svc.navigateToFileTab({
      projectId: projectA,
      workspaceId: wsA,
      path: 'src/a.ts',
      intent: 'preview',
      mode: 'edit',
      source: 'all-files',
    });
    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(true);

    await svc.navigateToFileTab({
      projectId: projectA,
      workspaceId: wsA,
      path: 'src/a.ts',
      intent: 'pin',
      mode: 'edit',
      source: 'all-files',
    });

    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
  });

  it('eagerly reuses an already-open tab on re-click (no duplicate entries)', async () => {
    const { svc, router } = setupWithRouterMock();
    vi.mocked(router.navigate).mockResolvedValue(true);

    await svc.navigateToFileTab({
      projectId: projectA,
      workspaceId: wsA,
      path: 'src/a.ts',
      intent: 'pin',
      mode: 'edit',
      source: 'all-files',
    });
    await svc.navigateToFileTab({
      projectId: projectA,
      workspaceId: wsA,
      path: 'src/a.ts',
      intent: 'preview',
      mode: 'edit',
      source: 'all-files',
    });

    // Already pinned → preview is a no-op for the list AND the slot.
    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
  });
});
