// Public surface of the `workspaces` domain. DTOs, stores, and the
// DTO<->Model mapper are intentionally NOT re-exported. The IO port
// (WORKSPACES_ADAPTER) is exposed so app.config.ts can bind a Tauri
// implementation in one place.

export type { Workspace } from './data/workspace.model';
export {
  UI_WORKSPACE_STATUSES,
  getUiStatusMeta,
  type UiWorkspaceStatus,
  type UiWorkspaceStatusMeta,
} from './data/workspace-status';
export type { OpenInTool } from './data/open-in-tools';
export { WorkspacesFacade } from './data/workspace.facade';
export {
  WORKSPACES_ADAPTER,
  type WorkspacesAdapter,
} from './data/workspaces.adapter';

export { WorkspaceDetailPage } from './feature-detail/workspace-detail.page';
