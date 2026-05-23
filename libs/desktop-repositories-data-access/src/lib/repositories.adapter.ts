import { InjectionToken } from '@angular/core';
import type { FileNode } from '@mozart/desktop-repositories-util';

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
   * v0.1.0-beta.1 emits a single "changed" ping per debounced window; the
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

  /**
   * Read a file's raw contents from the workspace's worktree. Used by
   * the markdown preview and any future "view file as text" surface.
   * Path is validated the same way as `getFileDiff` — no absolutes,
   * no `..` segments, no NUL bytes.
   */
  readFile(workspaceId: string, path: string): Promise<string>;

  /**
   * Write UTF-8 text back to a file in the worktree (P2.1 Edit mode).
   *
   * `expectedHash` is sha256-hex of the buffer the editor last loaded
   * (or last saved). The backend compares it against the current
   * on-disk hash and rejects with a typed `StaleFile` error if the
   * file changed under the editor. The returned hash is the sha256-hex
   * of the new buffer — callers should adopt it as their new baseline
   * so a follow-up edit can save without round-tripping a fresh read.
   */
  saveFile(
    workspaceId: string,
    path: string,
    content: string,
    expectedHash: string,
  ): Promise<string>;

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

  /** `git add -- <path>` inside the workspace's worktree. */
  stageFile(workspaceId: string, path: string): Promise<void>;

  /** `git reset HEAD -- <path>` inside the workspace's worktree. Leaves
   *  the working-tree copy untouched. */
  unstageFile(workspaceId: string, path: string): Promise<void>;

  /** `true` when the path has changes in the git index. Used by the
   *  Changes tab context menu to render the ✓ on the Staged toggle. */
  isStaged(workspaceId: string, path: string): Promise<boolean>;

  /** Discard ALL changes in the workspace by hard-resetting to the
   *  most-recent agent-run checkpoint. Destructive — callers must
   *  confirm with the user before invoking. */
  discardWorkspaceChanges(workspaceId: string): Promise<void>;

  // ── Viewed state (P2.2 / [[mozart-viewed-principle]]) ────────────
  // Each surface is an explicit reviewer action — opening a file
  // never marks it viewed. See the spec at
  // `docs/specs/plan-mozart-dogfood-readiness.md` § P2.2.

  /** Mark one file viewed at its current content hash. Idempotent. */
  markFileViewed(workspaceId: string, path: string): Promise<void>;

  /** Drop the Viewed record for one file (mark-unviewed / discard). */
  clearFileView(workspaceId: string, path: string): Promise<void>;

  /** Per-file Viewed status for every file currently marked viewed.
   *  Files without a record default to `not_viewed` and never appear
   *  in this list. */
  listFileViews(workspaceId: string): Promise<readonly FileViewEntry[]>;

  /** Mark every currently changed file viewed in one call. */
  markAllViewed(workspaceId: string): Promise<void>;
}

/** Aside-facing variant of the wire-level `FileViewStatus`. The
 *  `state` is normalised to the union; the timestamp is exposed so
 *  the review surface can surface "viewed X ago" if it ever wants. */
export interface FileViewEntry {
  readonly path: string;
  readonly state: 'viewed' | 'changed_since_viewed';
  readonly viewedAt: number;
}

/** UI-facing changed-file entry. Wire status normalised to one of
 *  `'added' | 'modified' | 'deleted'`. `staged` mirrors the X byte
 *  of `git status --porcelain=v1`; the Changes aside splits on it.
 *  `added` / `removed` are the per-file line counts that drive the
 *  green `+N` / red `−N` chip in the Changes pane. Zero for pure
 *  deletions and binary diffs. */
export interface ChangedFile {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted';
  readonly staged: boolean;
  readonly added: number;
  readonly removed: number;
}

export const REPOSITORIES_ADAPTER = new InjectionToken<RepositoriesAdapter>(
  'REPOSITORIES_ADAPTER',
);
