// Public surface of `desktop-tasks-data-access`. Data-only — no UI
// features in v0.1.0-beta.1. The store stays internal; cross-domain
// consumers (WorkspacesFacade hydration, tauri-adapters wiring) go
// through this barrel.

export type { Task, TaskStatus } from './lib/task.model';
export type { TaskDto } from './lib/task.dto';
export { TasksFacade } from './lib/task.facade';
export { TASKS_ADAPTER, type TasksAdapter } from './lib/tasks.adapter';
export { taskFromDto } from './lib/task.dto-mapper';
