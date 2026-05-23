// Public surface of `desktop-projects-data-access`. Facade, store,
// Tauri ports + DTO mapper for the projects domain. Tauri-bound
// concrete adapter lives in `apps/desktop/src/app/core/`.

export { ProjectsFacade } from './lib/project.facade';
export {
  ProjectStore,
  type GroupBy,
  type ProjectFilter,
} from './lib/project.store';
export {
  PROJECTS_ADAPTER,
  type BootstrapResult,
  type MergeMode,
  type ProjectsAdapter,
} from './lib/projects.adapter';
export {
  DIALOG_ADAPTER,
  type DialogAdapter,
} from './lib/dialog.adapter';
export {
  projectFromDto,
  type ProjectDto,
} from './lib/project.dto-mapper';
export { PROJECTS_MOCK } from './lib/projects.mock';
