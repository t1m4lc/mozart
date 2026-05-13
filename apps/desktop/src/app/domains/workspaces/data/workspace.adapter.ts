import type { UiWorkspaceStatus } from './workspace-status';
import type { WorkspaceDto } from './workspace.dto';
import type { Workspace } from './workspace.model';

// DTO -> Model mapper. `projectId` is supplied by the caller — for
// freshly-created workspaces the projectId is the input to the create
// flow; for hydration it's looked up via the TaskStore using
// `dto.task_id -> task.projectId`.
export function workspaceFromDto(
  dto: WorkspaceDto,
  projectId: string,
): Workspace {
  return {
    id: dto.workspace_id,
    projectId,
    name: dto.name,
    status: coerceUiStatus(dto.ui_status),
    pinned: dto.pinned,
    unread: dto.unread,
    pending: false,
    createdAt: new Date(dto.created_at),
  };
}

const ALLOWED: ReadonlySet<UiWorkspaceStatus> = new Set([
  'backlog',
  'in_progress',
  'in_review',
  'done',
  'canceled',
]);

function coerceUiStatus(raw: string): UiWorkspaceStatus {
  return ALLOWED.has(raw as UiWorkspaceStatus)
    ? (raw as UiWorkspaceStatus)
    : 'backlog';
}
