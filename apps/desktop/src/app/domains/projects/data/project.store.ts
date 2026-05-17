import { moveItemInArray } from '@angular/cdk/drag-drop';
import { computed } from '@angular/core';
import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { Project } from './project.model';

export type GroupBy = 'project' | 'status';

// 'all' = no filter applied; a Set restricts visible projects to those ids.
export type ProjectFilter = 'all' | ReadonlySet<string>;

interface State {
  projects: Project[];
  hoveredProjectId: string | null;
  groupBy: GroupBy;
  projectFilter: ProjectFilter;
}

// v0.1.0-beta.1: hydrated from Tauri at boot via ProjectsFacade.loadAll(). The
// mock seed in projects.mock.ts is kept for component tests / Storybook
// but is no longer the initial state.
//
// Sidebar expand state (`expandedProjectIds`) lives in
// `domains/ui-state/` per Phase 7 conventions §1.3.
const initialState: State = {
  projects: [],
  hoveredProjectId: null,
  groupBy: 'project',
  projectFilter: 'all',
};

export const ProjectStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('projects'),
  withComputed(({ projects, projectFilter }) => ({
    visibleProjects: computed(() => {
      const filter = projectFilter();
      return projects().filter((p) => {
        if (p.hidden) return false;
        if (filter === 'all') return true;
        return filter.has(p.id);
      });
    }),
    allProjectsSelected: computed(() => projectFilter() === 'all'),
  })),
  withMethods((store) => {
    const mutateProject = (
      projectId: string,
      fn: (p: Project) => Project,
    ): void => {
      patchState(store, {
        projects: store
          .projects()
          .map((p) => (p.id === projectId ? fn(p) : p)),
      });
    };

    return {
      setHovered(projectId: string | null): void {
        patchState(store, { hoveredProjectId: projectId });
      },
      setGroupBy(group: GroupBy): void {
        patchState(store, { groupBy: group });
      },
      selectAllProjects(): void {
        patchState(store, { projectFilter: 'all' });
      },
      // Toggle a single project in the filter.
      //  - From 'all': starts a new filter containing just this project.
      //  - Already in set: remove. If the resulting set is empty, fall
      //    back to 'all' so the list never goes blank.
      //  - Not in set: add.
      toggleProjectInFilter(projectId: string): void {
        const current = store.projectFilter();
        if (current === 'all') {
          patchState(store, { projectFilter: new Set([projectId]) });
          return;
        }
        const next = new Set(current);
        if (next.has(projectId)) next.delete(projectId);
        else next.add(projectId);
        patchState(store, {
          projectFilter: next.size === 0 ? 'all' : next,
        });
      },
      // Replaces the entire collection. Used by hydration. Expand
      // state lives in domains/ui-state/ — the facade reconciles it
      // against the new id set so a stale expansion for a removed
      // project gets dropped.
      setAll(projects: readonly Project[]): void {
        patchState(store, { projects: [...projects] });
      },

      // Adds or replaces a single project, preserving order. New rows
      // land at the head (newest first). Auto-expanding the new row
      // happens in the facade (so the expand state stays in ui-state).
      upsertProject(project: Project): void {
        const existingIdx = store
          .projects()
          .findIndex((p) => p.id === project.id);
        if (existingIdx === -1) {
          patchState(store, {
            projects: [project, ...store.projects()],
          });
        } else {
          patchState(store, {
            projects: store
              .projects()
              .map((p, i) => (i === existingIdx ? project : p)),
          });
        }
      },
      hideProject(projectId: string): void {
        mutateProject(projectId, (p) => ({ ...p, hidden: true }));
      },
      setHidden(projectId: string, hidden: boolean): void {
        mutateProject(projectId, (p) => ({ ...p, hidden }));
      },
      setIcon(projectId: string, icon: string | null): void {
        mutateProject(projectId, (p) => ({ ...p, icon }));
      },
      setRunCommand(projectId: string, runCommand: string | null): void {
        mutateProject(projectId, (p) => ({ ...p, runCommand }));
      },
      removeProject(projectId: string): void {
        patchState(store, {
          projects: store.projects().filter((p) => p.id !== projectId),
        });
      },
      // Replace the full project list (used by rollback). Skips the
      // expanded-state intersection so callers can restore an exact
      // pre-mutation snapshot.
      replaceAll(projects: readonly Project[]): void {
        patchState(store, { projects: [...projects] });
      },
      // Indices come from the rendered list (visibleProjects), so we
      // resolve them to ids and reorder the source array by id.
      // Hidden projects keep their relative order at the tail.
      reorderProjects(prevIndex: number, currentIndex: number): void {
        if (prevIndex === currentIndex) return;
        const visible = [...store.visibleProjects()];
        if (
          prevIndex < 0 ||
          prevIndex >= visible.length ||
          currentIndex < 0 ||
          currentIndex >= visible.length
        ) {
          return;
        }
        moveItemInArray(visible, prevIndex, currentIndex);
        const hidden = store.projects().filter((p) => p.hidden);
        patchState(store, { projects: [...visible, ...hidden] });
      },
    };
  }),
);
