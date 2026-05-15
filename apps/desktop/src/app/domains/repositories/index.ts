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
  type RepositoriesAdapter,
} from './data/repositories.adapter';
export { FeatureFileTree } from './feature-file-tree/feature-file-tree';
