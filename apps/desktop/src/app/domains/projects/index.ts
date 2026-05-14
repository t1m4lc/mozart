// Public surface of the `projects` domain. Stores and adapters stay
// private — features inject the facade.

export type { Project } from './data/project.model';
export type { GroupBy, ProjectFilter } from './data/project.store';
export { ProjectsFacade } from './data/project.facade';
export { DIALOG_ADAPTER, type DialogAdapter } from './data/dialog.adapter';
export {
  PROJECTS_ADAPTER,
  type ProjectsAdapter,
} from './data/projects.adapter';
export { projectFromDto } from './data/project.adapter';

export { FeatureAddProject } from './feature-add-project';
export { ProjectRow } from './ui-project-row';
export { ProjectContextMenu } from './ui-project-context-menu';
export { ProjectsHeaderContextMenu } from './ui-projects-header-context-menu';
export {
  ConfirmDeleteProjectDialog,
  type ConfirmDeleteProjectContext,
} from './ui-confirm-delete-project-dialog';
export {
  InitProjectDialog,
  type InitProjectContext,
} from './ui-init-project-dialog';
export { GroupByFilter } from './ui-group-by-filter';
export { ProjectsEmptyState } from './ui-projects-empty-state';
