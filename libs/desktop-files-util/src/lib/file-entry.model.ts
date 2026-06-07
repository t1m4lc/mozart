// View-model + raw-input shapes for the composer `@`-file picker. Pure data —
// no Angular, no Tauri — so the merge/rank logic is unit-testable in isolation
// (mirrors `desktop-skills-util`'s model/selectors split). The data-access
// store does the Tauri calls and flattening, then hands these plain shapes to
// `mergeFileEntries`.

/**
 * Why a file floats where it does in the flat picker list. Drives BOTH the
 * sort order and the row badge, so legibility costs no extra model:
 *   - `open`    → file is open in a workspace tab
 *   - `changed` → file has uncommitted changes
 *   - `other`   → every other project file (the long tail)
 */
export type FileTier = 'open' | 'changed' | 'other';

/** One row in the flat `@`-picker list. */
export interface FileEntry {
  readonly path: string;
  readonly tier: FileTier;
  /** Badge text: `'open'` for tabs, the git status letter (`M`/`A`/…) for
   *  changed files, `undefined` for the tail (no badge). */
  readonly badge?: string;
}

/** A file with uncommitted changes (from `repos.listChangedFiles`). */
export interface ChangedFileInput {
  readonly path: string;
  /** Git status letter(s), e.g. `M`, `A`, `??`. Rendered as the row badge. */
  readonly status: string;
}

/** A last-viewed record (from `workspace_file_views`). */
export interface FileViewInput {
  readonly path: string;
  /** Epoch millis (or any monotonically-increasing number); higher = newer. */
  readonly viewedAt: number;
}

/** The four sources `mergeFileEntries` flattens into one ranked list. */
export interface MergeFileInputs {
  /** All project file paths (flattened from `listTree`, gitignore-aware). */
  readonly allPaths: readonly string[];
  /** Open-tab file paths, in tab order. */
  readonly tabPaths: readonly string[];
  /** Uncommitted-change files. */
  readonly changed: readonly ChangedFileInput[];
  /** Last-viewed timestamps for the tail sort. */
  readonly views: readonly FileViewInput[];
}
