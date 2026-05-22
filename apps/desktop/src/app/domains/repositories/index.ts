// Public surface of the `repositories` domain. DTOs, stores (when added),
// and Tauri-bound adapter implementations stay private to the domain.
// The IO port (REPOSITORIES_ADAPTER) is exposed so app.config.ts can
// bind a Tauri implementation in one place.

export type {
  FileChangeStatus,
  FileNode,
  FileNodeKind,
} from './data/file-node.model';
export { fileNodeFromDto } from './data/file-node.dto-mapper';
export { RepositoriesFacade } from './data/repositories.facade';
export {
  FileViewsFacade,
  type ReviewProgressCounts,
} from './data/file-views.facade';
export {
  REPOSITORIES_ADAPTER,
  type ChangedFile,
  type FileViewEntry as FileViewAdapterEntry,
  type RepositoriesAdapter,
} from './data/repositories.adapter';
export { FeatureFileTree } from './feature-file-tree';
export { FeatureFileDiff } from './feature-file-diff';
export {
  FeatureFileToolbar,
  type DiffMode,
  type FileMode,
  type FileViewedState,
} from './feature-file-toolbar';
export {
  FeatureCommitDialog,
  type CommitDialogContext,
} from './feature-commit-dialog';
export {
  FeatureCreatePrDialog,
  type CreatePrDialogContext,
} from './feature-create-pr-dialog';
export { UiChangesContextMenu } from './ui-changes-context-menu';
export {
  UiConfirmDiscardChangesDialog,
  type ConfirmDiscardChangesContext,
} from './ui-confirm-discard-changes-dialog';
