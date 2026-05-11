/**
 * `WorkspaceStore` — workspaces feature slice.
 *
 * State:
 *   - `all`: flat list of every workspace fetched from the backend.
 *   - `selectedWorkspaceId`: persisted to localStorage under
 *     `mozart.workspaces.selection`. Selection survives restarts.
 *   - `errorDetail`: most recent `MozartError`.
 *
 * Computed:
 *   - `byTask`: `Map<task_id, WorkspaceDto[]>` — F3-ready grouping
 *     (when a single task can have N candidate workspaces, this map
 *     stays the canonical view).
 *
 * Cross-store: `workspacesForProject(repoId)` reads `TaskStore.byProject`
 * to project the workspaces belonging to a given repo. WorkspaceStore
 * doesn't query the backend per-repo; instead it filters its full list.
 */
import { computed, inject } from '@angular/core';
import {
  setError,
  setLoaded,
  setLoading,
  withCallState,
  withDevtools,
  withStorageSync,
} from '@angular-architects/ngrx-toolkit';
import { tapResponse } from '@ngrx/operators';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { from, pipe } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { BindingsService } from '../services/bindings.service';
import { MozartError } from '../services/mozart-error';
import type { WorkspaceDto } from '../shared/schemas/bindings.schemas';
import { TaskStore } from './task.store';

interface WorkspaceState {
  readonly all: readonly WorkspaceDto[];
  readonly selectedWorkspaceId: string | null;
  readonly errorDetail: MozartError | null;
}

const initialWorkspaceState: WorkspaceState = {
  all: [],
  selectedWorkspaceId: null,
  errorDetail: null,
};

export const WorkspaceStore = signalStore(
  { providedIn: 'root' },
  withDevtools('workspaces'),
  withCallState({ collection: 'workspaces' }),
  withState<WorkspaceState>(initialWorkspaceState),
  withStorageSync({
    key: 'mozart.workspaces.selection',
    select: (s: WorkspaceState) => ({
      selectedWorkspaceId: s.selectedWorkspaceId,
    }),
  }),
  withComputed((state) => ({
    byTask: computed<ReadonlyMap<string, readonly WorkspaceDto[]>>(() => {
      const map = new Map<string, WorkspaceDto[]>();
      for (const w of state.all()) {
        const bucket = map.get(w.task_id);
        if (bucket) bucket.push(w);
        else map.set(w.task_id, [w]);
      }
      return map;
    }),
    selectedWorkspace: computed<WorkspaceDto | null>(
      () =>
        state.all().find((w) => w.workspace_id === state.selectedWorkspaceId()) ??
        null,
    ),
  })),
  withMethods((
    store,
    bindings = inject(BindingsService),
    tasks = inject(TaskStore),
  ) => ({
    refresh: rxMethod<void>(
      pipe(
        tap(() => {
          patchState(store, { errorDetail: null }, setLoading('workspaces'));
        }),
        switchMap(() =>
          from(bindings.listWorkspaces()).pipe(
            tapResponse({
              next: (all: readonly WorkspaceDto[]) => {
                patchState(store, { all }, setLoaded('workspaces'));
              },
              error: (e: unknown) => {
                const err =
                  e instanceof MozartError
                    ? e
                    : new MozartError(
                        'Db',
                        'Unexpected error loading workspaces',
                      );
                patchState(
                  store,
                  { errorDetail: err },
                  setError(err.message, 'workspaces'),
                );
              },
            }),
          ),
        ),
      ),
    ),
    select(id: string): void {
      patchState(store, { selectedWorkspaceId: id });
    },
    /**
     * Return every workspace whose `task_id` belongs to a task that
     * `TaskStore` has loaded for `repoId`. Returns `[]` if the
     * project's tasks haven't loaded yet.
     */
    workspacesForProject(repoId: string): readonly WorkspaceDto[] {
      const taskIds = new Set(
        (tasks.byProject().get(repoId) ?? []).map((t) => t.task_id),
      );
      if (taskIds.size === 0) return [];
      return store.all().filter((w) => taskIds.has(w.task_id));
    },
    /**
     * Create a workspace by delegating to the Rust `create_workspace`
     * command, then re-fetching the local list and selecting the newly
     * created workspace so the ChatPanel surfaces immediately.
     *
     * Note: we call `bindings.listWorkspaces()` directly here rather
     * than `store.refresh()` because `withMethods` can't reference its
     * own sibling methods through `store` at type-resolution time. The
     * effect is identical — both end up `patchState`-ing the `all`
     * slice.
     *
     * Errors are stored in `errorDetail` as a `MozartError` and re-
     * thrown so the dialog layer can keep itself open and render the
     * message inline. Non-`MozartError` rejections are wrapped as
     * `MozartError('Io', ...)` per the IPC convention.
     */
    async createWorkspace(
      repoId: string,
      baseBranch: string,
      taskText: string,
    ): Promise<WorkspaceDto> {
      try {
        const ws = await bindings.createWorkspace(repoId, baseBranch, taskText);
        const all = await bindings.listWorkspaces();
        patchState(
          store,
          { all, selectedWorkspaceId: ws.workspace_id },
          setLoaded('workspaces'),
        );
        return ws;
      } catch (err) {
        const mz =
          err instanceof MozartError
            ? err
            : new MozartError(
                'Io',
                err instanceof Error ? err.message : String(err),
              );
        patchState(store, { errorDetail: mz });
        throw mz;
      }
    },
  })),
  withHooks({
    onInit(store) {
      store.refresh();
    },
  }),
);
