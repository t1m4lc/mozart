// UI ViewModel for a Task. Internal in v0.1.0-beta.1 — no UI surface yet —
// but exposed via the facade so cross-domain consumers (WorkspacesFacade
// hydration) can read it. The 1:N task→workspace expansion lands in
// v1.0.0; v0.1.0-beta.1 keeps the 1:1 invariant.

export type TaskStatus = 'active' | 'archived';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  prompt: string;
  status: TaskStatus;
  createdAt: Date;
}
