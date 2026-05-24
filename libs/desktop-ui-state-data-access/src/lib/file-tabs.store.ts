import {
  withDevtools,
  withStorageSync,
} from '@angular-architects/ngrx-toolkit';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import {
  DEFAULT_WORKSPACE_FILE_PATH_STATE,
  type PersistedFileTab,
  type WorkspaceFilePathState,
  type WorkspaceFileViewMap,
} from '@mozart/desktop-ui-state-util';

// File-tab persistence slice — split out of `UiStateStore` so file-
// tab lifecycle (open order, last-active, per-path mode) owns its own
// storage key (`mozart-file-tabs-v1`). Co-locating these three slices
// keeps a single hydration cycle for everything file-tab-related and
// avoids cross-key reordering on bootstrap.

interface State {
  // Open file tabs per workspace, in insertion order. Persisted so
  // that opening the app restores the tab strip the user left.
  // Preview-state is intentionally NOT persisted — on hydrate, all
  // tabs come back as pinned.
  fileTabsByWorkspace: Record<string, readonly PersistedFileTab[]>;

  // Last-active tab id (chat OR file) per workspace. Resolver reads
  // this on workspace navigation to restore the user's last position
  // instead of always landing on the default chat. Chat-kind ids are
  // `chat:<chatId>`; file-kind ids are `file:<base64urlPath>`.
  lastActiveTabIdByWorkspace: Record<string, string>;

  // Per-(workspace, path) file view state — mode (edit / diff) +
  // splitDiff + the source the file was opened from. Each file
  // remembers its own choice; switching between two open tabs
  // preserves each tab's view independently.
  fileViewByWorkspace: Record<string, WorkspaceFileViewMap>;
}

const initialState: State = {
  fileTabsByWorkspace: {},
  lastActiveTabIdByWorkspace: {},
  fileViewByWorkspace: {},
};

export const FileTabsStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('fileTabs'),
  withStorageSync({
    key: 'mozart-file-tabs-v1',
    select: (state) => ({
      fileTabsByWorkspace: state.fileTabsByWorkspace,
      lastActiveTabIdByWorkspace: state.lastActiveTabIdByWorkspace,
      fileViewByWorkspace: state.fileViewByWorkspace,
    }),
  }),
  withMethods((store) => ({
    // Replace the open-tabs list for a workspace. Caller passes the
    // full next list (not a delta) so this method serves both reorder
    // and append/remove. Empty list drops the entry to keep the map
    // small.
    setOpenTabs(workspaceId: string, tabs: readonly PersistedFileTab[]): void {
      const next = { ...store.fileTabsByWorkspace() };
      if (tabs.length === 0) {
        delete next[workspaceId];
      } else {
        next[workspaceId] = tabs;
      }
      patchState(store, { fileTabsByWorkspace: next });
    },

    setLastActiveTab(workspaceId: string, tabId: string | null): void {
      const next = { ...store.lastActiveTabIdByWorkspace() };
      if (tabId === null) {
        delete next[workspaceId];
      } else {
        next[workspaceId] = tabId;
      }
      patchState(store, { lastActiveTabIdByWorkspace: next });
    },

    // Merge a partial per-path file view state. Caller passes only the
    // fields that changed; the store fills the rest from the existing
    // entry or `DEFAULT_WORKSPACE_FILE_PATH_STATE` on first write for
    // this (workspaceId, path).
    upsertFileView(
      workspaceId: string,
      path: string,
      patch: Partial<WorkspaceFilePathState>,
    ): void {
      const wsMap = store.fileViewByWorkspace()[workspaceId] ?? {};
      const current = wsMap[path] ?? DEFAULT_WORKSPACE_FILE_PATH_STATE;
      const nextWs: WorkspaceFileViewMap = {
        ...wsMap,
        [path]: { ...current, ...patch },
      };
      patchState(store, {
        fileViewByWorkspace: {
          ...store.fileViewByWorkspace(),
          [workspaceId]: nextWs,
        },
      });
    },

    // Drop the per-path entry for `path` in `workspaceId`. Called when
    // a file tab closes so the persisted map stays bounded.
    forgetFileView(workspaceId: string, path: string): void {
      const wsMap = store.fileViewByWorkspace()[workspaceId];
      if (!wsMap || !(path in wsMap)) return;
      const nextWs = { ...wsMap };
      delete nextWs[path];
      const nextAll = { ...store.fileViewByWorkspace() };
      if (Object.keys(nextWs).length === 0) {
        delete nextAll[workspaceId];
      } else {
        nextAll[workspaceId] = nextWs;
      }
      patchState(store, { fileViewByWorkspace: nextAll });
    },

    // Fan-out cleanup for workspace removal. Mirrors the pattern on
    // `UiStateStore`; the facade calls both.
    pruneWorkspace(workspaceId: string): void {
      const tabs = { ...store.fileTabsByWorkspace() };
      const lastActive = { ...store.lastActiveTabIdByWorkspace() };
      const views = { ...store.fileViewByWorkspace() };
      delete tabs[workspaceId];
      delete lastActive[workspaceId];
      delete views[workspaceId];
      patchState(store, {
        fileTabsByWorkspace: tabs,
        lastActiveTabIdByWorkspace: lastActive,
        fileViewByWorkspace: views,
      });
    },
  })),
);
