import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { FileNode } from './file-node.model';

// Per-workspace cache for the right-aside file tree.
//
// Why this store exists:
//   `feature-file-tree` historically refetched the worktree on every
//   workspace switch + every Files sub-tab toggle, leaving the previous
//   workspace's tree rendered while the new fetch was in flight. The
//   cache flips that — once a tree has been fetched for a workspace it
//   stays available instantly until a real FS-watcher event arrives.
//
// Freshness invariant:
//   Each workspace carries a monotonic `revision` counter. The aside
//   already owns a single FS-watcher subscription per active workspace;
//   on every debounced "changed" ping it bumps the revision via
//   `bumpRevision()`. Cache entries store the revision they were
//   written under — `cachedTreeFor` returns null whenever the stored
//   revision lags the current one, which is what forces a refetch.
//
//   The invalidation source is the Rust-side FS-watcher event, NEVER
//   a timer (see docs/specs/plan-mozart-dogfood-readiness.md §P1.2).
//   Add no setInterval-style invalidation here without revising the
//   plan first.

export interface CachedFileTree {
  readonly tree: readonly FileNode[];
  readonly showIgnored: boolean;
  // Revision the entry was captured under. Stale when this lags the
  // current `revisionByWorkspace[wsId]`.
  readonly revision: number;
}

interface State {
  byWorkspace: Record<string, CachedFileTree>;
  // Current revision per workspace. Defaults to 0. Bumped on each
  // FS-watcher event. Reads default to 0 for unknown ids so a first
  // write with `revision: 0` is always considered current.
  revisionByWorkspace: Record<string, number>;
}

const initialState: State = {
  byWorkspace: {},
  revisionByWorkspace: {},
};

export const FileTreeCacheStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withDevtools('fileTreeCache'),
  withMethods((store) => ({
    /** Current revision for a workspace. Used by readers to capture
     *  the revision at fetch-start time so a stale resolution can be
     *  discarded by `cacheTree`. */
    revisionFor(workspaceId: string): number {
      return store.revisionByWorkspace()[workspaceId] ?? 0;
    },

    /** Bumps the workspace's revision counter. Called by the aside's
     *  FS-watcher callback. Subsequent `cachedTreeFor` reads return
     *  null until a fresh `cacheTree` lands with the new revision. */
    bumpRevision(workspaceId: string): void {
      const current = store.revisionByWorkspace()[workspaceId] ?? 0;
      patchState(store, {
        revisionByWorkspace: {
          ...store.revisionByWorkspace(),
          [workspaceId]: current + 1,
        },
      });
    },

    /** Writes a fetched tree into the cache, but only if it isn't
     *  already stale. A fetch that started under revision 4 will be
     *  silently discarded if a watcher event has bumped the revision
     *  to 5 by the time the response lands. */
    cacheTree(
      workspaceId: string,
      tree: readonly FileNode[],
      capturedRevision: number,
      showIgnored: boolean,
    ): void {
      const current = store.revisionByWorkspace()[workspaceId] ?? 0;
      if (capturedRevision !== current) return;
      patchState(store, {
        byWorkspace: {
          ...store.byWorkspace(),
          [workspaceId]: { tree, showIgnored, revision: capturedRevision },
        },
      });
    },

    /** Drops the cached entry (does not touch revision). Useful when a
     *  workspace is deleted; routine FS changes go through
     *  `bumpRevision`. */
    clear(workspaceId: string): void {
      const next = { ...store.byWorkspace() };
      delete next[workspaceId];
      const nextRev = { ...store.revisionByWorkspace() };
      delete nextRev[workspaceId];
      patchState(store, {
        byWorkspace: next,
        revisionByWorkspace: nextRev,
      });
    },
  })),
);
