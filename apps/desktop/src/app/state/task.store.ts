/**
 * `TaskStore` — tasks feature slice.
 *
 * State:
 *   - `byProject`: `Map<repo_id, TaskDto[]>` — tasks grouped by their
 *     parent project. Sidebar reads this to render the task subtree
 *     beneath each project row.
 *   - `byId`: `Map<task_id, TaskDto>` — flat lookup for components
 *     that need a task's title from just its id (e.g. workspace items
 *     showing `tasks.title` as their primary label).
 *   - `errorDetail`: most recent `MozartError`.
 *
 * Cross-store wiring: an `effect()` inside `withHooks({ onInit })`
 * reads `ProjectStore.projects()` and dispatches `refreshFor(repo_id)`
 * for any project not yet loaded. The first run picks up the projects
 * fetched by `ProjectStore.onInit`.
 *
 * No `withStorageSync` — tasks are server-derived and always re-fetched.
 */
import { effect, inject } from '@angular/core';
import {
  setError,
  setLoaded,
  setLoading,
  withCallState,
  withDevtools,
} from '@angular-architects/ngrx-toolkit';
import { tapResponse } from '@ngrx/operators';
import {
  patchState,
  signalStore,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { from, pipe } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { BindingsService } from '../services/bindings.service';
import { MozartError } from '../services/mozart-error';
import type { TaskDto } from '../shared/schemas/bindings.schemas';
import { ProjectStore } from './project.store';

interface TaskState {
  readonly byProject: ReadonlyMap<string, readonly TaskDto[]>;
  readonly byId: ReadonlyMap<string, TaskDto>;
  readonly errorDetail: MozartError | null;
}

const initialTaskState: TaskState = {
  byProject: new Map(),
  byId: new Map(),
  errorDetail: null,
};

interface FetchOk {
  readonly repoId: string;
  readonly tasks: readonly TaskDto[];
}

export const TaskStore = signalStore(
  { providedIn: 'root' },
  withDevtools('tasks'),
  withCallState({ collection: 'tasks' }),
  withState<TaskState>(initialTaskState),
  withMethods((
    store,
    bindings = inject(BindingsService),
    projects = inject(ProjectStore),
  ) => {
    const ingest = (result: FetchOk): void => {
      const nextByProject = new Map(store.byProject());
      nextByProject.set(result.repoId, result.tasks);
      const nextById = new Map(store.byId());
      // Drop any prior tasks belonging to this repo, then ingest the
      // fresh list — handles tasks deleted upstream.
      for (const [taskId, task] of nextById) {
        if (task.repo_id === result.repoId) nextById.delete(taskId);
      }
      for (const t of result.tasks) nextById.set(t.task_id, t);
      patchState(
        store,
        { byProject: nextByProject, byId: nextById },
        setLoaded('tasks'),
      );
    };

    const handleError = (e: unknown): void => {
      const err =
        e instanceof MozartError
          ? e
          : new MozartError('Db', 'Unexpected error loading tasks');
      patchState(
        store,
        { errorDetail: err },
        setError(err.message, 'tasks'),
      );
    };

    return {
      refreshFor: rxMethod<string>(
        pipe(
          tap(() => {
            patchState(store, { errorDetail: null }, setLoading('tasks'));
          }),
          switchMap((repoId) =>
            from(
              bindings.listTasks(repoId).then(
                (tasks): FetchOk => ({ repoId, tasks }),
              ),
            ).pipe(
              tapResponse({
                next: ingest,
                error: handleError,
              }),
            ),
          ),
        ),
      ),
      refreshAll: rxMethod<void>(
        pipe(
          tap(() => {
            patchState(store, { errorDetail: null }, setLoading('tasks'));
          }),
          switchMap(() => {
            const repoIds = projects.projects().map((p) => p.repo_id);
            return from(
              Promise.all(
                repoIds.map(async (repoId): Promise<FetchOk> => ({
                  repoId,
                  tasks: await bindings.listTasks(repoId),
                })),
              ),
            ).pipe(
              tapResponse({
                next: (results: readonly FetchOk[]) => {
                  for (const r of results) ingest(r);
                },
                error: handleError,
              }),
            );
          }),
        ),
      ),
    };
  }),
  withHooks({
    onInit(store) {
      const projects = inject(ProjectStore);
      // Re-evaluate whenever the projects list changes — pick up any
      // repos that ProjectStore.refresh added.
      effect(() => {
        const knownRepos = projects.projects();
        const loaded = store.byProject();
        for (const p of knownRepos) {
          if (!loaded.has(p.repo_id)) store.refreshFor(p.repo_id);
        }
      });
    },
  }),
);
