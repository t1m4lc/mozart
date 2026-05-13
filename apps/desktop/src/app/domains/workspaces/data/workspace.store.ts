import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { generateWorkspaceName } from '../util-workspace-name';
import type { UiWorkspaceStatus } from './workspace-status';
import type { Workspace } from './workspace.model';
import { WORKSPACES_MOCK } from './workspaces.mock';

interface State {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
}

const initialState: State = {
  workspaces: WORKSPACES_MOCK,
  activeWorkspaceId: 'w1',
};

export const WorkspaceStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ workspaces }) => ({
    byProject: computed(() => {
      const map = new Map<string, Workspace[]>();
      for (const w of workspaces()) {
        const list = map.get(w.projectId);
        if (list) list.push(w);
        else map.set(w.projectId, [w]);
      }
      return map;
    }),
  })),
  withMethods((store) => {
    const mutate = (
      workspaceId: string,
      fn: (w: Workspace) => Workspace,
    ): void => {
      patchState(store, {
        workspaces: store
          .workspaces()
          .map((w) => (w.id === workspaceId ? fn(w) : w)),
      });
    };

    return {
      setActive(workspaceId: string): void {
        patchState(store, { activeWorkspaceId: workspaceId });
      },
      forProject(projectId: string): readonly Workspace[] {
        return store.byProject().get(projectId) ?? [];
      },
      // Adds a workspace to the front of its project's list. Returns the
      // new id so callers can navigate. The title is drawn from a pool
      // of famous singers (classical → rap), suffixed with `-N` if
      // already taken within this project.
      add(projectId: string): string {
        const taken = new Set(
          store
            .workspaces()
            .filter((w) => w.projectId === projectId)
            .map((w) => w.title),
        );
        const ws: Workspace = {
          id: `w${Date.now()}`,
          projectId,
          title: generateWorkspaceName(taken),
          status: 'backlog',
          pinned: false,
          unread: false,
          createdAt: new Date(),
        };
        patchState(store, { workspaces: [ws, ...store.workspaces()] });
        patchState(store, { activeWorkspaceId: ws.id });
        return ws.id;
      },
      archive(workspaceId: string): void {
        patchState(store, {
          workspaces: store.workspaces().filter((w) => w.id !== workspaceId),
        });
      },
      removeForProject(projectId: string): void {
        patchState(store, {
          workspaces: store.workspaces().filter((w) => w.projectId !== projectId),
        });
      },
      setStatus(workspaceId: string, status: UiWorkspaceStatus): void {
        mutate(workspaceId, (w) => ({ ...w, status }));
      },
      toggleUnread(workspaceId: string): void {
        mutate(workspaceId, (w) => ({ ...w, unread: !w.unread }));
      },
      togglePinned(workspaceId: string): void {
        mutate(workspaceId, (w) => ({ ...w, pinned: !w.pinned }));
      },
      rename(workspaceId: string, title: string): void {
        const next = title.trim();
        if (!next) return;
        mutate(workspaceId, (w) => ({ ...w, title: next }));
      },
    };
  }),
);
