import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { FileViewsFacade } from './file-views.facade';
import { FileViewsStore } from './file-views.store';
import {
  REPOSITORIES_ADAPTER,
  type FileViewEntry,
  type RepositoriesAdapter,
} from './repositories.adapter';

// Stub adapter for the Viewed-state surface only. Other RepositoriesAdapter
// methods are unused by FileViewsFacade and stubbed as throw-on-call so a
// regression that wires them through this facade is caught loudly.
function makeAdapter(initial: readonly FileViewEntry[]): {
  adapter: RepositoriesAdapter;
  calls: { markFileViewed: string[]; clearFileView: string[]; markAllViewed: string[] };
  setList: (entries: readonly FileViewEntry[]) => void;
} {
  let list = [...initial];
  const calls = {
    markFileViewed: [] as string[],
    clearFileView: [] as string[],
    markAllViewed: [] as string[],
  };
  const adapter: RepositoriesAdapter = {
    listTree: () => Promise.reject(new Error('unused')),
    watchTree: () => Promise.reject(new Error('unused')),
    getFileDiff: () => Promise.reject(new Error('unused')),
    readFile: () => Promise.reject(new Error('unused')),
    saveFile: () => Promise.reject(new Error('unused')),
    listChangedFiles: () => Promise.reject(new Error('unused')),
    commitWorkspace: () => Promise.reject(new Error('unused')),
    stageFile: () => Promise.reject(new Error('unused')),
    unstageFile: () => Promise.reject(new Error('unused')),
    isStaged: () => Promise.reject(new Error('unused')),
    discardWorkspaceChanges: () => Promise.reject(new Error('unused')),
    async markFileViewed(_workspaceId, path) {
      calls.markFileViewed.push(path);
    },
    async clearFileView(_workspaceId, path) {
      calls.clearFileView.push(path);
    },
    async listFileViews() {
      return list;
    },
    async markAllViewed(workspaceId) {
      calls.markAllViewed.push(workspaceId);
    },
  };
  return { adapter, calls, setList: (next) => (list = [...next]) };
}

describe('FileViewsFacade', () => {
  const wsId = 'ws-1';
  let facade: FileViewsFacade;
  let store: InstanceType<typeof FileViewsStore>;
  let calls: ReturnType<typeof makeAdapter>['calls'];
  let setList: ReturnType<typeof makeAdapter>['setList'];

  function configure(initial: readonly FileViewEntry[] = []) {
    const { adapter, calls: c, setList: s } = makeAdapter(initial);
    TestBed.configureTestingModule({
      providers: [{ provide: REPOSITORIES_ADAPTER, useValue: adapter }],
    });
    facade = TestBed.inject(FileViewsFacade);
    store = TestBed.inject(FileViewsStore);
    calls = c;
    setList = s;
  }

  it('refresh loads the wire entries into the store', async () => {
    configure([{ path: 'a.ts', state: 'viewed', viewedAt: 100 }]);
    await facade.refresh(wsId);
    const map = store.byWorkspace()[wsId];
    expect(map).toEqual({ 'a.ts': { state: 'viewed', viewedAt: 100 } });
  });

  it('markViewed updates the store optimistically and calls the adapter', async () => {
    configure();
    await facade.markViewed(wsId, 'foo.ts');
    expect(calls.markFileViewed).toEqual(['foo.ts']);
    expect(store.byWorkspace()[wsId]?.['foo.ts']?.state).toBe('viewed');
  });

  it('clearViewed removes the entry from the store', async () => {
    configure([{ path: 'foo.ts', state: 'viewed', viewedAt: 1 }]);
    await facade.refresh(wsId);
    await facade.clearViewed(wsId, 'foo.ts');
    expect(calls.clearFileView).toEqual(['foo.ts']);
    expect(store.byWorkspace()[wsId]?.['foo.ts']).toBeUndefined();
  });

  it('markAll calls the bulk endpoint then re-fetches the map', async () => {
    configure();
    setList([
      { path: 'a.ts', state: 'viewed', viewedAt: 1 },
      { path: 'b.ts', state: 'viewed', viewedAt: 2 },
    ]);
    await facade.markAll(wsId);
    expect(calls.markAllViewed).toEqual([wsId]);
    expect(Object.keys(store.byWorkspace()[wsId] ?? {})).toEqual(['a.ts', 'b.ts']);
  });

  it('countsFor derives viewed / changed / remaining from the changed-files list', async () => {
    configure([
      { path: 'a.ts', state: 'viewed', viewedAt: 1 },
      { path: 'b.ts', state: 'changed_since_viewed', viewedAt: 2 },
    ]);
    await facade.refresh(wsId);
    const ws = signal<string | null>(wsId);
    const paths = signal<readonly string[]>(['a.ts', 'b.ts', 'c.ts']);
    const counts = facade.countsFor(ws, paths);
    expect(counts()).toEqual({
      total: 3,
      viewed: 1,
      changedSinceViewed: 1,
      remaining: 2,
    });
  });

  it('viewsFor returns an empty map for an unknown workspace', () => {
    configure();
    const v = facade.viewsFor(signal<string | null>('never-loaded'));
    expect(v()).toEqual({});
  });

  it('invalidateAfterRun re-fetches and reflects post-run state', async () => {
    configure([{ path: 'a.ts', state: 'viewed', viewedAt: 1 }]);
    await facade.refresh(wsId);
    expect(store.byWorkspace()[wsId]?.['a.ts']?.state).toBe('viewed');
    // Simulate the agent run mutating the file under us.
    setList([{ path: 'a.ts', state: 'changed_since_viewed', viewedAt: 1 }]);
    await facade.invalidateAfterRun(wsId);
    expect(store.byWorkspace()[wsId]?.['a.ts']?.state).toBe(
      'changed_since_viewed',
    );
  });

  it('forget drops a workspace cleanly', async () => {
    configure([{ path: 'a.ts', state: 'viewed', viewedAt: 1 }]);
    await facade.refresh(wsId);
    facade.forget(wsId);
    expect(store.byWorkspace()[wsId]).toBeUndefined();
  });
});
