import {
  withDevtools,
  withStorageSync,
} from '@angular-architects/ngrx-toolkit';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';

// Cross-domain UI state. Per Phase 7 conventions §1.3 :
//   Domain stores own entity collections.
//   This store owns *which entity is currently active* + sidebar
//   expand state — the "what is selected / displayed" layer.
//
// Visible in Redux DevTools under the name "uiState" so reviewers can
// trace user navigation alongside data mutations from the per-domain
// stores. Selected slices are also mirrored to localStorage via
// `withStorageSync` so per-workspace UI choices (bottom tab, files
// sub-tab, pane sizes…) survive a relaunch.

export type WorkspaceAsideBottomTab = 'setup' | 'run' | 'terminal';
export type WorkspaceAsideFilesView = 'all' | 'changes';
export type WorkspaceFileContentMode = 'edit' | 'diff';
export type WorkspaceFileOpenSource = 'all-files' | 'changes';
export type WorkspaceFileViewFlow = 'edit' | 'review';

export interface WorkspaceFileOpenOptions {
  mode: WorkspaceFileContentMode;
  source: WorkspaceFileOpenSource;
}

export interface WorkspaceFileFlowState {
  path: string | null;
  mode: WorkspaceFileContentMode;
  source: WorkspaceFileOpenSource;
  splitDiff: boolean;
}

// Per-workspace middle-shell file state. `edit` is the All files flow,
// `review` is the Changes flow; keeping both lets the same path retain
// separate UI choices depending on where the user opened it from.
export interface WorkspaceFileViewState {
  activeFlow: WorkspaceFileViewFlow | null;
  edit: WorkspaceFileFlowState;
  review: WorkspaceFileFlowState;
}

// Per-workspace right-aside UI state. Persisted across sessions via the
// `withStorageSync` slice below, keyed by workspaceId. Defaults match
// the previous hard-coded component defaults so an empty entry maps
// onto today's first-run behavior.
export interface WorkspaceAsideState {
  bottomTab: WorkspaceAsideBottomTab;
  filesView: WorkspaceAsideFilesView;
  bottomOpen: boolean;
  // Percentage (0–100) of the aside's vertical resizable group that the
  // bottom panel claims. Was a pixel height when the slot used a manual
  // mousemove handle; switched to a percent when the slot moved to
  // hlm-resizable, whose API talks in percentages.
  bottomSize: number;
  stagedOpen: boolean;
  unstagedOpen: boolean;
}

export const DEFAULT_WORKSPACE_ASIDE_STATE: WorkspaceAsideState = {
  bottomTab: 'run',
  filesView: 'all',
  bottomOpen: true,
  bottomSize: 40,
  stagedOpen: true,
  unstagedOpen: true,
};

export const DEFAULT_WORKSPACE_FILE_VIEW_STATE: WorkspaceFileViewState = {
  activeFlow: null,
  edit: {
    path: null,
    mode: 'edit',
    source: 'all-files',
    splitDiff: false,
  },
  review: {
    path: null,
    mode: 'diff',
    source: 'changes',
    splitDiff: false,
  },
};

interface State {
  // Currently-routed workspace id. `null` on /, /welcome, /settings,
  // etc. Mirrored into the URL by the router; the store is the single
  // source of truth in-memory.
  activeWorkspaceId: string | null;

  // Which project rows are expanded in the left sidebar. Persists for
  // the session (not yet DB-backed — that lives behind IMP-024).
  expandedProjectIds: ReadonlySet<string>;

  // Status group ids the user has collapsed when sidebar groupBy is
  // 'status'. Default = expanded, so we track the inverse (collapsed)
  // and an empty set means everything is open.
  collapsedStatusIds: ReadonlySet<string>;

  // Per-workspace right-aside tab + pane state. Persisted via the
  // `select` below. Other fields use `ReadonlySet` which does not JSON-
  // serialize, so persisting the whole state would corrupt them.
  asideStateByWorkspace: Record<string, WorkspaceAsideState>;

  // Per-workspace middle-shell file view state. Stored separately from
  // FileTabsService's open-tab list so All files and Changes can keep
  // independent mode/review state for the same path.
  fileViewStateByWorkspace: Record<string, WorkspaceFileViewState>;
}

const initialState: State = {
  activeWorkspaceId: null,
  expandedProjectIds: new Set<string>(),
  collapsedStatusIds: new Set<string>(),
  asideStateByWorkspace: {},
  fileViewStateByWorkspace: {},
};

