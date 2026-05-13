import { InjectionToken } from '@angular/core';
import type { Project } from './project.model';

// Tauri-backed IO for the projects domain. Concrete impl bound in
// app.config.ts (wraps `add_repo` / `list_repos` from _bindings).
export interface ProjectsAdapter {
  add(path: string): Promise<Project>;
  list(): Promise<Project[]>;
  remove(id: string): Promise<void>;
}

export const PROJECTS_ADAPTER = new InjectionToken<ProjectsAdapter>(
  'PROJECTS_ADAPTER',
);
