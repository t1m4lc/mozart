import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_WORKSPACE_ASIDE_STATE,
  UiStateStore,
  type WorkspaceAsideState,
} from './ui-state.store';

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
  });
});
