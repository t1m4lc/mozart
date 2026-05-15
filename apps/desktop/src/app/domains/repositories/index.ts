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
  REPOSITORIES_ADAPTER,
  type ChangedFile,
  type RepositoriesAdapter,
} from './data/repositories.adapter';
export { FeatureFileTree } from './feature-file-tree/feature-file-tree';
export { FeatureFileDiff } from './feature-file-diff/feature-file-diff';
export {
  FeatureCommitDialog,
  type CommitDialogContext,
} from './feature-commit-dialog/feature-commit-dialog';
export {
  parseUnifiedDiff,
  type DiffLine,
  type DiffLineKind,
} from './util-diff-parser/util-diff-parser';
