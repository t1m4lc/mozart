import { InjectionToken } from '@angular/core';
import type { Project } from '@mozart/desktop-projects-util';

// Port for the tour's "Get started" project bootstrap. Wraps the
// `create_get_started_project` Tauri command : returns the registered
// project. The first workspace is created by the caller via the normal
// `WorkspacesFacade.createForPrompt` path (generated name +
// auto-install). The DTO ↔ model mapping happens in the Tauri impl ;
// consumers receive a plain Project from the existing domain.
export interface GetStartedResult {
  readonly project: Project;
}

export interface GetStartedProjectAdapter {
  ensure(): Promise<GetStartedResult>;
}

export const GET_STARTED_PROJECT_ADAPTER =
  new InjectionToken<GetStartedProjectAdapter>('GET_STARTED_PROJECT_ADAPTER');
