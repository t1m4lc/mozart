// Public surface of `desktop-workspaces-ui`. Dumb visual components
// for the workspaces domain — no Tauri imports, no data-access service
// injection. Smart toolbar / feature shells live in
// `apps/desktop/src/app/domains/workspaces/` while their app-shell
// (LayoutService, FeatureWorkspaceAside, ShellTopBar) hasn't been libbed.

export { BranchPicker } from './lib/branch-picker';
export { ChatEmptyState } from './lib/chat-empty-state';
export { LlmIcon } from './lib/llm-icon';
export { MergeActionMenu } from './lib/merge-action-menu';
export { OpenInMenu } from './lib/open-in-menu';
export { RunActionMenu, type RunStatus } from './lib/run-action-menu';
export { TabItem } from './lib/tab-item';
export { WorkspaceAsideHeader } from './lib/workspace-aside-header';
export { WorkspaceEmptyState } from './lib/workspace-empty-state';
export { WorkspaceRow } from './lib/workspace-row';
export { WorkspaceStatusMenu } from './lib/workspace-status-menu';
export {
  WorkspaceTabBar,
  type TabRenameEvent,
} from './lib/workspace-tab-bar';
export {
  ConfirmReopenWorkspaceDialog,
  type ConfirmReopenWorkspaceContext,
} from './lib/ui-confirm-reopen-workspace-dialog';
