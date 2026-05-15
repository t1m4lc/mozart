import { InjectionToken } from '@angular/core';
import type { Project } from './project.model';

// Tauri-backed IO for the projects domain. Concrete impl bound in
// app.config.ts (wraps `add_repo` / `list_repos` / mutators from
// _bindings).
export interface ProjectsAdapter {
  add(path: string): Promise<Project>;
  // Runs `git init` + identity config + an initial empty commit at
  // `path`. Called after the user confirms the Initialize-project
  // dialog when add() throws NotARepo.
  initRepo(path: string): Promise<void>;
  // git clone <url> into <destDir>/<derived-name>. Returns the absolute
  // path of the cloned folder so the caller can hand it to add().
  cloneRepo(url: string, destDir: string): Promise<string>;
  // Creates an empty `<parent>/<name>` directory for Quick start.
  // Refuses if the target already exists. Returns the absolute path.
  createProjectFolder(parent: string, name: string): Promise<string>;
  list(): Promise<Project[]>;
  remove(id: string): Promise<void>;
  setIcon(id: string, icon: string | null): Promise<void>;
  setHidden(id: string, hidden: boolean): Promise<void>;
  setSort(orderedIds: readonly string[]): Promise<void>;
  /** Persist the project's run command. Pass `null` to clear. */
  setRunCommand(id: string, command: string | null): Promise<void>;
}

export const PROJECTS_ADAPTER = new InjectionToken<ProjectsAdapter>(
  'PROJECTS_ADAPTER',
);
