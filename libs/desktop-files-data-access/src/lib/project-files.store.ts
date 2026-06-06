import {
  Injectable,
  type Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import {
  type ChangedFile,
  FileViewsFacade,
  RepositoriesFacade,
} from '@mozart/desktop-repositories-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import {
  type FileEntry,
  flattenFilePaths,
  mergeFileEntries,
} from '@mozart/desktop-files-util';

// Git status word → single-letter badge for the picker rows.
const STATUS_LETTER: Record<ChangedFile['status'], string> = {
  added: 'A',
  modified: 'M',
  deleted: 'D',
};

/**
 * Reactive file list for the composer `@`-picker. Deliberately NOT a new
 * cache + port: it reads the sources the app already maintains —
 * `RepositoriesFacade`'s cached tree + changed-files (FS-watcher refreshed),
 * `FileViewsFacade`'s viewed-at marks, and `UiStateFacade`'s open tabs — and
 * merges them through the pure `mergeFileEntries` selector. One source of
 * truth, no duplicate cache.
 *
 *   cachedTreeFor        ─┐
 *   cachedChangedFilesFor ┼─►  mergeFileEntries()  ─►  flat ranked FileEntry[]
 *   viewsFor             ─┤        (pure util)
 *   fileTabsFor          ─┘
 */
@Injectable({ providedIn: 'root' })
export class ProjectFilesStore {
  private readonly repos = inject(RepositoriesFacade);
  private readonly fileViews = inject(FileViewsFacade);
  private readonly uiState = inject(UiStateFacade);
  private readonly _showIgnored = signal(false);

  /** Flat, ranked entries for a workspace (open tabs → changed → tail).
   *  `[]` until the tree cache lands. Reactive: re-merges when tabs, changes,
   *  views, or the tree refresh. */
  fileEntriesFor(
    workspaceId: Signal<string | null>,
  ): Signal<readonly FileEntry[]> {
    const tree = this.repos.cachedTreeFor(workspaceId, this._showIgnored);
    const changed = this.repos.cachedChangedFilesFor(workspaceId);
    const views = this.fileViews.viewsFor(workspaceId);
    return computed(() => {
      const id = workspaceId();
      if (!id) return [];
      return mergeFileEntries({
        allPaths: flattenFilePaths(tree() ?? []),
        tabPaths: this.uiState.fileTabsFor(id).map((t) => t.path),
        changed: (changed() ?? []).map((c) => ({
          path: c.path,
          status: STATUS_LETTER[c.status],
        })),
        views: Object.entries(views()).map(([path, v]) => ({
          path,
          viewedAt: v.viewedAt,
        })),
      });
    });
  }

  /** Kick background refreshes so the picker has fresh data even if the file
   *  tree / Changes aside was never opened. Idempotent; keeps old data on
   *  error (same contract as the repositories facade's refreshers). */
  refresh(workspaceId: string): void {
    void this.repos.refreshTreeInBackground(workspaceId);
    void this.repos.refreshChangedFilesInBackground(workspaceId);
  }
}
