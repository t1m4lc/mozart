/**
 * `ProjectStore` — projects (repos) feature slice.
 *
 * State:
 *   - `projects`: server-derived `RepoDto[]` (NOT persisted).
 *   - `selectedProjectId`: currently focused project, persisted to
 *     localStorage under `mozart.projects.selection`.
 *   - `expandedProjectIds`: which projects are expanded in the sidebar
 *     (read-only array — Sets aren't JSON-serialisable).
 *   - `errorDetail`: the most recent `MozartError` from a refresh.
 *
 * The `withCallState({ collection: 'projects' })` feature exposes
 * `projectsLoading()`, `projectsLoaded()`, `projectsError()` signals
 * consumed by the sidebar component states.
 *
 * F-headroom: when projects move to 1:N tasks, `selectedProjectId`
 * stays a string scalar; downstream `TaskStore` keys by `repo_id`.
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
import type { RepoDto } from '../shared/schemas/bindings.schemas';

interface ProjectState {
  readonly projects: readonly RepoDto[];
  readonly selectedProjectId: string | null;
  readonly expandedProjectIds: readonly string[];
  readonly errorDetail: MozartError | null;
}

const initialProjectState: ProjectState = {
  projects: [],
  selectedProjectId: null,
  expandedProjectIds: [],
  errorDetail: null,
};

export const ProjectStore = signalStore(
  { providedIn: 'root' },
  withDevtools('projects'),
  withCallState({ collection: 'projects' }),
  withState<ProjectState>(initialProjectState),
  withStorageSync({
    key: 'mozart.projects.selection',
    // Persist ONLY the selection slice — server-derived `projects`
    // come back from the bindings layer on every store init.
    select: (s: ProjectState) => ({
      selectedProjectId: s.selectedProjectId,
      expandedProjectIds: s.expandedProjectIds,
    }),
  }),
  withComputed((state) => ({
    selectedProject: computed<RepoDto | null>(
      () =>
        state.projects().find((p) => p.repo_id === state.selectedProjectId()) ??
        null,
    ),
  })),
  withMethods((store, bindings = inject(BindingsService)) => ({
    refresh: rxMethod<void>(
      pipe(
        tap(() => {
          patchState(store, { errorDetail: null }, setLoading('projects'));
        }),
        switchMap(() =>
          from(bindings.listRepos()).pipe(
            tapResponse({
              next: (projects: readonly RepoDto[]) => {
                const current = store.selectedProjectId();
                patchState(
                  store,
                  {
                    projects,
                    selectedProjectId:
                      current ?? projects[0]?.repo_id ?? null,
                  },
                  setLoaded('projects'),
                );
              },
              error: (e: unknown) => {
                const err =
                  e instanceof MozartError
                    ? e
                    : new MozartError(
                        'Db',
                        'Unexpected error loading projects',
                      );
                patchState(
                  store,
                  { errorDetail: err },
                  setError(err.message, 'projects'),
                );
              },
            }),
          ),
        ),
      ),
    ),
    select(id: string): void {
      patchState(store, { selectedProjectId: id });
    },
    toggleExpanded(id: string): void {
      const current = store.expandedProjectIds();
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      patchState(store, { expandedProjectIds: next });
    },
  })),
  withHooks({
    onInit(store) {
      store.refresh();
    },
  }),
);
