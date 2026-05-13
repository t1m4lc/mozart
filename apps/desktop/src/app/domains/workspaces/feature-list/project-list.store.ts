import { moveItemInArray } from '@angular/cdk/drag-drop';
import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { Project } from '../data/project.model';
import { PROJECTS_MOCK } from '../data/projects.mock';
import type { Workspace } from '../data/workspace.model';
import type { UiWorkspaceStatus } from '../data/workspace-status';

export type GroupBy = 'project' | 'status';

// 'all' = no filter applied; a Set restricts visible projects to those ids.
export type ProjectFilter = 'all' | ReadonlySet<string>;

interface State {
  projects: Project[];
  expandedIds: ReadonlySet<string>;
  activeWorkspaceId: string | null;
  hoveredProjectId: string | null;
  groupBy: GroupBy;
  projectFilter: ProjectFilter;
}

const initialState: State = {
  // TODO: remplacer par appel Tauri réel (list_projects_with_workspaces)
  projects: PROJECTS_MOCK,
  expandedIds: new Set(PROJECTS_MOCK.map((p) => p.id)),
  activeWorkspaceId: 'w1',
  hoveredProjectId: null,
  groupBy: 'project',
  projectFilter: 'all',
};

export const ProjectListStore = signalStore(
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

    const mutateWorkspace = (
      projectId: string,
      workspaceId: string,
      fn: (w: Workspace) => Workspace,
    ): void => {
      mutateProject(projectId, (p) => ({
        ...p,
        workspaces: p.workspaces.map((w) => (w.id === workspaceId ? fn(w) : w)),
      }));
    };

    return {
      setActive(workspaceId: string): void {
        patchState(store, { activeWorkspaceId: workspaceId });
      },
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
      // Reset project filter to "All projects" (no restriction).
      selectAllProjects(): void {
        patchState(store, { projectFilter: 'all' });
      },
      // Toggle a single project in the filter.
      //  - From 'all': starts a new filter containing just this project
      //    (selecting any specific project unchecks All projects).
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
      newWorkspace(projectId: string): string {
        const ws: Workspace = {
          id: `w${Date.now()}`,
          title: 'new-workspace',
          status: 'backlog',
          pinned: false,
          unread: false,
          createdAt: new Date(),
        };
        mutateProject(projectId, (p) => ({
          ...p,
          workspaces: [ws, ...p.workspaces],
        }));
        patchState(store, { activeWorkspaceId: ws.id });
        return ws.id;
      },
      archiveWorkspace(projectId: string, workspaceId: string): void {
        mutateProject(projectId, (p) => ({
          ...p,
          workspaces: p.workspaces.filter((w) => w.id !== workspaceId),
        }));
      },
      setWorkspaceStatus(
        projectId: string,
        workspaceId: string,
        status: UiWorkspaceStatus,
      ): void {
        mutateWorkspace(projectId, workspaceId, (w) => ({ ...w, status }));
      },
      toggleUnread(projectId: string, workspaceId: string): void {
        mutateWorkspace(projectId, workspaceId, (w) => ({
          ...w,
          unread: !w.unread,
        }));
      },
      togglePinned(projectId: string, workspaceId: string): void {
        mutateWorkspace(projectId, workspaceId, (w) => ({
          ...w,
          pinned: !w.pinned,
        }));
      },
      renameWorkspace(
        projectId: string,
        workspaceId: string,
        title: string,
      ): void {
        const next = title.trim();
        if (!next) return;
        mutateWorkspace(projectId, workspaceId, (w) => ({ ...w, title: next }));
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