function fileFlowFromSource(
  source: WorkspaceFileOpenSource,
): WorkspaceFileViewFlow {
  return source === 'all-files' ? 'edit' : 'review';
}

function normalizeFileViewState(
  state: WorkspaceFileViewState | undefined,
): WorkspaceFileViewState {
  return {
    activeFlow:
      state?.activeFlow ?? DEFAULT_WORKSPACE_FILE_VIEW_STATE.activeFlow,
    edit: {
      ...DEFAULT_WORKSPACE_FILE_VIEW_STATE.edit,
      ...state?.edit,
    },
    review: {
      ...DEFAULT_WORKSPACE_FILE_VIEW_STATE.review,
      ...state?.review,
    },
  };
}

export const UiStateStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('uiState'),
  // Persist only the slice we own per-workspace. The Set-typed fields
  // above can't survive JSON.stringify, so leaving them out of `select`
  // keeps them at their in-memory defaults across reloads. Versioned
  // key (`-v1`) so we can bump if the shape ever changes incompatibly.
  withStorageSync({
    key: 'mozart-ui-state-v1',
    select: (state) => ({
      asideStateByWorkspace: state.asideStateByWorkspace,
      fileViewStateByWorkspace: state.fileViewStateByWorkspace,
    }),
  }),
  withMethods((store) => ({
    setActiveWorkspace(id: string | null): void {
      patchState(store, { activeWorkspaceId: id });
    },

    toggleProjectExpanded(projectId: string): void {
      const next = new Set(store.expandedProjectIds());
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      patchState(store, { expandedProjectIds: next });
    },

    expandProjects(projectIds: readonly string[]): void {
      patchState(store, {
        expandedProjectIds: new Set([
          ...store.expandedProjectIds(),
          ...projectIds,
        ]),
      });
    },

    setExpandedProjects(projectIds: readonly string[]): void {
      patchState(store, { expandedProjectIds: new Set(projectIds) });
    },

    collapseAllProjects(): void {
      patchState(store, { expandedProjectIds: new Set<string>() });
    },

    toggleStatusCollapsed(statusId: string): void {
      const next = new Set(store.collapsedStatusIds());
      if (next.has(statusId)) next.delete(statusId);
      else next.add(statusId);
      patchState(store, { collapsedStatusIds: next });
    },

    setCollapsedStatuses(statusIds: readonly string[]): void {
      patchState(store, { collapsedStatusIds: new Set(statusIds) });
    },

    expandAllStatuses(): void {
      patchState(store, { collapsedStatusIds: new Set<string>() });
    },

    // Merge a partial right-aside state for a single workspace. The
    // method is intentionally narrow — callers pass exactly the fields
    // that changed (e.g. `{ bottomTab: 'terminal' }`) and the store
    // fills the rest from the existing entry, or from
    // DEFAULT_WORKSPACE_ASIDE_STATE on first write.
    updateWorkspaceAsideState(
      workspaceId: string,
      patch: Partial<WorkspaceAsideState>,
    ): void {
      const current =
        store.asideStateByWorkspace()[workspaceId] ??
        DEFAULT_WORKSPACE_ASIDE_STATE;
      patchState(store, {
        asideStateByWorkspace: {
          ...store.asideStateByWorkspace(),
          [workspaceId]: { ...current, ...patch },
        },
      });
    },

    openWorkspaceFile(
      workspaceId: string,
      path: string,
      options: WorkspaceFileOpenOptions,
    ): void {
      const flow = fileFlowFromSource(options.source);
      const current = normalizeFileViewState(
        store.fileViewStateByWorkspace()[workspaceId],
      );
      patchState(store, {
        fileViewStateByWorkspace: {
          ...store.fileViewStateByWorkspace(),
          [workspaceId]: {
            ...current,
            activeFlow: flow,
            [flow]: {
              ...current[flow],
              path,
              mode: options.mode,
              source: options.source,
            },
          },
        },
      });
    },

    updateActiveWorkspaceFileViewState(
      workspaceId: string,
      patch: Partial<Pick<WorkspaceFileFlowState, 'mode' | 'splitDiff'>>,
    ): void {
      const current = normalizeFileViewState(
        store.fileViewStateByWorkspace()[workspaceId],
      );
      const flow = current.activeFlow;
      if (!flow) return;
      patchState(store, {
        fileViewStateByWorkspace: {
          ...store.fileViewStateByWorkspace(),
          [workspaceId]: {
            ...current,
            [flow]: {
              ...current[flow],
              ...patch,
            },
          },
        },
      });
    },
  })),
);
