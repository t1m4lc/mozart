import { commands } from './_bindings';
import type { GitCheckAdapter } from '@mozart/desktop-onboarding-data-access';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

// Tauri-backed GitCheckAdapter. The Rust commands spawn `git --version`
// (argv, no shell) for `probe` and `git config --global --get` for
// `identity`. Both gracefully degrade to `null` so the onboarding step
// can render its own "missing" UI without thinking about exceptions.
export function tauriGitCheckAdapter(): GitCheckAdapter {
  return {
    async probe() {
      return unwrap(await commands.gitVersion());
    },
    async identity() {
      return unwrap(await commands.gitIdentity());
    },
  };
}
