// Public surface of the `workspaces` domain. DTOs, stores, and adapters
// are intentionally NOT re-exported.

export type { Workspace } from './data/workspace.model';
export {
  UI_WORKSPACE_STATUSES,
  getUiStatusMeta,
  type UiWorkspaceStatus,
  type UiWorkspaceStatusMeta,
} from './data/workspace-status';
export type { OpenInTool } from './data/open-in-tools';
export { WorkspacesFacade } from './data/workspace.facade';

export { WorkspaceDetailPage } from './feature-detail/workspace-detail.page';
