import { InjectionToken } from '@angular/core';
import type { FileNode } from './file-node.model';

/**
 * IO port for the `repositories` domain. The Tauri implementation lives
 * in `core/tauri-adapters.ts::provideRepositoriesAdapter()` and is the
 * only place that imports `@tauri-apps/api/core`.
 */
export interface RepositoriesAdapter {
  /**
   * Walk the workspace's worktree, overlay `A`/`M`/`D` status against
   * the workspace's base branch, return a nested file tree.
   *
   * `showIgnored=false` filters via `.gitignore`. `showIgnored=true`
   * walks everything except `.git/` and tags entries with `ignored=true`
   * so the UI can mute them.
   */
  listTree(workspaceId: string, showIgnored: boolean): Promise<FileNode[]>;

  /**
   * Subscribe to FS changes for the workspace's worktree. Resolves to an
   * unsubscribe callback the caller is responsible for invoking when the
   * subscription is no longer needed (component teardown, workspace
   * switch). Multiple watchers per workspace are not supported — calling
   * twice for the same workspace replaces the previous subscription on
   * the Rust side.
   *
   * v0.0.1 emits a single "changed" ping per debounced window; the
   * caller re-fetches the tree via `listTree` on each ping.
   */
  watchTree(
    workspaceId: string,
    onChange: () => void,
  ): Promise<() => void>;

  /**
   * Resolve the unified diff text for one file vs. the workspace's
   * base branch. Working tree (incl. uncommitted edits) is the
   * comparison source; untracked files surface as a synthesized
   * "all-added" diff. An empty string means the file is unchanged.
   */
  getFileDiff(workspaceId: string, path: string): Promise<string>;

  /** Flat list of changed files in the workspace's worktree (uncommitted +
   *  untracked). Powers the commit dialog's checkbox list. */
  listChangedFiles(workspaceId: string): Promise<readonly ChangedFile[]>;

  /** Stage `paths` and create a commit with `message`. Returns the new
   *  commit's sha. */
  commitWorkspace(
    workspaceId: string,
    paths: readonly string[],
    message: string,
  ): Promise<string>;
}

/** UI-facing changed-file entry. Wire status normalised to one of
 *  `'added' | 'modified' | 'deleted'`. */
export interface ChangedFile {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted';
}

export const REPOSITORIES_ADAPTER = new InjectionToken<RepositoriesAdapter>(
  'REPOSITORIES_ADAPTER',
);
