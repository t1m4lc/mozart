import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_WORKSPACE_ASIDE_STATE,
  type WorkspaceAsideState,
} from '@mozart/desktop-ui-state-util';
import { UiStateStore } from './ui-state.store';

// Regression test for the P1.1 bug: switching workspaces leaked the
// previously-selected bottom tab (and other right-aside UI choices)
// because they lived in the URL or in the component instead of being
// keyed per-workspace.
//
// File-tab / per-path mode / drafts state moved out of UiStateStore in
// the P1.3 reshape — see `file-tabs.store.spec.ts` for those slices.
describe('UiStateStore — right-aside + tree per-workspace state', () => {
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

  it('returns the default state when no entry exists for a workspace', () => {
    const store = TestBed.inject(UiStateStore);
    expect(store.asideStateByWorkspace()[wsA]).toBeUndefined();
    const fallback =
      store.asideStateByWorkspace()[wsA] ?? DEFAULT_WORKSPACE_ASIDE_STATE;
    expect(fallback).toEqual(DEFAULT_WORKSPACE_ASIDE_STATE);
  });

  it('isolates state per workspace id (THE regression case)', () => {
    const store = TestBed.inject(UiStateStore);
    store.updateWorkspaceAsideState(wsA, {
      bottomTab: 'terminal',
      bottomOpen: false,
    });
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

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const store = TestBed.inject(UiStateStore);

    expect(store.asideStateByWorkspace()[wsA]).toEqual({
      ...DEFAULT_WORKSPACE_ASIDE_STATE,
      bottomTab: 'terminal',
      filesView: 'changes',
      bottomSize: 65,
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

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const next = TestBed.inject(UiStateStore);
      expect(next.treeExpandedByWorkspace()[wsA]).toEqual(['src', 'src/util']);
    });
  });

  describe('pruneWorkspace', () => {
    it('drops aside + tree entries for the given workspace', () => {
      const store = TestBed.inject(UiStateStore);
      store.updateWorkspaceAsideState(wsA, { bottomTab: 'terminal' });
      store.setTreeExpanded(wsA, ['src']);
      store.updateWorkspaceAsideState(wsB, { bottomTab: 'run' });

      store.pruneWorkspace(wsA);

      expect(store.asideStateByWorkspace()[wsA]).toBeUndefined();
      expect(store.treeExpandedByWorkspace()[wsA]).toBeUndefined();
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
