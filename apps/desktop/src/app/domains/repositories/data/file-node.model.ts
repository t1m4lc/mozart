// UI-facing file-tree models. Kept free of git/worktree vocabulary —
// the adapter strips wire-side fields like `worktree_path` before
// these reach features.

export type FileChangeStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'unchanged';

export type FileNodeKind = 'file' | 'directory';

export interface FileNode {
  /** Workspace-relative path, forward-slash separated. */
  readonly path: string;
  readonly name: string;
  readonly kind: FileNodeKind;
  readonly status: FileChangeStatus;
  /** True when the entry is matched by `.gitignore` (only meaningful
   *  when the user toggled "Show ignored" on). */
  readonly ignored: boolean;
  /** `undefined` for files; an array (possibly empty) for directories. */
  readonly children?: readonly FileNode[];
}
