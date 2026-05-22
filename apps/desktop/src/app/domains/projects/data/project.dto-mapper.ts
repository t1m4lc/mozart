import type { ProjectDto } from './project.dto';
import type { Project } from './project.model';

export function projectFromDto(dto: ProjectDto): Project {
  return {
    id: dto.repo_id,
    name: dto.display_name,
    path: dto.path,
    icon: dto.icon,
    hidden: dto.hidden,
    sortIndex: dto.sort_index,
    addedAt: new Date(dto.added_at),
    runCommand: dto.run_command ?? null,
  };
}
