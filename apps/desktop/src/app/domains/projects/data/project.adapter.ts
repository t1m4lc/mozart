import type { ProjectDto } from './project.dto';
import type { Project } from './project.model';

// v0.0.1: `icon` and `hidden` are client-only — no DB column yet —
// so they default safely on hydration. A future migration adds them
// to the `repos` table, at which point this mapper reads them
// directly from the DTO.
export function projectFromDto(dto: ProjectDto): Project {
  return {
    id: dto.repo_id,
    name: dto.display_name,
    path: dto.path,
    icon: null,
    hidden: false,
    addedAt: new Date(dto.added_at),
  };
}
