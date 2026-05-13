import type { ProjectDto } from './project.dto';
import type { Project } from './project.model';

export function projectFromDto(dto: ProjectDto): Project {
  return {
    id: dto.repo_id,
    name: dto.display_name,
    path: dto.path,
    icon: dto.icon,
    hidden: dto.hidden === 1,
    addedAt: new Date(dto.added_at),
  };
}

export function projectToDto(model: Partial<Project>): Partial<ProjectDto> {
  return {
    repo_id: model.id,
    display_name: model.name,
    path: model.path,
    icon: model.icon,
    hidden: model.hidden === undefined ? undefined : model.hidden ? 1 : 0,
  };
}
