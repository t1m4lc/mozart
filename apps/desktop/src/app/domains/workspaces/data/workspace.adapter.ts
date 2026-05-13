import type { WorkspaceDto } from './workspace.dto';
import type { Workspace } from './workspace.model';

export function workspaceFromDto(dto: WorkspaceDto): Workspace {
  return {
    id: dto.workspace_id,
    projectId: dto.repo_id,
    title: dto.task_title,
    status: dto.ui_status,
    pinned: dto.pinned === 1,
    unread: dto.unread === 1,
    createdAt: new Date(dto.created_at),
  };
}

// Used when the UI mutates a workspace and pushes back to the backend.
// Only fields the UI is allowed to write are returned.
export function workspaceToDto(
  model: Partial<Workspace>,
): Partial<WorkspaceDto> {
  return {
    workspace_id: model.id,
    task_title: model.title,
    ui_status: model.status,
    pinned: model.pinned === undefined ? undefined : model.pinned ? 1 : 0,
    unread: model.unread === undefined ? undefined : model.unread ? 1 : 0,
  };
}
