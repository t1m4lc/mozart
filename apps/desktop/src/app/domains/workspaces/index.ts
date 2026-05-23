// Remaining surface of the in-app `workspaces` shim. util/data-access/ui
// layers live in `@mozart/desktop-workspaces-{util,data-access,ui}` libs;
// the smart feature shells stay here while their app-shell dependencies
// (LayoutService, ShellTopBar, FeatureWorkspaceTerminal,
// FeatureCreatePrDialog, core/_bindings events) aren't libbed.

export { WorkspaceDetailPage } from './feature-detail/workspace-detail.page';
export { FeatureChatTabBar } from './feature-chat-tab-bar';
export { FeatureWorkspaceAside } from './feature-workspace-aside';
export { FeatureWorkspaceMiddle } from './feature-workspace-middle';
export { FeatureFileContent } from './feature-file-content';
export { WorkspaceContextMenu } from './feature-workspace-context-menu';
