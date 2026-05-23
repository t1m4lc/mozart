import { InjectionToken } from '@angular/core';
import type { Task } from './task.model';

// Tauri-backed IO for the tasks domain. Concrete impl bound in
// app.config.ts (wraps `list_tasks` from _bindings).
export interface TasksAdapter {
  list(projectId: string): Promise<Task[]>;
}

export const TASKS_ADAPTER = new InjectionToken<TasksAdapter>('TASKS_ADAPTER');
