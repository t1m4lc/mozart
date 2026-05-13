import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { OPEN_IN_TOOLS, type OpenInTool } from '../data/open-in-tools';

interface State {
  // Identity of the displayed workspace (resolved from the URL).
  workspaceId: string | null;
  workspaceTitle: string;
  projectId: string;
  projectName: string;
  projectIcon: string | null;

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
  branches: [],
  targetBranch: 'main',
  lastUsedTool: OPEN_IN_TOOLS[0],
};

export const WorkspaceDetailStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ branches, workspaceTitle }) => ({
    selectableBranches: computed(() =>
      branches().filter((b) => b !== workspaceTitle()),
    ),
  })),
  withMethods((store) => ({
    setTargetBranch(branch: string): void {
      patchState(store, { targetBranch: branch });
    },
    setWorkspaceTitle(title: string): void {
      const next = title.trim();
      if (!next) return;
      patchState(store, { workspaceTitle: next });
    },
    openIn(tool: OpenInTool): void {
      patchState(store, { lastUsedTool: tool });
      // TODO: dispatch Tauri command `open_in(tool, project.path)`
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
