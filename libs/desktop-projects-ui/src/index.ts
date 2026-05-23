// Public surface of `desktop-projects-ui`. Dumb presentational
// components for the projects domain — no Tauri imports, no
// data-access service injection. Smart dialogs that need
// DIALOG_ADAPTER / ProjectsFacade live in `desktop-projects-feature`.

export { FeatureAddProject } from './lib/feature-add-project';
export { ProjectRow } from './lib/ui-project-row';
export { ProjectContextMenu } from './lib/ui-project-context-menu';
export { ProjectsHeaderContextMenu } from './lib/ui-projects-header-context-menu';
export { ProjectsEmptyState } from './lib/ui-projects-empty-state';
export { UiRadioCard } from './lib/ui-radio-card';
export {
  ConfirmDeleteProjectDialog,
  type ConfirmDeleteProjectContext,
} from './lib/ui-confirm-delete-project-dialog';
export {
  InitProjectDialog,
  type InitProjectContext,
} from './lib/ui-init-project-dialog';
