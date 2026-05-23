// Public surface of `desktop-ui-state-util`. Shape + defaults for the
// cross-domain UI state slices. No Angular DI, no signal store —
// data-access owns those.

export {
  DEFAULT_WORKSPACE_ASIDE_STATE,
  DEFAULT_WORKSPACE_FILE_VIEW_STATE,
  type WorkspaceAsideBottomTab,
  type WorkspaceAsideFilesView,
  type WorkspaceAsideState,
  type WorkspaceFileContentMode,
  type WorkspaceFileFlowState,
  type WorkspaceFileOpenOptions,
  type WorkspaceFileOpenSource,
  type WorkspaceFileViewFlow,
  type WorkspaceFileViewState,
} from './lib/ui-state.types';
