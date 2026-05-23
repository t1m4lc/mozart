import { InjectionToken } from '@angular/core';

/** Global `user.name` + `user.email` from `git config`. */
export interface GitIdentity {
  readonly name: string;
  readonly email: string;
}

// Port for the onboarding wizard's Git detection. Wraps the
// `git_version` + `git_identity` Tauri commands. `probe` returns
// `null` when Git is not on PATH (UI shows the install card) ; the
// version string otherwise. `identity` returns `null` when either
// `user.name` or `user.email` is missing (UI nudges the user to set
// them — workspaces won't be creatable without an identity).
export interface GitCheckAdapter {
  probe(): Promise<string | null>;
  identity(): Promise<GitIdentity | null>;
}

export const GIT_CHECK_ADAPTER = new InjectionToken<GitCheckAdapter>(
  'GIT_CHECK_ADAPTER',
);
