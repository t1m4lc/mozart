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

interface State {
  projects: Project[];
  expandedIds: ReadonlySet<string>;
  activeWorkspaceId: string | null;
  hoveredProjectId: string | null;
  groupBy: GroupBy;
}

const initialState: State = {
  // TODO: remplacer par appel Tauri réel (list_projects_with_workspaces)
  projects: PROJECTS_MOCK,
  expandedIds: new Set(PROJECTS_MOCK.map((p) => p.id)),
  activeWorkspaceId: 'w1',
  hoveredProjectId: null,
  groupBy: 'project',
};

export const ProjectListStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ projects }) => ({
    visibleProjects: computed(() => projects().filter((p) => !p.hidden)),
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
      setGroupBy(group: GroupBy): void {
        patchState(store, { groupBy: group });
      },
      newWorkspace(projectId: string): void {
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
      hideProject(projectId: string): void {
        mutateProject(projectId, (p) => ({ ...p, hidden: true }));
      },
      removeProject(projectId: string): void {
        patchState(store, {
          projects: store.projects().filter((p) => p.id !== projectId),
        });
      },
    };
  }),
);
