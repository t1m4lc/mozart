// Public surface of the `workspaces` domain. DTOs, stores, and the
// DTO<->Model mapper are intentionally NOT re-exported. The IO port
// (WORKSPACES_ADAPTER) is exposed so app.config.ts can bind a Tauri
// implementation in one place.

export type { MergeAction, Workspace } from './data/workspace.model';
export {
  UI_WORKSPACE_STATUSES,
  getUiStatusMeta,
  type UiWorkspaceStatus,
  type UiWorkspaceStatusMeta,
} from './data/workspace-status';
export type { OpenInTool, OpenInToolId } from './data/open-in-tools';
export { IdeDetectionService } from './data/ide-detection.service';
export { WorkspacesFacade } from './data/workspace.facade';
export {
  workspaceRouteCommands,
  workspaceTabRouteCommands,
} from './data/workspace-tab-registry';
export {
  WORKSPACES_ADAPTER,
  type WorkspacesAdapter,
} from './data/workspaces.adapter';

export { WorkspaceDetailPage } from './feature-detail/workspace-detail.page';
export { FeatureChatTabBar } from './feature-chat-tab-bar';
export { FeatureWorkspaceAside } from './feature-workspace-aside';
export { FeatureWorkspaceMiddle } from './feature-workspace-middle';
export { FeatureFileContent } from './feature-file-content';
export {
  ConfirmReopenWorkspaceDialog,
  type ConfirmReopenWorkspaceContext,
} from './ui-confirm-reopen-workspace-dialog';

// Cross-domain reusable UI pieces consumed by `shell/` (the legal
// cross-domain composer). Kept out of consumer features inside this
// domain — they're sidebar/toolbar surfaces, not feature-detail
// components — but they ARE part of the public API.
export { WorkspaceRow } from './ui/workspace-row';
export { WorkspaceContextMenu } from './feature-workspace-context-menu';
export { WorkspaceEmptyState } from './ui/workspace-empty-state';
export { MergeActionMenu } from './ui/merge-action-menu';
