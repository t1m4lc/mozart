import { moveItemInArray } from '@angular/cdk/drag-drop';
import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { Project } from './project.model';
import { PROJECTS_MOCK } from './projects.mock';

export type GroupBy = 'project' | 'status';

// 'all' = no filter applied; a Set restricts visible projects to those ids.
export type ProjectFilter = 'all' | ReadonlySet<string>;

interface State {
  projects: Project[];
  expandedIds: ReadonlySet<string>;
  hoveredProjectId: string | null;
  groupBy: GroupBy;
  projectFilter: ProjectFilter;
}

const initialState: State = {
  projects: PROJECTS_MOCK,
  expandedIds: new Set(PROJECTS_MOCK.map((p) => p.id)),
  hoveredProjectId: null,
  groupBy: 'project',
  projectFilter: 'all',
};

export const ProjectStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
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
      toggleExpanded(projectId: string): void {
        const next = new Set(store.expandedIds());
        if (next.has(projectId)) next.delete(projectId);
        else next.add(projectId);
        patchState(store, { expandedIds: next });
      },
      isExpanded(projectId: string): boolean {
        return store.expandedIds().has(projectId);
      },
      expandAll(): void {
        patchState(store, {
          expandedIds: new Set(store.projects().map((p) => p.id)),
        });
      },
      collapseAll(): void {
        patchState(store, { expandedIds: new Set<string>() });
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
      // Idempotent on `path`. If a project already lives at the same
      // path, returns it untouched. Otherwise inserts at the head and
      // returns the new row.
      addProject(input: {
        name: string;
        path: string;
        icon?: string | null;
      }): { project: Project; alreadyExisted: boolean } {
        const existing = store.projects().find((p) => p.path === input.path);
        if (existing) {
          return { project: existing, alreadyExisted: true };
        }
        const project: Project = {
          id:
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `p${Date.now()}`,
          name: input.name,
          path: input.path,
          icon: input.icon ?? null,
          hidden: false,
          addedAt: new Date(),
        };
        patchState(store, {
          projects: [project, ...store.projects()],
          expandedIds: new Set([project.id, ...store.expandedIds()]),
        });
        return { project, alreadyExisted: false };
      },
      hideProject(projectId: string): void {
        mutateProject(projectId, (p) => ({ ...p, hidden: true }));
      },
      removeProject(projectId: string): void {
        patchState(store, {
          projects: store.projects().filter((p) => p.id !== projectId),
        });
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
