import type { Project } from '@mozart/desktop-projects-util';

// Wire shape returned by the Tauri `list_repos` command. Declared
// locally so this lib has no inbound dep on apps/_bindings — the
// desktop app passes its generated `Repo` DTO into the mapper and
// TypeScript structural typing closes the bridge.
export interface ProjectDto {
  readonly repo_id: string;
  readonly display_name: string;
  readonly path: string;
  readonly icon: string | null;
  readonly hidden: boolean;
  readonly sort_index: number;
  readonly added_at: number;
  readonly run_command?: string | null;
  readonly setup_command?: string | null;
}

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
    setupCommand: dto.setup_command ?? null,
  };
}
