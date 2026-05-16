import { computed } from '@angular/core';
import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { UiWorkspaceStatus } from './workspace-status';
import type { Workspace } from './workspace.model';

interface State {
  workspaces: Workspace[];
}

// v0.0.1: hydrated from Tauri at boot via WorkspacesFacade.loadAll().
// The mock seed in workspaces.mock.ts is kept for component tests / Storybook
// but is no longer the initial state.
//
// `activeWorkspaceId` lives in `domains/ui-state/` — this store owns
// the entity collection only (per Phase 7 conventions §1.3 :
// "Store IDs in ui-state, derive entities from the relevant domain
// store").
const initialState: State = {
  workspaces: [],
};

export const WorkspaceStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('workspaces'),
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
    pending: computed(() => workspaces().filter((w) => w.pending)),
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
      // Replaces the entire collection. Used by hydration.
      setAll(workspaces: readonly Workspace[]): void {
        patchState(store, { workspaces: [...workspaces] });
      },

      // Adds or replaces a single workspace, preserving order. New rows
      // land at the head (newest first) to match the "just created"
      // expectation.
      upsertOne(workspace: Workspace): void {
        const existingIdx = store
          .workspaces()
          .findIndex((w) => w.id === workspace.id);
        if (existingIdx === -1) {
          patchState(store, {
            workspaces: [workspace, ...store.workspaces()],
          });
        } else {
          patchState(store, {
            workspaces: store
              .workspaces()
              .map((w, i) => (i === existingIdx ? workspace : w)),
          });
        }
      },

      removeById(workspaceId: string): void {
        patchState(store, {
          workspaces: store.workspaces().filter((w) => w.id !== workspaceId),
        });
      },

      forProject(projectId: string): readonly Workspace[] {
        return store.byProject().get(projectId) ?? [];
      },

      removeForProject(projectId: string): void {
        patchState(store, {
          workspaces: store
            .workspaces()
            .filter((w) => w.projectId !== projectId),
        });
      },

      setStatus(workspaceId: string, status: UiWorkspaceStatus): void {
        mutate(workspaceId, (w) => ({ ...w, status }));
      },

      setPinned(workspaceId: string, pinned: boolean): void {
        mutate(workspaceId, (w) => ({ ...w, pinned }));
      },

      setUnread(workspaceId: string, unread: boolean): void {
        mutate(workspaceId, (w) => ({ ...w, unread }));
      },

      setPending(workspaceId: string, pending: boolean): void {
        mutate(workspaceId, (w) => ({ ...w, pending }));
      },

      setName(workspaceId: string, name: string): void {
        const next = name.trim();
        if (!next) return;
        mutate(workspaceId, (w) => ({ ...w, name: next }));
      },
    };
  }),
);
