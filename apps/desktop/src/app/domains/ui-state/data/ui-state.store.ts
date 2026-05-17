import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
  withMethods,
  withState,
} from '@ngrx/signals';

// Cross-domain UI state. Per Phase 7 conventions §1.3 :
//   Domain stores own entity collections.
//   This store owns *which entity is currently active* + sidebar
//   expand state — the "what is selected / displayed" layer.
//
// Visible in Redux DevTools under the name "uiState" so reviewers can
// trace user navigation alongside data mutations from the per-domain
// stores.
interface State {
  // Currently-routed workspace id. `null` on /, /welcome, /settings,
  // etc. Mirrored into the URL by the router; the store is the single
  // source of truth in-memory.
  activeWorkspaceId: string | null;

  // Which project rows are expanded in the left sidebar. Persists for
  // the session (not yet DB-backed — that lives behind IMP-024).
  expandedProjectIds: ReadonlySet<string>;

  // Status group ids the user has collapsed when sidebar groupBy is
  // 'status'. Default = expanded, so we track the inverse (collapsed)
  // and an empty set means everything is open.
  collapsedStatusIds: ReadonlySet<string>;
}

const initialState: State = {
  activeWorkspaceId: null,
  expandedProjectIds: new Set<string>(),
  collapsedStatusIds: new Set<string>(),
};

export const UiStateStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('uiState'),
  withMethods((store) => ({
    setActiveWorkspace(id: string | null): void {
      patchState(store, { activeWorkspaceId: id });
    },

    toggleProjectExpanded(projectId: string): void {
      const next = new Set(store.expandedProjectIds());
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      patchState(store, { expandedProjectIds: next });
    },

    expandProjects(projectIds: readonly string[]): void {
      patchState(store, {
        expandedProjectIds: new Set([
          ...store.expandedProjectIds(),
          ...projectIds,
        ]),
      });
    },

    setExpandedProjects(projectIds: readonly string[]): void {
      patchState(store, { expandedProjectIds: new Set(projectIds) });
    },

    collapseAllProjects(): void {
      patchState(store, { expandedProjectIds: new Set<string>() });
    },

    toggleStatusCollapsed(statusId: string): void {
      const next = new Set(store.collapsedStatusIds());
      if (next.has(statusId)) next.delete(statusId);
      else next.add(statusId);
      patchState(store, { collapsedStatusIds: next });
    },

    setCollapsedStatuses(statusIds: readonly string[]): void {
      patchState(store, { collapsedStatusIds: new Set(statusIds) });
    },

    expandAllStatuses(): void {
      patchState(store, { collapsedStatusIds: new Set<string>() });
    },
  })),
);
