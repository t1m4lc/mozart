import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
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
  lastUsedTool: OpenInTool;
}

// Identity fields (workspaceTitle, projectName, projectIcon) come from
// the WorkspacesFacade via the page's effect.
const initialState: State = {
  workspaceId: null,
  workspaceTitle: '',
  projectId: '',
  projectName: '',
  projectIcon: null,
  lastUsedTool: OPEN_IN_TOOLS[0],
};

export const WorkspaceDetailStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('workspaceDetail'),
  withMethods((store) => ({
    setWorkspaceTitle(title: string): void {
      const next = title.trim();
      if (!next) return;
      patchState(store, { workspaceTitle: next });
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
  })),
);
