import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import type { FileNode } from '@mozart/desktop-repositories-util';
import { FileTreeCacheStore } from './file-tree-cache.store';
import { REPOSITORIES_ADAPTER } from './repositories.adapter';
import { RepositoriesFacade } from './repositories.facade';

// Tests the sibling-workspace fallback path added with the project
// fallback selector. When the active workspace has never been opened
// before but a sibling of the same project has, the facade returns the
// sibling's tree as a placeholder so the file-tree paints something
// approximately correct during the fetch window.
//
// The adapter port is stubbed because none of these tests need real
// Tauri calls — the facade method under test reads exclusively from
// the in-memory FileTreeCacheStore.

function fileNode(path: string): FileNode {
  return {
    path,
    name: path.split('/').pop() ?? path,
    kind: 'file',
    status: 'unchanged',
    ignored: false,
  };
}

const stubAdapter = {
  listTree: () => Promise.resolve([] as FileNode[]),
  watchTree: () => Promise.resolve(() => undefined),
  getFileDiff: () => Promise.resolve(''),
  readFile: () => Promise.resolve(''),
  listChangedFiles: () => Promise.resolve([]),
  commitWorkspace: () => Promise.resolve(''),
};

describe('RepositoriesFacade.projectFallbackTreeFor', () => {
  const proj1 = 'project-1';
  const proj2 = 'project-2';
  const wsA = 'workspace-a';
  const wsB = 'workspace-b';
  const wsC = 'workspace-c';

  let facade: RepositoriesFacade;
  let store: InstanceType<typeof FileTreeCacheStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: REPOSITORIES_ADAPTER, useValue: stubAdapter }],
    });
    facade = TestBed.inject(RepositoriesFacade);
    store = TestBed.inject(FileTreeCacheStore);
  });

  it('returns null when no sibling of the same project has a cache', () => {
    const wsId = signal<string | null>(wsA);
    const projId = signal<string | null>(proj1);
    const showIgnored = signal(false);
    const fallback = facade.projectFallbackTreeFor(wsId, projId, showIgnored);

    expect(fallback()).toBeNull();
  });

  it('returns a sibling workspace tree when one is cached for the same project', () => {
    // Sibling B has a cached tree for the same project.
    store.cacheTree(wsB, proj1, [fileNode('shared.ts')], 0, false);

    const wsId = signal<string | null>(wsA);
    const projId = signal<string | null>(proj1);
    const showIgnored = signal(false);
    const fallback = facade.projectFallbackTreeFor(wsId, projId, showIgnored);

    expect(fallback()).toEqual([fileNode('shared.ts')]);
  });

  it('never returns the active workspace itself as a fallback', () => {
    store.cacheTree(wsA, proj1, [fileNode('own.ts')], 0, false);

    const wsId = signal<string | null>(wsA);
    const projId = signal<string | null>(proj1);
    const showIgnored = signal(false);
    const fallback = facade.projectFallbackTreeFor(wsId, projId, showIgnored);

    expect(fallback()).toBeNull();
  });

  it('ignores siblings that belong to a different project', () => {
    store.cacheTree(wsB, proj2, [fileNode('other-project.ts')], 0, false);

    const wsId = signal<string | null>(wsA);
    const projId = signal<string | null>(proj1);
    const showIgnored = signal(false);
    const fallback = facade.projectFallbackTreeFor(wsId, projId, showIgnored);

    expect(fallback()).toBeNull();
  });

  it('picks the most recently-cached sibling when several exist', async () => {
    store.cacheTree(wsB, proj1, [fileNode('older.ts')], 0, false);
    // Ensure cachedAt is monotonically larger for the newer entry.
    await new Promise((r) => setTimeout(r, 5));
    store.cacheTree(wsC, proj1, [fileNode('newer.ts')], 0, false);

    const wsId = signal<string | null>(wsA);
    const projId = signal<string | null>(proj1);
    const showIgnored = signal(false);
    const fallback = facade.projectFallbackTreeFor(wsId, projId, showIgnored);

    expect(fallback()).toEqual([fileNode('newer.ts')]);
  });

  it('drops a sibling whose revision was bumped after its write (stale)', () => {
    store.cacheTree(wsB, proj1, [fileNode('shared.ts')], 0, false);
    // Watcher fires for B before A is opened — the entry is now stale.
    store.bumpRevision(wsB);

    const wsId = signal<string | null>(wsA);
    const projId = signal<string | null>(proj1);
    const showIgnored = signal(false);
    const fallback = facade.projectFallbackTreeFor(wsId, projId, showIgnored);

    expect(fallback()).toBeNull();
  });

  it('skips siblings whose showIgnored does not match the request', () => {
    store.cacheTree(wsB, proj1, [fileNode('with-ignored.ts')], 0, true);

    const wsId = signal<string | null>(wsA);
    const projId = signal<string | null>(proj1);
    const showIgnored = signal(false);
    const fallback = facade.projectFallbackTreeFor(wsId, projId, showIgnored);

    expect(fallback()).toBeNull();
  });
});
