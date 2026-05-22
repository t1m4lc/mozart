// Public surface of the `tasks` domain. Data-only in v0.1.0-beta.1 — no UI
// features yet. The store is intentionally NOT re-exported.

export type { Task, TaskStatus } from './data/task.model';
export { TasksFacade } from './data/task.facade';
export { TASKS_ADAPTER, type TasksAdapter } from './data/tasks.adapter';
export { taskFromDto } from './data/task.dto-mapper';
