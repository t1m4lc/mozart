// Public surface of `desktop-repositories-data-access`. Facades,
// stores, and the Tauri adapter port for the repositories domain.
// Tauri-bound concrete adapter lives in `apps/desktop/src/app/core/`.

export {
  REPOSITORIES_ADAPTER,
  type ChangedFile,
  type FileViewEntry,
  type RepositoriesAdapter,
} from './lib/repositories.adapter';
export { RepositoriesFacade } from './lib/repositories.facade';
export {
  FileTreeCacheStore,
  type CachedChangedFiles,
  type CachedFileTree,
} from './lib/file-tree-cache.store';
export {
  FileViewsStore,
  type FileViewState,
} from './lib/file-views.store';
export {
  FileViewsFacade,
  type ReviewProgressCounts,
} from './lib/file-views.facade';
export {
  fileNodeFromDto,
  type FileNodeDto,
} from './lib/file-node.dto-mapper';
