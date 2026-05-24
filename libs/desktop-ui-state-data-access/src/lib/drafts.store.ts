import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import type { DraftEntry } from '@mozart/desktop-ui-state-util';

// Drafts store — unsaved file edits, keyed by (workspaceId, path).
//
// Reads are synchronous from an in-memory mirror; writes are debounced
// at 500ms so a keystroke burst doesn't trigger a synchronous
// `localStorage.setItem` per char (the perf concern that originally
// asked for a Web Worker — but `Storage` isn't exposed to dedicated
// workers, so debouncing is the practical fallback that still wins
// the original goal: keep typing on a large file off the
// `localStorage.setItem` critical path).
//
// Bounded data loss on a hard crash: ≤500ms of typing. Browser tab
// close is handled via a `beforeunload` flush so a clean close
// persists everything that was in flight.

const STORAGE_KEY = 'mozart-drafts-v1';
const FLUSH_INTERVAL_MS = 500;

type WorkspaceDrafts = Record<string, DraftEntry>;
type AllDrafts = Record<string, WorkspaceDrafts>;

@Injectable({ providedIn: 'root' })
export class DraftsStore {
  private readonly _drafts = signal<AllDrafts>(hydrateFromStorage());
  readonly drafts = this._drafts.asReadonly();

  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly unloadHandler = () => this.flushNow();

  constructor() {
    const destroyRef = inject(DestroyRef);
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.unloadHandler);
      destroyRef.onDestroy(() => {
        window.removeEventListener('beforeunload', this.unloadHandler);
        this.flushNow();
      });
    }
  }

  /** Synchronous read — returns null when no draft for (ws, path). */
  read(workspaceId: string, path: string): DraftEntry | null {
    return this._drafts()[workspaceId]?.[path] ?? null;
  }

  /** Set/overwrite the draft for (ws, path). Main-thread mirror
   *  updates synchronously so subsequent `read` returns the new
   *  value; persistence is debounced. */
  set(workspaceId: string, path: string, content: string): void {
    const entry: DraftEntry = { content, updatedAt: Date.now() };
    this._drafts.update((prev) => {
      const ws = prev[workspaceId] ?? {};
      return {
        ...prev,
        [workspaceId]: { ...ws, [path]: entry },
      };
    });
    this.scheduleFlush();
  }

  /** Drop the draft for (ws, path). Idempotent — no-op on miss. */
  clear(workspaceId: string, path: string): void {
    let removed = false;
    this._drafts.update((prev) => {
      const ws = prev[workspaceId];
      if (!ws || !(path in ws)) return prev;
      removed = true;
      const next = { ...ws };
      delete next[path];
      const all = { ...prev };
      if (Object.keys(next).length === 0) {
        delete all[workspaceId];
      } else {
        all[workspaceId] = next;
      }
      return all;
    });
    if (removed) this.scheduleFlush();
  }

  /** Drop all drafts for a workspace. Mirrors the pattern on the
   *  other stores; the facade fans `pruneWorkspace` to all of them. */
  pruneWorkspace(workspaceId: string): void {
    let removed = false;
    this._drafts.update((prev) => {
      if (!(workspaceId in prev)) return prev;
      removed = true;
      const all = { ...prev };
      delete all[workspaceId];
      return all;
    });
    if (removed) this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushNow();
    }, FLUSH_INTERVAL_MS);
  }

  private flushNow(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (typeof localStorage === 'undefined') return;
    try {
      const all = this._drafts();
      if (Object.keys(all).length === 0) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
      }
    } catch (err) {
      console.warn('[drafts] flush failed:', err);
    }
  }
}

function hydrateFromStorage(): AllDrafts {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as AllDrafts;
    }
  } catch {
    // fall through to empty
  }
  return {};
}
