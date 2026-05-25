// Types and defaults consumed by the ui-state store AND by UI/feature
// components in other domains. Kept in `type:util` so a `type:ui` lib
// (e.g. a workspace ui component that reads WorkspaceFileContentMode)
// can import them without crossing the data-access boundary.

export type WorkspaceAsideBottomTab = 'setup' | 'run' | 'terminal';
export type WorkspaceAsideFilesView = 'all' | 'changes';
export type WorkspaceFileContentMode = 'edit' | 'diff';
export type WorkspaceFileOpenSource = 'all-files' | 'changes';

export interface WorkspaceFileOpenOptions {
  mode: WorkspaceFileContentMode;
  source: WorkspaceFileOpenSource;
}

// Per-file UI state, keyed by file path inside a workspace. With
// multi-tab support each open file remembers its own mode + splitDiff
// independently — switching between two open tabs preserves each
// tab's view choice.
export interface WorkspaceFilePathState {
  mode: WorkspaceFileContentMode;
  source: WorkspaceFileOpenSource;
  splitDiff: boolean;
}

export type WorkspaceFileViewMap = Record<string, WorkspaceFilePathState>;

export const DEFAULT_WORKSPACE_FILE_PATH_STATE: WorkspaceFilePathState = {
  mode: 'edit',
  source: 'all-files',
  splitDiff: false,
};

// Per-workspace right-aside UI state. Session-only — held by
// `SessionStore`, keyed by workspaceId. Defaults match the
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

// File-tab list per workspace (session-only; SessionStore owns it).
// Preview state is intentionally NOT carried here — that lives in its
// own per-workspace slot inside SessionStore.
export interface PersistedFileTab {
  readonly path: string;
}
