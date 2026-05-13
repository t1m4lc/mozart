// Public surface of the `workspaces` domain.
// DTOs and adapters are intentionally NOT re-exported — they are
// implementation details and stay reachable only through deep imports
// inside the domain.

export type { Project } from './data/project.model';
export type { Workspace } from './data/workspace.model';
export {
  UI_WORKSPACE_STATUSES,
  getUiStatusMeta,
  type UiWorkspaceStatus,
  type UiWorkspaceStatusMeta,
} from './data/workspace-status';
export type { OpenInTool } from './data/open-in-tools';

export { ProjectListContainer } from './feature-list/project-list.container';
export { WorkspaceDetailPage } from './feature-detail/workspace-detail.page';
export { GroupByFilter } from './ui/group-by-filter/group-by-filter';
export { ProjectsHeaderContextMenu } from './ui/projects-header-context-menu/projects-header-context-menu';
