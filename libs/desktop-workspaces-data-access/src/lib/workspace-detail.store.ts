import { computed } from '@angular/core';
import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { OPEN_IN_TOOLS, type OpenInTool } from '@mozart/desktop-workspaces-util';

interface State {
  // Identity of the displayed workspace (resolved from the URL).
  workspaceId: string | null;
  workspaceTitle: string;
  projectId: string;
  projectName: string;
  projectIcon: string | null;

  // Git branch the workspace owns (e.g. "mozart/coltrane"). Used by
  // the branch picker to mark "current" and exclude it from the
  // selectable target list. Empty until hydration resolves it.
  currentBranch: string;
  branches: readonly string[];
  targetBranch: string;
  lastUsedTool: OpenInTool;
}

// Branches are loaded from Tauri on workspace open (see
// `loadWorkspace`). Identity fields (workspaceTitle, projectName,
// projectIcon) come from the WorkspacesFacade via the page's effect.
const initialState: State = {
  workspaceId: null,
  workspaceTitle: '',
  projectId: '',
  projectName: '',
  projectIcon: null,
  currentBranch: '',
  branches: [],
  targetBranch: '',
  lastUsedTool: OPEN_IN_TOOLS[0],
};

export const WorkspaceDetailStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('workspaceDetail'),
  withComputed(({ branches, currentBranch }) => ({
    // Target-branch options exclude the workspace's own branch (you
    // can't target your own work). When this set is empty the picker
    // renders an empty state ("No other branches available").
    selectableBranches: computed(() =>
      branches().filter((b) => b !== currentBranch()),
    ),
  })),
  withMethods((store) => ({
    setTargetBranch(branch: string): void {
      patchState(store, { targetBranch: branch });
    },
    /** Seed the target branch on first resolution if not yet set. Picks
     * up the workspace's base branch (fork source) so the picker opens
     * pointing at the right default. */
    seedTargetBranch(branch: string): void {
      if (!branch) return;
      if (store.targetBranch()) return;
      patchState(store, { targetBranch: branch });
    },
    setWorkspaceTitle(title: string): void {
      const next = title.trim();
      if (!next) return;
      patchState(store, { workspaceTitle: next });
    },
    setCurrentBranch(branch: string): void {
      patchState(store, { currentBranch: branch });
    },
    openIn(tool: OpenInTool): void {
      patchState(store, { lastUsedTool: tool });
      // Actual launch lives on the WorkspacesFacade — the store stays
      // free of injected services so the aside can subscribe via the
      // facade and dispatch openInIde() on its own.
    },
    // Called by the page when the route param `id` changes.
    loadWorkspace(workspaceId: string): void {
      patchState(store, { workspaceId });
    },
    setBranches(branches: readonly string[]): void {
      patchState(store, { branches });
    },
  })),
);
