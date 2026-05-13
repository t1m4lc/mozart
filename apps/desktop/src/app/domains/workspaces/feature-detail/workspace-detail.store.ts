import { computed } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { BRANCHES_MOCK } from '../data/branches.mock';
import { OPEN_IN_TOOLS, type OpenInTool } from '../data/open-in-tools';

interface State {
  // Identity of the displayed workspace (resolved from the URL).
  workspaceId: string | null;
  workspaceTitle: string;
  projectId: string;
  projectTitle: string;
  projectIcon: string | null;

  branches: readonly string[];
  targetBranch: string;
  lastUsedTool: OpenInTool;
}

// Until the workspace detail is loaded from the backend, the store seeds
// itself with the same mock data the legacy page hard-coded.
// TODO: replace with `get_workspace(workspaceId)` Tauri command.
const initialState: State = {
  workspaceId: 'w1',
  workspaceTitle: 'feat/shell-resizable',
  projectId: 'p1',
  projectTitle: 'mozart',
  projectIcon: '🧑‍🎤',
  branches: BRANCHES_MOCK,
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
    openIn(tool: OpenInTool): void {
      patchState(store, { lastUsedTool: tool });
      // TODO: dispatch Tauri command `open_in(tool, project.path)`
    },
    // Called by the page when the route param `id` changes.
    loadWorkspace(workspaceId: string): void {
      // TODO: replace with backend call. For now we only track the id
      //       and keep the mocked title/project pair intact.
      patchState(store, { workspaceId });
    },
  })),
);
