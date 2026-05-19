import { Injectable, Signal, computed, inject } from '@angular/core';
import type { FileNode } from './file-node.model';
import { FileTreeCacheStore } from './file-tree-cache.store';
import { REPOSITORIES_ADAPTER } from './repositories.adapter';

/**
 * Public API of the `repositories` domain. Thin wrapper over the
 * adapter port — also exposes the per-workspace file-tree cache so
 * the right-aside can render an instant repeat-visit without showing
 * the previous workspace's tree while a fetch is in flight.
 */
@Injectable({ providedIn: 'root' })
export class RepositoriesFacade {
  private readonly adapter = inject(REPOSITORIES_ADAPTER);
  private readonly fileTreeCache = inject(FileTreeCacheStore);

  /** Single-shot fetch of the workspace's file tree. */
  async loadTree(
    workspaceId: string,
    showIgnored: boolean,
  ): Promise<FileNode[]> {
    return this.adapter.listTree(workspaceId, showIgnored);
  }

  /**
   * Subscribe to FS-change pings for the workspace. The caller must
   * invoke the returned unsubscribe on teardown.
   */
  async watch(workspaceId: string, onChange: () => void): Promise<() => void> {
    return this.adapter.watchTree(workspaceId, onChange);
  }

  /** Diff the file vs. the workspace's base branch (working tree). */
  async loadFileDiff(workspaceId: string, path: string): Promise<string> {
    return this.adapter.getFileDiff(workspaceId, path);
  }

  /** Read a file's raw contents from the workspace's worktree. */
  async loadFile(workspaceId: string, path: string): Promise<string> {
    return this.adapter.readFile(workspaceId, path);
  }

  /** List uncommitted + untracked files (commit dialog input). */
  async listChangedFiles(
    workspaceId: string,
  ): Promise<readonly import('./repositories.adapter').ChangedFile[]> {
    return this.adapter.listChangedFiles(workspaceId);
  }

  /** Stage + commit. Resolves to the new commit's sha. */
  async commitWorkspace(
    workspaceId: string,
    paths: readonly string[],
    message: string,
  ): Promise<string> {
    return this.adapter.commitWorkspace(workspaceId, paths, message);
  }

  /** Stage a single file. Powers the Changes tab "Staged" toggle. */
  async stageFile(workspaceId: string, path: string): Promise<void> {
    return this.adapter.stageFile(workspaceId, path);
  }

  /** Unstage a single file (working-tree copy stays as-is). */
  async unstageFile(workspaceId: string, path: string): Promise<void> {
    return this.adapter.unstageFile(workspaceId, path);
  }

  /** Read the index state for one file. Read at render time by the
   *  Changes tab context menu to show the ✓ on the Staged toggle. */
  async isStaged(workspaceId: string, path: string): Promise<boolean> {
    return this.adapter.isStaged(workspaceId, path);
  }

  /** Discard ALL changes in the workspace — hard reset to the most
   *  recent agent-run checkpoint. Destructive; callers must confirm. */
  async discardWorkspaceChanges(workspaceId: string): Promise<void> {
    return this.adapter.discardWorkspaceChanges(workspaceId);
  }
  // ── File-tree cache surface (P1.2) ───────────────────────────────
  // Read = signal that flips between the cached tree and null on
  // FS-watcher events; Write = `cacheTree` + `invalidateTreeCache`
  // called by the aside's watcher callback.

  /** Reactive accessor for the cached tree. Returns null until a
   *  fetched tree has been stored for the given workspace + showIgnored
   *  combination, AND that entry's revision is still current. */
  cachedTreeFor(
    workspaceId: Signal<string | null>,
    showIgnored: Signal<boolean>,
  ): Signal<readonly FileNode[] | null> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return null;
      const entry = this.fileTreeCache.byWorkspace()[id];
      if (!entry) return null;
      const currentRevision = this.fileTreeCache.revisionByWorkspace()[id] ?? 0;
      if (entry.revision !== currentRevision) return null;
      if (entry.showIgnored !== showIgnored()) return null;
      return entry.tree;
    });
  }

  /** Snapshot of the current revision for capture at fetch start. */
  treeRevisionFor(workspaceId: string): number {
    return this.fileTreeCache.revisionFor(workspaceId);
  }

  /** Persist a freshly-fetched tree. Silently discarded if the
   *  workspace's revision moved while the fetch was in flight. */
  cacheTree(
    workspaceId: string,
    tree: readonly FileNode[],
    capturedRevision: number,
    showIgnored: boolean,
  ): void {
    this.fileTreeCache.cacheTree(
      workspaceId,
      tree,
      capturedRevision,
      showIgnored,
    );
  }

  /** Bump the workspace's revision counter. Called by the aside's
   *  single FS-watcher subscription on every debounced "changed"
   *  ping — never on a timer. */
  invalidateTreeCache(workspaceId: string): void {
    this.fileTreeCache.bumpRevision(workspaceId);
  }
}
