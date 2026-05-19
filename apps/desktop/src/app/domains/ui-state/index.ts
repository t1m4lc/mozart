// Public surface of the ui-state domain.
//
// Holds cross-cutting "what is selected / displayed" state — currently
// `activeWorkspaceId` and per-project sidebar expand state. Other
// domains import only this `index.ts` per the project's domain
// boundary rules.
//
// Theme preference, notification prefs, tour completion, and modal
// stack are intentionally NOT in this store — they have stable homes
// in their respective domains (shared-util-theme, profile,
// onboarding) and the HlmDialogService. See IMP-024 in the audit if
// consolidating them later is desired.

export { UiStateFacade } from './data/ui-state.facade';
export {
  DEFAULT_WORKSPACE_ASIDE_STATE,
  type WorkspaceAsideBottomTab,
  type WorkspaceAsideFilesView,
  type WorkspaceAsideState,
} from './data/ui-state.store';
