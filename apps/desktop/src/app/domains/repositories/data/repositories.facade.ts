import { Injectable, Signal, computed, inject } from '@angular/core';
import type { FileNode } from './file-node.model';
import { FileTreeCacheStore } from './file-tree-cache.store';
import { REPOSITORIES_ADAPTER, type ChangedFile } from './repositories.adapter';

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

  /** Save edited UTF-8 text back to a workspace file. See
   *  `RepositoriesAdapter.saveFile` for the stale-hash contract. */
  async saveFile(
    workspaceId: string,
    path: string,
    content: string,
    expectedHash: string,
  ): Promise<string> {
    return this.adapter.saveFile(workspaceId, path, content, expectedHash);
  }

  /** List uncommitted + untracked files. Always hits the adapter —
   *  callers that need an always-fresh read (commit dialog) use this.
   *  The aside's Changes pane goes through `cachedChangedFilesFor` /
   *  `cacheChangedFiles` instead so workspace alternation never
   *  pays the Tauri round-trip. */
  async listChangedFiles(workspaceId: string): Promise<readonly ChangedFile[]> {
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
  // Read = signal that returns the cached tree or null until the
  // first fetch lands. Write = `cacheTree` on resolve; FS-watcher
  // pings go through `refreshTreeInBackground` which writes a fresh
  // tree on top of the existing entry without flipping it to null.

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

  /** Project-level fallback. When the current workspace has no fresh
   *  cached tree of its own, pick the most recently-cached fresh tree
   *  from any sibling workspace of the same project. Renders during
   *  the brief fetch window so the user sees an approximately-correct
   *  tree instead of a skeleton — sibling workspaces of one project
   *  share ~99% of files (they're branches of the same repo).
   *
   *  Returns null if no usable sibling cache exists; in that case the
   *  caller falls back to the skeleton. */
  projectFallbackTreeFor(
    workspaceId: Signal<string | null>,
    projectId: Signal<string | null>,
    showIgnored: Signal<boolean>,
  ): Signal<readonly FileNode[] | null> {
    return computed(() => {
      const id = workspaceId();
      const pid = projectId();
      if (!id || !pid) return null;
      const byWorkspace = this.fileTreeCache.byWorkspace();
      const revisions = this.fileTreeCache.revisionByWorkspace();
      let best: { entry: (typeof byWorkspace)[string]; at: number } | null =
        null;
      for (const [otherId, entry] of Object.entries(byWorkspace)) {
        if (otherId === id) continue;
        if (entry.projectId !== pid) continue;
        if (entry.showIgnored !== showIgnored()) continue;
        const currentRevision = revisions[otherId] ?? 0;
        if (entry.revision !== currentRevision) continue;
        if (!best || entry.cachedAt > best.at) {
          best = { entry, at: entry.cachedAt };
        }
      }
      return best?.entry.tree ?? null;
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
    projectId: string,
    tree: readonly FileNode[],
    capturedRevision: number,
    showIgnored: boolean,
  ): void {
    this.fileTreeCache.cacheTree(
      workspaceId,
      projectId,
      tree,
      capturedRevision,
      showIgnored,
    );
  }

  /** Background refresh of the cached tree triggered by an FS-watcher
   *  event. Unlike `invalidateTreeCache`, this does NOT flip the
   *  cache to null first — the existing tree stays on screen while
   *  the new fetch is in flight, then the cache entry is swapped
   *  atomically when the response lands. CdkTree's `trackBy: path`
   *  keeps unchanged rows stable, so the swap is invisible to the
   *  user when nothing of structural significance changed.
   *
   *  No-op when there's no existing entry — the lazy fetch from
   *  `FeatureFileTree` will populate the cache when the user actually
   *  opens the `All files` tab. */
  async refreshTreeInBackground(workspaceId: string): Promise<void> {
    const existing = this.fileTreeCache.byWorkspace()[workspaceId];
    if (!existing) return;
    const captured = this.fileTreeCache.revisionFor(workspaceId);
    try {
      const tree = await this.loadTree(workspaceId, existing.showIgnored);
      this.fileTreeCache.cacheTree(
        workspaceId,
        existing.projectId,
        tree,
        captured,
        existing.showIgnored,
      );
    } catch (err) {
      console.warn('[repos] background tree refresh failed:', err);
    }
  }

  /** Background refresh of the cached changed-files list. Same
   *  contract as `refreshTreeInBackground`: keeps the old list on
   *  screen until the fresh fetch completes, then swaps atomically.
   *  No-op when there's no existing entry. */
  async refreshChangedFilesInBackground(workspaceId: string): Promise<void> {
    const existing =
      this.fileTreeCache.changedFilesByWorkspace()[workspaceId];
    if (!existing) return;
    const captured = this.fileTreeCache.revisionFor(workspaceId);
    try {
      const files = await this.listChangedFiles(workspaceId);
      this.fileTreeCache.cacheChangedFiles(workspaceId, files, captured);
    } catch (err) {
      console.warn('[repos] background changed-files refresh failed:', err);
    }
  }

  // ── Changed-files cache surface (P1.2) ───────────────────────────
  // Same revision counter as the tree cache, so a single FS-watcher
  // event invalidates both slices together.

  /** Reactive accessor for the cached changed-files list. Returns
   *  null until the aside has fetched + cached it for the given
   *  workspace AND the entry's revision is still current. */
  cachedChangedFilesFor(
    workspaceId: Signal<string | null>,
  ): Signal<readonly ChangedFile[] | null> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return null;
      const entry = this.fileTreeCache.changedFilesByWorkspace()[id];
      if (!entry) return null;
      const currentRevision = this.fileTreeCache.revisionByWorkspace()[id] ?? 0;
      if (entry.revision !== currentRevision) return null;
      return entry.files;
    });
  }

  /** Persist a freshly-fetched changed-files list. Silently discarded
   *  if the workspace's revision moved while the fetch was in flight
   *  (a watcher event landed first → the list is already stale). */
  cacheChangedFiles(
    workspaceId: string,
    files: readonly ChangedFile[],
    capturedRevision: number,
  ): void {
    this.fileTreeCache.cacheChangedFiles(workspaceId, files, capturedRevision);
  }
}
