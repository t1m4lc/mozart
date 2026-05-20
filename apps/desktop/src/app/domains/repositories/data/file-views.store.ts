import { signalStore, withState, withMethods, patchState } from '@ngrx/signals';

/**
 * Per-workspace cache of Viewed state for files in the Changes review
 * surface. Backs P2.2 (see
 * `docs/specs/plan-mozart-dogfood-readiness.md` § P2.2 and
 * `[[mozart-viewed-principle]]`).
 *
 * The map is the source of truth for the four-way decoration in the
 * Changes tab (`not_viewed | viewed | changed_since_viewed | staged`).
 * Files absent from the inner map default to `not_viewed`; the store
 * only carries explicit reviewer marks.
 *
 * `loadingByWorkspace` lets the Changes-tab decorator show a "still
 * fetching" state in the very first tick after a workspace switch so
 * the badge doesn't flash `not_viewed` for every changed file before
 * the round-trip lands. The facade owns the loading flag.
 */
export type FileViewState = 'viewed' | 'changed_since_viewed';

export interface FileViewEntry {
  readonly state: FileViewState;
  readonly viewedAt: number;
}

interface FileViewsState {
  readonly byWorkspace: Readonly<
    Record<string, Readonly<Record<string, FileViewEntry>>>
  >;
  readonly loadingByWorkspace: Readonly<Record<string, boolean>>;
}

const initial: FileViewsState = {
  byWorkspace: {},
  loadingByWorkspace: {},
};

export const FileViewsStore = signalStore(
  { providedIn: 'root' },
  withState(initial),
  withMethods((store) => ({
    /** Replace the Viewed map for one workspace with a freshly-loaded
     *  set. Caller is responsible for invoking this after a successful
     *  `listFileViews` round-trip. */
    setForWorkspace(
      workspaceId: string,
      entries: Readonly<Record<string, FileViewEntry>>,
    ): void {
      patchState(store, (s) => ({
        byWorkspace: { ...s.byWorkspace, [workspaceId]: entries },
      }));
    },
    /** Patch one file's entry without re-fetching the whole list.
     *  Used by `markFileViewed` to keep the UI in lockstep with the
     *  Rust upsert (so the toolbar checkbox flips immediately). */
    upsertOne(
      workspaceId: string,
      path: string,
      entry: FileViewEntry,
    ): void {
      patchState(store, (s) => {
        const ws = s.byWorkspace[workspaceId] ?? {};
        return {
          byWorkspace: {
            ...s.byWorkspace,
            [workspaceId]: { ...ws, [path]: entry },
          },
        };
      });
    },
    /** Drop the entry for one file. */
    removeOne(workspaceId: string, path: string): void {
      patchState(store, (s) => {
        const ws = s.byWorkspace[workspaceId];
        if (!ws || !(path in ws)) return s;
        const next = { ...ws };
        delete next[path];
        return {
          byWorkspace: { ...s.byWorkspace, [workspaceId]: next },
        };
      });
    },
    /** Drop everything for one workspace. Called when the workspace
     *  row is removed so the store doesn't carry orphaned state. */
    clearWorkspace(workspaceId: string): void {
      patchState(store, (s) => {
        if (!(workspaceId in s.byWorkspace)) return s;
        const next = { ...s.byWorkspace };
        delete next[workspaceId];
        const nextLoading = { ...s.loadingByWorkspace };
        delete nextLoading[workspaceId];
        return { byWorkspace: next, loadingByWorkspace: nextLoading };
      });
    },
    setLoading(workspaceId: string, loading: boolean): void {
      patchState(store, (s) => ({
        loadingByWorkspace: {
          ...s.loadingByWorkspace,
          [workspaceId]: loading,
        },
      }));
    },
  })),
);
