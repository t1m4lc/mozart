import { InjectionToken } from '@angular/core';

// Port for the onboarding wizard's Git detection. Wraps the
// `git_version` Tauri command added in Phase 6 / Atom 2. Returns
// `null` when Git is not on PATH ; the version string otherwise.
export interface GitCheckAdapter {
  probe(): Promise<string | null>;
}

export const GIT_CHECK_ADAPTER = new InjectionToken<GitCheckAdapter>(
  'GIT_CHECK_ADAPTER',
);
