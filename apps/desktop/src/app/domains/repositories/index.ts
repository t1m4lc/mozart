// Public surface of the `repositories` domain. DTOs, stores (when added),
// and Tauri-bound adapter implementations stay private to the domain.
// The IO port (REPOSITORIES_ADAPTER) is exposed so app.config.ts can
// bind a Tauri implementation in one place.

export type {
  FileChangeStatus,
  FileNode,
  FileNodeKind,
} from './data/file-node.model';
export { fileNodeFromDto } from './data/file-node.adapter';
export { RepositoriesFacade } from './data/repositories.facade';
export {
  FileViewsFacade,
  type ReviewProgressCounts,
} from './data/file-views.facade';
export {
  FileViewsStore,
  type FileViewEntry,
  type FileViewState,
} from './data/file-views.store';
export {
  REPOSITORIES_ADAPTER,
  type ChangedFile,
  type FileViewEntry as FileViewAdapterEntry,
  type RepositoriesAdapter,
} from './data/repositories.adapter';
export { FeatureFileTree } from './feature-file-tree/feature-file-tree';
export { FeatureFileDiff } from './feature-file-diff/feature-file-diff';
export {
  FeatureFileToolbar,
  type DiffMode,
  type FileMode,
  type FileViewedState,
} from './feature-file-toolbar/feature-file-toolbar';
export {
  FeatureCommitDialog,
  type CommitDialogContext,
} from './feature-commit-dialog/feature-commit-dialog';
export {
  FeatureCreatePrDialog,
  type CreatePrDialogContext,
} from './feature-create-pr-dialog/feature-create-pr-dialog';
export {
  parseUnifiedDiff,
  type DiffLine,
  type DiffLineKind,
} from './util-diff-parser/util-diff-parser';
export { UiChangesContextMenu } from './ui-changes-context-menu/ui-changes-context-menu';
export {
  UiConfirmDiscardChangesDialog,
  type ConfirmDiscardChangesContext,
} from './ui-confirm-discard-changes-dialog/ui-confirm-discard-changes-dialog';
