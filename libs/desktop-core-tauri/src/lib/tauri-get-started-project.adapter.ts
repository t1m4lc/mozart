import { commands } from './_bindings';
import { projectFromDto } from '@mozart/desktop-projects-data-access';
import type { GetStartedProjectAdapter } from '@mozart/desktop-onboarding-data-access';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

// Tauri-backed GetStartedProjectAdapter. Idempotent — repeated calls
// resolve to the same Project. The caller creates the first workspace
// via the normal `createForPrompt` path.
export function tauriGetStartedProjectAdapter(): GetStartedProjectAdapter {
  return {
    async ensure() {
      const dto = unwrap(await commands.createGetStartedProject());
      return { project: projectFromDto(dto.repo) };
    },
  };
}
