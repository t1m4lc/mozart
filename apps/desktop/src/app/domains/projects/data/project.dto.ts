// Raw shape returned by the Tauri backend. Mirrors `Repo` from
// src-tauri/src/db/models.rs. Internal — never exported from the
// domain barrel.
export interface ProjectDto {
  repo_id: string;
  display_name: string;
  path: string;
  added_at: number; // unix ms
  // Atom 5 migration (002_repos_metadata.sql) adds the next two columns.
  icon: string | null;
  hidden: number; // SQLite 0/1
}
