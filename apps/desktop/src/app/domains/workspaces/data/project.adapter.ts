import type { ProjectDto } from './project.dto';
import type { Project } from './project.model';
import { workspaceFromDto } from './workspace.adapter';

export function projectFromDto(dto: ProjectDto): Project {
  return {
    id: dto.repo_id,
    title: dto.display_name,
    path: dto.path,
    icon: dto.icon,
    hidden: dto.hidden === 1,
    addedAt: new Date(dto.added_at),
    workspaces: dto.workspaces.map(workspaceFromDto),
  };
}

export function projectToDto(model: Partial<Project>): Partial<ProjectDto> {
  return {
    repo_id: model.id,
    display_name: model.title,
    path: model.path,
    icon: model.icon,
    hidden: model.hidden === undefined ? undefined : model.hidden ? 1 : 0,
  };
}
