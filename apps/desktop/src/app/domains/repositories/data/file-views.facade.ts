import { Injectable, Signal, computed, inject } from '@angular/core';
import { REPOSITORIES_ADAPTER } from './repositories.adapter';
import { FileViewsStore, type FileViewEntry } from './file-views.store';

/**
 * Public surface for per-workspace Viewed state (P2.2 / AD-03).
 *
 * The store carries the durable Viewed/ChangedSinceViewed map; this
 * facade is the only thing the rest of the app should depend on.
 * Component-local UI state (expanded progress details, selected review
 * file, expanded hunk context) belongs in `UiStateStore`, not here —
 * the facade is for the durable mark records only.
 */
@Injectable({ providedIn: 'root' })
export class FileViewsFacade {
  private readonly adapter = inject(REPOSITORIES_ADAPTER);
  private readonly store = inject(FileViewsStore);

  /** Reactive accessor for the Viewed map of a workspace. Returns an
   *  empty map when the workspace has never been loaded (the Changes
   *  tab renders every file as `not_viewed` in that case). */
  viewsFor(
    workspaceId: Signal<string | null>,
  ): Signal<Readonly<Record<string, FileViewEntry>>> {
    return computed(() => {
      const id = workspaceId();
      if (!id) return EMPTY_MAP;
      return this.store.byWorkspace()[id] ?? EMPTY_MAP;
    });
  }

  /** Snapshot read for callers (the toolbar) that already know the
   *  workspace id at the moment of click. */
  entryFor(workspaceId: string, path: string): FileViewEntry | undefined {
    return this.store.byWorkspace()[workspaceId]?.[path];
  }

  /** Aggregate counts driving the `mz-review-progress` summary.
   *  `viewed` and `changedSinceViewed` come from the store; `notViewed`
   *  is derived against the caller-supplied `paths` (the actual changed
   *  files in the workspace, which only the Changes-tab knows). */
  countsFor(
    workspaceId: Signal<string | null>,
    paths: Signal<readonly string[]>,
  ): Signal<ReviewProgressCounts> {
    return computed(() => {
      const id = workspaceId();
      const list = paths();
      const map = id ? this.store.byWorkspace()[id] ?? EMPTY_MAP : EMPTY_MAP;
      let viewed = 0;
      let changedSinceViewed = 0;
      for (const path of list) {
        const e = map[path];
        if (!e) continue;
        if (e.state === 'viewed') viewed += 1;
        else if (e.state === 'changed_since_viewed') changedSinceViewed += 1;
      }
      const total = list.length;
      const remaining = Math.max(0, total - viewed);
      return { total, viewed, changedSinceViewed, remaining };
    });
  }

  /** Fetch the Viewed map from the Rust side and write it into the
   *  store. Safe to call repeatedly — the store overwrites the entry
   *  for the workspace on each successful load. */
  async refresh(workspaceId: string): Promise<void> {
    this.store.setLoading(workspaceId, true);
    try {
      const list = await this.adapter.listFileViews(workspaceId);
      const next: Record<string, FileViewEntry> = {};
      for (const e of list) {
        next[e.path] = { state: e.state, viewedAt: e.viewedAt };
      }
      this.store.setForWorkspace(workspaceId, next);
    } finally {
      this.store.setLoading(workspaceId, false);
    }
  }

  /** Mark one file viewed and update the local store optimistically. */
  async markViewed(workspaceId: string, path: string): Promise<void> {
    await this.adapter.markFileViewed(workspaceId, path);
    this.store.upsertOne(workspaceId, path, {
      state: 'viewed',
      viewedAt: Date.now(),
    });
  }

  /** Drop the Viewed mark for one file and update the local store. */
  async clearViewed(workspaceId: string, path: string): Promise<void> {
    await this.adapter.clearFileView(workspaceId, path);
    this.store.removeOne(workspaceId, path);
  }

  /** Bulk "Mark all viewed" — uses the Rust side as the source of
   *  truth (it knows the current changed-files list and hashes), then
   *  re-fetches the resulting map. */
  async markAll(workspaceId: string): Promise<void> {
    await this.adapter.markAllViewed(workspaceId);
    await this.refresh(workspaceId);
  }

  /** P2.7 hook — recompute Viewed state after the agent finishes a
   *  run. Files the agent touched will have a fresh on-disk hash; the
   *  next `list_file_views` flips their state to
   *  `changed_since_viewed`. */
  async invalidateAfterRun(workspaceId: string): Promise<void> {
    await this.refresh(workspaceId);
  }

  /** Drop everything we know about a workspace. Called on workspace
   *  archival/removal. */
  forget(workspaceId: string): void {
    this.store.clearWorkspace(workspaceId);
  }
}

export interface ReviewProgressCounts {
  readonly total: number;
  readonly viewed: number;
  readonly changedSinceViewed: number;
  readonly remaining: number;
}

const EMPTY_MAP: Readonly<Record<string, FileViewEntry>> = Object.freeze({});
