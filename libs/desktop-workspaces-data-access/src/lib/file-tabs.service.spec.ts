import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { FileTabsService } from './file-tabs.service';

// File-tab lifecycle service. Covers the preview/pin idiom (D-r1 / D-r5),
// R3 no-eviction regression (cap removal), close + side-effect cleanup,
// findTab helper, and the navigateToFileTab router integration.

const wsA = 'workspace-a';
const projectA = 'project-a';

function makeRouter() {
  return {
    navigate: vi.fn().mockResolvedValue(true),
  } as unknown as Router;
}

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
    ],
  });
  return TestBed.inject(FileTabsService);
}

describe('FileTabsService — preview / pin model', () => {
  beforeEach(() => {
    window.localStorage.removeItem('mozart-file-tabs-v1');
    window.localStorage.removeItem('mozart-drafts-v1');
  });

  it('previewForPath opens a new tab with preview state and activates', () => {
    const svc = setup();
    svc.previewForPath(wsA, 'src/a.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(true);
    expect(svc.activeFor(wsA)()).toBe('src/a.ts');
  });

  it('previewForPath replaces the existing preview slot (one preview per workspace)', () => {
    const svc = setup();
    svc.previewForPath(wsA, 'src/a.ts');
    svc.previewForPath(wsA, 'src/b.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/b.ts']);
    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
    expect(svc.isPreviewFor(wsA, 'src/b.ts')).toBe(true);
    expect(svc.activeFor(wsA)()).toBe('src/b.ts');
  });

  it('previewForPath on an already-pinned path just activates (preserves pin)', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.previewForPath(wsA, 'src/a.ts');

    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
    expect(svc.activeFor(wsA)()).toBe('src/a.ts');
  });

  it('pinForPath opens a new tab when not yet open', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
    expect(svc.activeFor(wsA)()).toBe('src/a.ts');
  });

  it('pinForPath promotes an existing preview to pinned (flips italic)', () => {
    const svc = setup();
    svc.previewForPath(wsA, 'src/a.ts');
    svc.pinForPath(wsA, 'src/a.ts');

    expect(svc.isPreviewFor(wsA, 'src/a.ts')).toBe(false);
    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
  });

  it('pinForPath on already-pinned is a no-op aside from activate', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.pinForPath(wsA, 'src/b.ts');
    svc.pinForPath(wsA, 'src/a.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(svc.activeFor(wsA)()).toBe('src/a.ts');
  });
});

describe('FileTabsService — cap removal (R3)', () => {
  it('R3: opening a second pinned tab does NOT evict the first (cap removed)', () => {
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
  it('removes the closed path and falls back to neighbor active', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.pinForPath(wsA, 'src/b.ts');
    svc.pinForPath(wsA, 'src/c.ts');
    svc.setActiveFor(wsA, 'src/b.ts');

    svc.closeFor(wsA, 'src/b.ts');

    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts', 'src/c.ts']);
    expect(svc.activeFor(wsA)()).toBe('src/a.ts');
  });

  it('clears the preview slot when the closing tab was the preview', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/pinned.ts');
    svc.previewForPath(wsA, 'src/preview.ts');
    expect(svc.isPreviewFor(wsA, 'src/preview.ts')).toBe(true);

    svc.closeFor(wsA, 'src/preview.ts');

    expect(svc.previewFor(wsA)()).toBeNull();
    expect(svc.forWorkspace(wsA)()).toEqual(['src/pinned.ts']);
  });

  it('is idempotent on a path that is not open', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.closeFor(wsA, 'src/does-not-exist.ts');
    expect(svc.forWorkspace(wsA)()).toEqual(['src/a.ts']);
  });

  it('returns null active when the workspace had only one tab', () => {
    const svc = setup();
    svc.pinForPath(wsA, 'src/a.ts');
    svc.closeFor(wsA, 'src/a.ts');

    expect(svc.forWorkspace(wsA)()).toEqual([]);
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
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: Router, useValue: makeRouter() },
      ],
    });
    const svc = TestBed.inject(FileTabsService);
    const router = TestBed.inject(Router);

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
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: Router, useValue: makeRouter() },
      ],
    });
    const svc = TestBed.inject(FileTabsService);
    const router = TestBed.inject(Router);

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
});
