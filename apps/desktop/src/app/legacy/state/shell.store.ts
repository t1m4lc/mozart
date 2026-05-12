/**
 * `ShellStore` — shell-level UI feature slice.
 *
 * Holds volatile chrome state (no `withStorageSync` — every restart
 * begins with the right panel closed). Cross-store reads pull the
 * selected workspace from `WorkspaceStore`; ShellStore never duplicates
 * that selection.
 *
 * State:
 *   - `rightPanelOpen`: whether the user has opted to show the right
 *     pane (diff + terminal). Toggled by the workspace card "see diff"
 *     CTA in S1.8b.4.
 *
 * Computed:
 *   - `activeWorkspaceId`: passthrough of `WorkspaceStore.selectedWorkspaceId()`.
 *   - `centerView`: `'chat'` when a workspace is selected, else `'empty'`.
 *     S1.8b.4 swaps the chat branch from <app-empty-center /> to the
 *     real chat panel.
 *   - `showRightPanel`: `rightPanelOpen` AND a workspace is selected.
 *     The right pane is meaningless without a workspace context, so we
 *     gate visibility on both flags here rather than in the template.
 */
import { computed, inject } from '@angular/core';
import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';

import { WorkspaceStore } from './workspace.store';

export type CenterView = 'chat' | 'empty';

interface ShellState {
  readonly rightPanelOpen: boolean;
}

const initialShellState: ShellState = {
  rightPanelOpen: false,
};

export const ShellStore = signalStore(
  { providedIn: 'root' },
  withDevtools('shell'),
  withState<ShellState>(initialShellState),
  withComputed((state) => {
    const workspaces = inject(WorkspaceStore);
    return {
      activeWorkspaceId: computed<string | null>(() =>
        workspaces.selectedWorkspaceId(),
      ),
      centerView: computed<CenterView>(() =>
        workspaces.selectedWorkspaceId() ? 'chat' : 'empty',
      ),
      showRightPanel: computed<boolean>(
        () => state.rightPanelOpen() && !!workspaces.selectedWorkspaceId(),
      ),
    };
  }),
  withMethods((store) => ({
    toggleRightPanel(): void {
      patchState(store, (s) => ({ rightPanelOpen: !s.rightPanelOpen }));
    },
    openRightPanel(): void {
      patchState(store, { rightPanelOpen: true });
    },
    closeRightPanel(): void {
      patchState(store, { rightPanelOpen: false });
    },
  })),
);
