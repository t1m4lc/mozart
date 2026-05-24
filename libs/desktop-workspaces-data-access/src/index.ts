export {
  WorkspacesFacade,
  type InstallState,
  type WorkspaceInstall,
} from './lib/workspace.facade';
export { WorkspaceStore } from './lib/workspace.store';
export {
  WORKSPACES_ADAPTER,
  type CreatedPr,
  type InstallPackagesResult,
  type MergeOutcome,
  type WorkspaceDiffStatsEntry,
  type WorkspacesAdapter,
} from './lib/workspaces.adapter';
export {
  workspaceFromDto,
  type WorkspaceDto,
} from './lib/workspace.dto-mapper';
export { WORKSPACES_MOCK } from './lib/workspaces.mock';
export { IdeDetectionService } from './lib/ide-detection.service';
export { FileTabsService } from './lib/file-tabs.service';
export {
  ScrollPositionService,
  chatTabKey,
  fileTabKey,
  type FollowMode,
} from './lib/scroll-position.service';
export {
  WorkspaceTabRegistry,
  type ChatWorkspaceTab,
  type FileWorkspaceTab,
  type ReviewWorkspaceTab,
  type RunWorkspaceTab,
  type TerminalWorkspaceTab,
  type WorkspaceTab as ParsedWorkspaceTab,
  type WorkspaceTabKind,
} from './lib/workspace-tab-registry';
export {
  WorkspaceTabResolver,
  type WorkspaceTabResolution,
} from './lib/workspace-tab-resolver.service';
export { WorkspaceDetailStore } from './lib/workspace-detail.store';
export {
  tabMatcher,
  workspaceTabCanActivate,
} from './lib/workspace-tab-routes';
