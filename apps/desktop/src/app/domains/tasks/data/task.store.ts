import { computed } from '@angular/core';
import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { Task } from './task.model';

interface State {
  tasks: Task[];
}

const initialState: State = {
  tasks: [],
};

export const TaskStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('tasks'),
  withComputed(({ tasks }) => ({
    byProject: computed(() => {
      const map = new Map<string, Task[]>();
      for (const t of tasks()) {
        const list = map.get(t.projectId);
        if (list) list.push(t);
        else map.set(t.projectId, [t]);
      }
      return map;
    }),
  })),
  withMethods((store) => ({
    // Replaces every task for `projectId`. Other projects are untouched
    // so partial hydration (project A loads first, then B) is safe.
    setForProject(projectId: string, next: readonly Task[]): void {
      const others = store.tasks().filter((t) => t.projectId !== projectId);
      patchState(store, { tasks: [...others, ...next] });
    },
    upsertOne(task: Task): void {
      const existingIdx = store.tasks().findIndex((t) => t.id === task.id);
      if (existingIdx === -1) {
        patchState(store, { tasks: [...store.tasks(), task] });
      } else {
        patchState(store, {
          tasks: store.tasks().map((t, i) => (i === existingIdx ? task : t)),
        });
      }
    },
    removeForProject(projectId: string): void {
      patchState(store, {
        tasks: store.tasks().filter((t) => t.projectId !== projectId),
      });
    },
  })),
);
