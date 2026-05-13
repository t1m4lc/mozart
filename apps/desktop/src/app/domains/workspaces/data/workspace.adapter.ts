import type { WorkspaceDto } from './workspace.dto';
import type { Workspace } from './workspace.model';

// DTO -> Model mapper. `projectId` is supplied by the caller — for
// freshly-created workspaces the projectId is the input to the create
// flow; for hydration it's looked up via the TaskStore using
// `dto.task_id -> task.projectId`. v0.0.1 keeps `ui_status` defaulted
// to 'backlog' until a future migration adds the kanban column.
export function workspaceFromDto(
  dto: WorkspaceDto,
  projectId: string,
): Workspace {
  return {
    id: dto.workspace_id,
    projectId,
    name: dto.name,
    status: 'backlog',
    pinned: dto.pinned,
    unread: dto.unread,
    pending: false,
    createdAt: new Date(dto.created_at),
  };
}
