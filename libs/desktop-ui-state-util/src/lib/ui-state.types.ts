// Types and defaults consumed by the ui-state store AND by UI/feature
// components in other domains. Kept in `type:util` so a `type:ui` lib
// (e.g. a workspace ui component that reads WorkspaceFileContentMode)
// can import them without crossing the data-access boundary.

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
// store's `withStorageSync`, keyed by workspaceId. Defaults match the
// previous hard-coded component defaults so an empty entry maps onto
// today's first-run behavior.
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
