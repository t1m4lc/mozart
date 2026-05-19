import { withDevtools } from '@angular-architects/ngrx-toolkit';
import {
  patchState,
  signalStore,
  withMethods,
  withState,
} from '@ngrx/signals';
import type { FileNode } from './file-node.model';
import type { ChangedFile } from './repositories.adapter';

// Per-workspace repository-data cache. Holds two slices that the
// right-aside needs to render instantly on workspace switches:
//
//   - byWorkspace             → cached file tree per workspace
//   - changedFilesByWorkspace → cached changed-files list per workspace
//
// Why this store exists:
//   `feature-file-tree` (and the aside's Changes list) historically
//   refetched on every workspace switch + every sub-tab toggle, leaving
//   the previous workspace's data rendered while the new fetch was in
//   flight. The cache flips that — once a slice has been fetched for a
//   workspace it stays available instantly until a real FS-watcher
//   event arrives.
//
// Freshness invariant:
//   Each workspace carries a SINGLE monotonic `revision` counter shared
//   across both slices. The aside owns the FS-watcher subscription per
//   active workspace; on every debounced "changed" ping it bumps the
//   revision via `bumpRevision()`, which invalidates BOTH the tree and
//   the changed-files entry for that workspace in one shot. Cache
//   reads compare the entry's captured revision against the current
//   one; a mismatch yields null (forcing a refetch).
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
  // Project the workspace belongs to. Used by the project-level
  // fallback so a freshly-opened workspace can paint a sibling's tree
  // as a placeholder while its own fetch is in flight.
  readonly projectId: string;
  // Wall-clock at write time — used by the project fallback selector
  // to pick the freshest sibling when multiple workspaces of the same
  // project have cached trees.
  readonly cachedAt: number;
}

export interface CachedChangedFiles {
  readonly files: readonly ChangedFile[];
  // Revision the entry was captured under — see CachedFileTree above
  // for the freshness invariant. Bumped by the same `bumpRevision`
  // call that invalidates the tree, so both slices stay coherent.
  readonly revision: number;
}

interface State {
  byWorkspace: Record<string, CachedFileTree>;
  changedFilesByWorkspace: Record<string, CachedChangedFiles>;
  // Current revision per workspace. Defaults to 0. Bumped on each
  // FS-watcher event. Reads default to 0 for unknown ids so a first
  // write with `revision: 0` is always considered current.
  revisionByWorkspace: Record<string, number>;
}

const initialState: State = {
  byWorkspace: {},
  changedFilesByWorkspace: {},
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
      projectId: string,
      tree: readonly FileNode[],
      capturedRevision: number,
      showIgnored: boolean,
    ): void {
      const current = store.revisionByWorkspace()[workspaceId] ?? 0;
      if (capturedRevision !== current) return;
      patchState(store, {
        byWorkspace: {
          ...store.byWorkspace(),
          [workspaceId]: {
            tree,
            showIgnored,
            revision: capturedRevision,
            projectId,
            cachedAt: Date.now(),
          },
        },
      });
    },

    /** Writes the changed-files list for a workspace under the
     *  captured revision. Mirrors `cacheTree`'s staleness check: a
     *  fetch that started under revision N gets silently dropped if
     *  the watcher has since bumped to N+1. */
    cacheChangedFiles(
      workspaceId: string,
      files: readonly ChangedFile[],
      capturedRevision: number,
    ): void {
      const current = store.revisionByWorkspace()[workspaceId] ?? 0;
      if (capturedRevision !== current) return;
      patchState(store, {
        changedFilesByWorkspace: {
          ...store.changedFilesByWorkspace(),
          [workspaceId]: { files, revision: capturedRevision },
        },
      });
    },

    /** Drops the cached entry (does not touch revision). Useful when a
     *  workspace is deleted; routine FS changes go through
     *  `bumpRevision`. */
    clear(workspaceId: string): void {
      const next = { ...store.byWorkspace() };
      delete next[workspaceId];
      const nextChanges = { ...store.changedFilesByWorkspace() };
      delete nextChanges[workspaceId];
      const nextRev = { ...store.revisionByWorkspace() };
      delete nextRev[workspaceId];
      patchState(store, {
        byWorkspace: next,
        changedFilesByWorkspace: nextChanges,
        revisionByWorkspace: nextRev,
      });
    },
  })),
);
