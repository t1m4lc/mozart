// Public surface of `desktop-repositories-ui`. Dumb presentational
// components for the repositories domain — no Tauri imports, no
// feature-level state.

export { FileTreeRow } from './lib/ui-file-tree-row';
export { UiFileTreeSkeleton } from './lib/ui-file-tree-skeleton';
export {
  UiConfirmDiscardChangesDialog,
  type ConfirmDiscardChangesContext,
} from './lib/ui-confirm-discard-changes-dialog';
export { statusBadge, type StatusBadge } from './lib/util-status-badge';
