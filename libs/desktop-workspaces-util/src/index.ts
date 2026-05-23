export type { MergeAction, Workspace } from './lib/workspace.model';
export {
  UI_WORKSPACE_STATUSES,
  getUiStatusMeta,
  type UiWorkspaceStatus,
  type UiWorkspaceStatusMeta,
} from './lib/workspace-status';
export {
  OPEN_IN_TOOLS,
  type OpenInTool,
  type OpenInToolId,
} from './lib/open-in-tools';
export { relativeTime } from './lib/util-relative-time';
export {
  WORKSPACE_NAME_POOL,
  generateWorkspaceName,
} from './lib/util-workspace-name';
export {
  CHAT_TAB_CAP,
  FILE_TAB_CAP,
  MAX_TABS,
  DEFAULT_CHAT_TITLE,
  NEW_CHAT_TITLE,
  type ChatTab,
  type FileTab,
  type TabKind,
  type WorkspaceTab,
} from './lib/workspace-tab.model';
export {
  workspaceRouteCommands,
  workspaceTabRouteCommands,
} from './lib/workspace-route';
export { type InstallState, type WorkspaceInstall } from './lib/install-state';
