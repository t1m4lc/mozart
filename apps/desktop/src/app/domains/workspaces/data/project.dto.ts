// Raw shape returned by the Tauri backend. Mirrors `Repo` + aggregated
// workspaces from src-tauri/src/db/models.rs. Internal — never exported
// from the domain barrel.

import type { WorkspaceDto } from './workspace.dto';

export interface ProjectDto {
  repo_id: string;
  display_name: string;
  path: string;
  added_at: number; // unix ms
  // Planned new columns — see MIGRATIONS in the refactor doc.
  icon: string | null;
  hidden: number; // SQLite 0/1
  workspaces: WorkspaceDto[];
}
