import { commands } from '../../../core/_bindings';
import { projectFromDto } from '../../projects';
import { workspaceFromDto } from '../../workspaces/data/workspace.adapter';
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
export function tauriGetStartedProjectAdapter(): GetStartedProjectAdapter {
  return {
    async ensure() {
      const dto = unwrap(await commands.createGetStartedProject());
      const project = projectFromDto(dto.repo);
      return {
        project,
        workspace: workspaceFromDto(dto.workspace, project.id),
      };
    },
  };
}
