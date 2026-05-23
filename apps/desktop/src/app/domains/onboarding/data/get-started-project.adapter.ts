import { InjectionToken } from '@angular/core';
import type { Project } from '@mozart/desktop-projects-util';
import type { Workspace } from '../../workspaces';

// Port for the tour's "Get started" project bootstrap. Wraps the
// `create_get_started_project` Tauri command : returns the registered
// project + the auto-created `welcome-1` workspace. The DTO ↔ model
// mapping happens in the Tauri impl ; consumers receive plain Project +
// Workspace types from the existing domains.
export interface GetStartedResult {
  readonly project: Project;
  readonly workspace: Workspace;
}

export interface GetStartedProjectAdapter {
  ensure(): Promise<GetStartedResult>;
}

export const GET_STARTED_PROJECT_ADAPTER =
  new InjectionToken<GetStartedProjectAdapter>('GET_STARTED_PROJECT_ADAPTER');
