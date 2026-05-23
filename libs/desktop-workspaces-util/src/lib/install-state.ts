// Per-workspace package-manager install state, surfaced to the chat
// empty-state checklist (step 4 — "Setup script completed.").
// In util so dumb UI (chat-empty-state) can type the input without
// reaching into the data-access lib.

export type InstallState =
  | 'idle'
  | 'running'
  | 'success'
  | 'failed'
  | 'no_package';

export interface WorkspaceInstall {
  readonly state: InstallState;
  readonly manager: string;
}
