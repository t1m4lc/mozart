import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_WORKSPACE_ASIDE_STATE,
  DEFAULT_WORKSPACE_FILE_VIEW_STATE,
  type WorkspaceAsideState,
  type WorkspaceFileViewState,
} from '@mozart/desktop-ui-state-util';
import { UiStateStore } from './ui-state.store';

// Regression test for the P1.1 bug: switching workspaces leaked the
// previously-selected bottom tab (and other right-aside UI choices)
// because they lived in the URL or in the component instead of being
// keyed per-workspace.
//
// The spec drives UiStateStore directly because that is the layer the
// fix introduces. Mounting the whole feature-workspace-aside component
// with all its collaborators (Tauri-backed facades, run registry,
// terminals, file tabs) is out of scope here — manual checkpoint
// covers the URL-hydration path end-to-end.
describe('UiStateStore — right-aside per-workspace state', () => {
  const STORAGE_KEY = 'mozart-ui-state-v1';
  const wsA = 'workspace-a';
  const wsB = 'workspace-b';

  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  function readSlice(): Record<string, WorkspaceAsideState> {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as {
      asideStateByWorkspace?: Record<string, WorkspaceAsideState>;
    };
    return parsed.asideStateByWorkspace ?? {};
  }

  function readFileViewSlice(): Record<string, WorkspaceFileViewState> {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as {
      fileViewStateByWorkspace?: Record<string, WorkspaceFileViewState>;
    };
    return parsed.fileViewStateByWorkspace ?? {};
  }

  it('returns the default state when no entry exists for a workspace', () => {
    const store = TestBed.inject(UiStateStore);
    expect(store.asideStateByWorkspace()[wsA]).toBeUndefined();
    // Consumers go through the facade's asideStateFor() to read; here
    // we assert the underlying invariant — an unknown id maps to the
    // documented default.
    const fallback =
      store.asideStateByWorkspace()[wsA] ?? DEFAULT_WORKSPACE_ASIDE_STATE;
    expect(fallback).toEqual(DEFAULT_WORKSPACE_ASIDE_STATE);
  });

  it('isolates state per workspace id (THE regression case)', () => {
    const store = TestBed.inject(UiStateStore);
    // Workspace A picks Terminal + collapses the bottom slot.
    store.updateWorkspaceAsideState(wsA, {
      bottomTab: 'terminal',
      bottomOpen: false,
    });
    // Workspace B picks Run with the bottom slot expanded — independent.
    store.updateWorkspaceAsideState(wsB, {
      bottomTab: 'run',
      bottomOpen: true,
    });

    expect(store.asideStateByWorkspace()[wsA]?.bottomTab).toBe('terminal');
    expect(store.asideStateByWorkspace()[wsA]?.bottomOpen).toBe(false);
    expect(store.asideStateByWorkspace()[wsB]?.bottomTab).toBe('run');
    expect(store.asideStateByWorkspace()[wsB]?.bottomOpen).toBe(true);
  });

  it('merge-patches partial updates and keeps untouched fields at their last value', () => {
    const store = TestBed.inject(UiStateStore);

    store.updateWorkspaceAsideState(wsA, { bottomTab: 'terminal' });
    // Second update changes only filesView; bottomTab must remain.
    store.updateWorkspaceAsideState(wsA, { filesView: 'changes' });

    expect(store.asideStateByWorkspace()[wsA]).toEqual({
      ...DEFAULT_WORKSPACE_ASIDE_STATE,
      bottomTab: 'terminal',
      filesView: 'changes',
    });
  });

  it('writes per-workspace state through to localStorage', () => {
    const store = TestBed.inject(UiStateStore);
    store.updateWorkspaceAsideState(wsA, {
      bottomTab: 'terminal',
      bottomSize: 55,
    });

    const persisted = readSlice();
    expect(persisted[wsA]).toMatchObject({
      bottomTab: 'terminal',
      bottomSize: 55,
    });
  });

  it('rehydrates per-workspace state on store re-initialization (app relaunch)', () => {
    // Seed localStorage as a previous session would have.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        asideStateByWorkspace: {
          [wsA]: {
            ...DEFAULT_WORKSPACE_ASIDE_STATE,
            bottomTab: 'terminal',
            filesView: 'changes',
            bottomSize: 65,
          },
        },
      }),
    );

    // Fresh injector → withStorageSync reads from localStorage on init.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const store = TestBed.inject(UiStateStore);

    expect(store.asideStateByWorkspace()[wsA]).toEqual({
      ...DEFAULT_WORKSPACE_ASIDE_STATE,
      bottomTab: 'terminal',
      filesView: 'changes',
      bottomSize: 65,
    });
    expect(store.fileViewStateByWorkspace()).toEqual({});
  });

  it('defaults file-view state to separate edit and review flows', () => {
    const store = TestBed.inject(UiStateStore);
    expect(
      store.fileViewStateByWorkspace()[wsA] ??
        DEFAULT_WORKSPACE_FILE_VIEW_STATE,
    ).toEqual(DEFAULT_WORKSPACE_FILE_VIEW_STATE);
  });

  it('keeps All files and Changes file-view state separate for the same path', () => {
    const store = TestBed.inject(UiStateStore);
    const path = 'src/app.ts';

    store.openWorkspaceFile(wsA, path, {
      mode: 'edit',
      source: 'all-files',
    });
    store.openWorkspaceFile(wsA, path, {
      mode: 'diff',
      source: 'changes',
    });
    store.updateActiveWorkspaceFileViewState(wsA, { splitDiff: true });
    store.openWorkspaceFile(wsA, path, {
      mode: 'edit',
      source: 'all-files',
    });

    expect(store.fileViewStateByWorkspace()[wsA]).toEqual({
      activeFlow: 'edit',
      edit: {
        path,
        mode: 'edit',
        source: 'all-files',
        splitDiff: false,
      },
      review: {
        path,
        mode: 'diff',
        source: 'changes',
        splitDiff: true,
      },
    });
  });

  it('isolates file-view state per workspace id', () => {
    const store = TestBed.inject(UiStateStore);

    store.openWorkspaceFile(wsA, 'src/a.ts', {
      mode: 'edit',
      source: 'all-files',
    });
    store.openWorkspaceFile(wsB, 'src/b.ts', {
      mode: 'diff',
      source: 'changes',
    });

    expect(store.fileViewStateByWorkspace()[wsA]?.activeFlow).toBe('edit');
    expect(store.fileViewStateByWorkspace()[wsA]?.edit.path).toBe('src/a.ts');
    expect(store.fileViewStateByWorkspace()[wsB]?.activeFlow).toBe('review');
    expect(store.fileViewStateByWorkspace()[wsB]?.review.path).toBe('src/b.ts');
  });

  it('writes file-view state through to localStorage', () => {
    const store = TestBed.inject(UiStateStore);
    store.openWorkspaceFile(wsA, 'src/app.ts', {
      mode: 'diff',
      source: 'changes',
    });
    store.updateActiveWorkspaceFileViewState(wsA, { splitDiff: true });

    expect(readFileViewSlice()[wsA]).toEqual({
      ...DEFAULT_WORKSPACE_FILE_VIEW_STATE,
      activeFlow: 'review',
      review: {
        path: 'src/app.ts',
        mode: 'diff',
        source: 'changes',
        splitDiff: true,
      },
    });
  });

  describe('per-workspace tree-expansion persistence', () => {
    function readTreeExpandedSlice(): Record<string, readonly string[]> {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return {};
      const parsed = raw
        ? (JSON.parse(raw) as {
            treeExpandedByWorkspace?: Record<string, readonly string[]>;
          })
        : {};
      return parsed.treeExpandedByWorkspace ?? {};
    }

    it('starts empty for any workspace', () => {
      const store = TestBed.inject(UiStateStore);
      expect(store.treeExpandedByWorkspace()[wsA]).toBeUndefined();
    });

    it('stores expanded paths per workspace', () => {
      const store = TestBed.inject(UiStateStore);
      store.setTreeExpanded(wsA, ['src', 'src/app']);
      store.setTreeExpanded(wsB, ['docs']);

      expect(store.treeExpandedByWorkspace()[wsA]).toEqual(['src', 'src/app']);
      expect(store.treeExpandedByWorkspace()[wsB]).toEqual(['docs']);
    });

    it('drops the entry when the list collapses to empty (compact storage)', () => {
      const store = TestBed.inject(UiStateStore);
      store.setTreeExpanded(wsA, ['src']);
      expect(store.treeExpandedByWorkspace()[wsA]).toEqual(['src']);
      store.setTreeExpanded(wsA, []);
      expect(store.treeExpandedByWorkspace()[wsA]).toBeUndefined();
    });

    it('persists to localStorage and rehydrates on relaunch', () => {
      const store = TestBed.inject(UiStateStore);
      store.setTreeExpanded(wsA, ['src', 'src/util']);

      expect(readTreeExpandedSlice()[wsA]).toEqual(['src', 'src/util']);

      // Fresh injector simulates an app relaunch.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const next = TestBed.inject(UiStateStore);
      expect(next.treeExpandedByWorkspace()[wsA]).toEqual(['src', 'src/util']);
    });
  });

  describe('pruneWorkspace', () => {
    it('drops every per-workspace entry for the given id', () => {
      const store = TestBed.inject(UiStateStore);
      store.updateWorkspaceAsideState(wsA, { bottomTab: 'terminal' });
      store.openWorkspaceFile(wsA, 'src/app.ts', {
        mode: 'edit',
        source: 'all-files',
      });
      store.setTreeExpanded(wsA, ['src']);
      store.updateWorkspaceAsideState(wsB, { bottomTab: 'run' });

      store.pruneWorkspace(wsA);

      expect(store.asideStateByWorkspace()[wsA]).toBeUndefined();
      expect(store.fileViewStateByWorkspace()[wsA]).toBeUndefined();
      expect(store.treeExpandedByWorkspace()[wsA]).toBeUndefined();
      // Untouched siblings survive.
      expect(store.asideStateByWorkspace()[wsB]?.bottomTab).toBe('run');
    });

    it('flushes the removal through to localStorage', () => {
      const store = TestBed.inject(UiStateStore);
      store.updateWorkspaceAsideState(wsA, { bottomTab: 'terminal' });
      store.setTreeExpanded(wsA, ['src']);

      store.pruneWorkspace(wsA);

      expect(readSlice()[wsA]).toBeUndefined();
    });
  });
});
