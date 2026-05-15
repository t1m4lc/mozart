import { commands } from '../../../core/_bindings';
import type { GitCheckAdapter } from './git-check.adapter';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

// Tauri-backed GitCheckAdapter. The Rust command spawns
// `git --version` (argv, no shell) ; we surface the version string or
// null to the feature component.
export function tauriGitCheckAdapter(): GitCheckAdapter {
  return {
    async probe(): Promise<string | null> {
      return unwrap(await commands.gitVersion());
    },
  };
}
