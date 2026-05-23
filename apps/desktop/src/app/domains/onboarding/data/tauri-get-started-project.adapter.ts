import { commands } from '../../../core/_bindings';
import { projectFromDto } from '@mozart/desktop-projects-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import type { GetStartedProjectAdapter } from './get-started-project.adapter';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

// Tauri-backed GetStartedProjectAdapter. Idempotent — repeated calls
// resolve to the same Project + Workspace IDs.
//
// The workspace DTO ↔ model mapping goes through
// `WorkspacesFacade.fromBootstrapPayload(...)` so this adapter doesn't
// reach into `workspaces/data/*` internals.
export function tauriGetStartedProjectAdapter(
  workspaces: WorkspacesFacade,
): GetStartedProjectAdapter {
  return {
    async ensure() {
      const dto = unwrap(await commands.createGetStartedProject());
      const project = projectFromDto(dto.repo);
      return {
        project,
        workspace: workspaces.fromBootstrapPayload(dto.workspace, project.id),
      };
    },
  };
}
