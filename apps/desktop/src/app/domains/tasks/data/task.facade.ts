import { Injectable, computed, inject } from '@angular/core';
import type { Task } from './task.model';
import { TaskStore } from './task.store';
import { TASKS_ADAPTER } from './tasks.adapter';

// Public API of the `tasks` domain. Data-only in v0.1.0-beta.1 — no UI feature
// imports this directly. WorkspacesFacade injects it during hydration
// to resolve `workspace.task_id -> task.repo_id -> workspace.projectId`.
@Injectable({ providedIn: 'root' })
export class TasksFacade {
  private readonly store = inject(TaskStore);
  private readonly adapter = inject(TASKS_ADAPTER);

  readonly all = this.store.tasks;

  byId(id: string) {
    return computed(() => this.store.tasks().find((t) => t.id === id) ?? null);
  }

  forProject(projectId: string) {
    return computed(() => this.store.byProject().get(projectId) ?? []);
  }

  async loadForProject(projectId: string): Promise<void> {
    const tasks = await this.adapter.list(projectId);
    this.store.setForProject(projectId, tasks);
  }

  upsertOne(task: Task): void {
    this.store.upsertOne(task);
  }

  removeForProject(projectId: string): void {
    this.store.removeForProject(projectId);
  }
}
