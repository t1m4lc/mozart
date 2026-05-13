// DTO <-> Model mappers as plain functions (no class indirection).

import type { TaskDto } from './task.dto';
import type { Task, TaskStatus } from './task.model';

export function taskFromDto(dto: TaskDto): Task {
  return {
    id: dto.task_id,
    projectId: dto.repo_id,
    title: dto.title,
    prompt: dto.task_text,
    status: narrowStatus(dto.status),
    createdAt: new Date(dto.created_at),
  };
}

function narrowStatus(status: string): TaskStatus {
  return status === 'archived' ? 'archived' : 'active';
}
