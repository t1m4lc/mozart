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
    /**
     * Add a repository at `path`. Calls `BindingsService.addRepo`, then
     * re-fetches the projects list (so the new repo is visible) and
     * auto-selects it so the sidebar surface immediately reflects the
     * change.
     *
     * Note: we call `bindings.listRepos()` directly here rather than
     * `store.refresh()` because `withMethods` can't reference its own
     * sibling methods through `store` at type-resolution time. The
     * effect is identical — both end up `patchState`-ing the projects
     * slice.
     *
     * Errors are stored in `errorDetail` as a `MozartError` and re-
     * thrown so the dialog layer can keep itself open and render the
     * message inline. Non-`MozartError` rejections are wrapped as
     * `MozartError('Io', ...)` per the IPC convention.
     */
    async addRepo(path: string): Promise<RepoDto> {
      try {
        const repo = await bindings.addRepo(path);
        const projects = await bindings.listRepos();
        patchState(
          store,
          { projects, selectedProjectId: repo.repo_id },
          setLoaded('projects'),
        );
        return repo;
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
