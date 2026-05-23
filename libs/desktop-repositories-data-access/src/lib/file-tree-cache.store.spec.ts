import { TestBed } from '@angular/core/testing';
import type { FileNode } from '@mozart/desktop-repositories-util';
import { FileTreeCacheStore } from './file-tree-cache.store';

// Regression spec for the P1.2 bug: every workspace switch re-fetched
// the file tree and rendered the previous workspace's tree until the
// fetch resolved.
//
// The spec drives `FileTreeCacheStore` directly — that's the layer the
// fix introduces. Full UI behavior (skeleton vs stale tree, fetch
// resolution race against FS-watcher events) is verified manually at
// the §P1.2 checkpoint; running the whole feature-file-tree component
// against the Tauri-backed adapter is out of scope here.

function fileNode(path: string): FileNode {
  return {
    path,
    name: path.split('/').pop() ?? path,
    kind: 'file',
    status: 'unchanged',
    ignored: false,
  };
}

describe('FileTreeCacheStore', () => {
  const wsA = 'workspace-a';
  const wsB = 'workspace-b';
  const projA = 'project-1';

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('starts empty for an unknown workspace', () => {
    const store = TestBed.inject(FileTreeCacheStore);
    expect(store.byWorkspace()[wsA]).toBeUndefined();
    expect(store.revisionFor(wsA)).toBe(0);
  });

  it('persists a fetched tree under the captured revision', () => {
    const store = TestBed.inject(FileTreeCacheStore);
    const tree = [fileNode('src/main.ts')];
    const rev = store.revisionFor(wsA);

    store.cacheTree(wsA, projA, tree, rev, false);

    expect(store.byWorkspace()[wsA]).toEqual(
      expect.objectContaining({
        tree,
        showIgnored: false,
        revision: 0,
        projectId: projA,
        cachedAt: expect.any(Number),
      }),
    );
  });

  it('keeps caches isolated per workspace (THE regression case)', () => {
    const store = TestBed.inject(FileTreeCacheStore);
    store.cacheTree(
      wsA,
      projA,
      [fileNode('a.ts')],
      store.revisionFor(wsA),
      false,
    );
    store.cacheTree(
      wsB,
      projA,
      [fileNode('b.ts')],
      store.revisionFor(wsB),
      false,
    );

    expect(store.byWorkspace()[wsA]?.tree).toEqual([fileNode('a.ts')]);
    expect(store.byWorkspace()[wsB]?.tree).toEqual([fileNode('b.ts')]);
  });

  it('bumps the revision on FS-watcher events (invalidation handle)', () => {
    const store = TestBed.inject(FileTreeCacheStore);
    expect(store.revisionFor(wsA)).toBe(0);

    store.bumpRevision(wsA);
    expect(store.revisionFor(wsA)).toBe(1);

    store.bumpRevision(wsA);
    expect(store.revisionFor(wsA)).toBe(2);

    // Bumping A must not touch B.
    expect(store.revisionFor(wsB)).toBe(0);
  });

  it('silently discards a fetch resolved AFTER an FS-watcher event', () => {
    const store = TestBed.inject(FileTreeCacheStore);

    // Reader captures the revision at fetch-start time.
    const capturedRevision = store.revisionFor(wsA);

    // While the fetch is in flight, the watcher fires.
    store.bumpRevision(wsA);

    // Fetch resolves with the now-stale tree — must not be cached.
    store.cacheTree(
      wsA,
      projA,
      [fileNode('stale.ts')],
      capturedRevision,
      /* showIgnored */ false,
    );

    expect(store.byWorkspace()[wsA]).toBeUndefined();
  });

  it('accepts a fetch resolved under the latest revision', () => {
    const store = TestBed.inject(FileTreeCacheStore);

    store.bumpRevision(wsA); // revision = 1
    const capturedRevision = store.revisionFor(wsA);
    store.cacheTree(
      wsA,
      projA,
      [fileNode('fresh.ts')],
      capturedRevision,
      /* showIgnored */ false,
    );

    expect(store.byWorkspace()[wsA]).toEqual(
      expect.objectContaining({
        tree: [fileNode('fresh.ts')],
        showIgnored: false,
        revision: 1,
        projectId: projA,
      }),
    );
  });

  it('records projectId so the sibling-fallback selector can find it', () => {
    const store = TestBed.inject(FileTreeCacheStore);
    store.cacheTree(
      wsA,
      projA,
      [fileNode('a.ts')],
      store.revisionFor(wsA),
      false,
    );

    expect(store.byWorkspace()[wsA]?.projectId).toBe(projA);
  });

  it('clear() drops both the entry and the revision for one workspace', () => {
    const store = TestBed.inject(FileTreeCacheStore);
    store.cacheTree(
      wsA,
      projA,
      [fileNode('a.ts')],
      store.revisionFor(wsA),
      false,
    );
    store.bumpRevision(wsA);
    store.cacheTree(
      wsB,
      projA,
      [fileNode('b.ts')],
      store.revisionFor(wsB),
      false,
    );

    store.clear(wsA);

    expect(store.byWorkspace()[wsA]).toBeUndefined();
    expect(store.revisionFor(wsA)).toBe(0);
    // B is untouched.
    expect(store.byWorkspace()[wsB]?.tree).toEqual([fileNode('b.ts')]);
  });
});
