import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FileViewsFacade,
  RepositoriesFacade,
} from '@mozart/desktop-repositories-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import { ProjectFilesStore } from './project-files.store';

// Loosely-typed fakes: the store only calls the methods stubbed here, and
// `useValue` providers are untyped. Signals let us assert reactivity.
function setup(opts: {
  tree?: { path: string; kind: string; children?: unknown[] | null }[];
  changed?: { path: string; status: string }[];
  views?: Record<string, { viewedAt: number }>;
  tabs?: { path: string }[];
}) {
  const treeSig = signal(opts.tree ?? []);
  const changedSig = signal(opts.changed ?? []);
  const viewsSig = signal(opts.views ?? {});
  const tabsSig = signal(opts.tabs ?? []);
  const refreshTree = vi.fn();
  const refreshChanged = vi.fn();

  const repos = {
    cachedTreeFor: () => treeSig,
    cachedChangedFilesFor: () => changedSig,
    refreshTreeInBackground: refreshTree,
    refreshChangedFilesInBackground: refreshChanged,
  };
  const fileViews = { viewsFor: () => viewsSig };
  const uiState = { fileTabsFor: () => tabsSig() };

  TestBed.configureTestingModule({
    providers: [
      ProjectFilesStore,
      { provide: RepositoriesFacade, useValue: repos },
      { provide: FileViewsFacade, useValue: fileViews },
      { provide: UiStateFacade, useValue: uiState },
    ],
  });
  const store = TestBed.inject(ProjectFilesStore);
  return { store, treeSig, tabsSig, refreshTree, refreshChanged };
}

describe('ProjectFilesStore', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('returns [] when no workspace is selected', () => {
    const { store } = setup({ tree: [{ path: 'a.ts', kind: 'file' }] });
    const entries = store.fileEntriesFor(signal(null));
    expect(entries()).toEqual([]);
  });

  it('merges tree + changed + views + tabs into a flat ranked list', () => {
    const { store } = setup({
      tree: [
        { path: 'src/tab.ts', kind: 'file' },
        { path: 'src/x.ts', kind: 'file' },
        { path: 'README.md', kind: 'file' },
        { path: 'package.json', kind: 'file' },
      ],
      changed: [{ path: 'src/x.ts', status: 'modified' }],
      views: { 'README.md': { viewedAt: 100 } },
      tabs: [{ path: 'src/tab.ts' }],
    });
    const entries = store.fileEntriesFor(signal('ws-1'));
    expect(entries()).toEqual([
      { path: 'src/tab.ts', tier: 'open', badge: 'open' },
      { path: 'src/x.ts', tier: 'changed', badge: 'M' },
      { path: 'README.md', tier: 'other' }, // viewed → before unviewed
      { path: 'package.json', tier: 'other' },
    ]);
  });

  it('maps git status words to single-letter badges', () => {
    const { store } = setup({
      tree: [
        { path: 'a.ts', kind: 'file' },
        { path: 'b.ts', kind: 'file' },
      ],
      changed: [
        { path: 'a.ts', status: 'added' },
        { path: 'b.ts', status: 'deleted' },
      ],
    });
    const entries = store.fileEntriesFor(signal('ws-1'));
    expect(entries().map((e) => e.badge)).toEqual(['A', 'D']);
  });

  it('recomputes when an upstream source changes', () => {
    const { store, treeSig } = setup({
      tree: [{ path: 'a.ts', kind: 'file' }],
    });
    const entries = store.fileEntriesFor(signal('ws-1'));
    expect(entries().map((e) => e.path)).toEqual(['a.ts']);
    treeSig.set([
      { path: 'a.ts', kind: 'file' },
      { path: 'b.ts', kind: 'file' },
    ]);
    expect(entries().map((e) => e.path)).toEqual(['a.ts', 'b.ts']);
  });

  it('refresh() kicks both background refreshers', () => {
    const { store, refreshTree, refreshChanged } = setup({});
    store.refresh('ws-1');
    expect(refreshTree).toHaveBeenCalledWith('ws-1');
    expect(refreshChanged).toHaveBeenCalledWith('ws-1');
  });
});
