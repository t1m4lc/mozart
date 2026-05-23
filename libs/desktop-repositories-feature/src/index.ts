// Public surface of `desktop-repositories-feature`. Smart components
// that combine the repositories data-access layer with UI primitives.
// Feature-create-pr-dialog stays in `apps/desktop/src/app/domains/`
// while the Tauri command bridge isn't libbed.

export { FeatureFileTree } from './lib/feature-file-tree';
export { FeatureFileDiff } from './lib/feature-file-diff';
export {
  FeatureFileToolbar,
  type DiffMode,
  type FileMode,
  type FileViewedState,
} from './lib/feature-file-toolbar';
export {
  FeatureCommitDialog,
  type CommitDialogContext,
} from './lib/feature-commit-dialog';
export { UiChangesContextMenu } from './lib/ui-changes-context-menu';
