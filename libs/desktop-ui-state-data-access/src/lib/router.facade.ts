import {
  DestroyRef,
  Injectable,
  Signal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

// Thin wrapper around `Router` that:
//
//   1. Exposes the current URL parts (`activeProjectId`, etc.) as shared
//      signals for cross-cutting consumers (e.g. the sidebar) that are
//      NOT routed components themselves. Routed components don't need
//      this — they get the same params from input bindings courtesy of
//      `withComponentInputBinding()` in `app.config.ts`.
//
//   2. Snapshots the URL to localStorage (`mozart-last-url-v1`) on
//      every NavigationEnd. A single short string is the only thing
//      persisted across app restarts; the resolver re-authorizes the
//      restored URL at boot, so stale workspace / tab ids redirect
//      cleanly.
//
// Per-workspace "last tab" memory (the within-session "return to where
// I was on workspace X" affordance) lives in `SessionStore` —
// it's session state. Routed components write it via the facade.

const STORAGE_KEY = 'mozart-last-url-v1';
const FLUSH_INTERVAL_MS = 250;

type TabKind = 'chat' | 'file';

interface RouterUrlParts {
  readonly projectId: string | null;
  readonly workspaceId: string | null;
  readonly tabId: string | null;
  readonly tabKind: TabKind | null;
}

const EMPTY_PARTS: RouterUrlParts = {
  projectId: null,
  workspaceId: null,
  tabId: null,
  tabKind: null,
};

// Inverse of `workspaceTabRouteCommands`: /project/<id>/workspace/<id>/tab/<id>
function parseUrl(url: string): RouterUrlParts {
  if (!url) return EMPTY_PARTS;
  let path = url;
  const queryIdx = path.indexOf('?');
  if (queryIdx >= 0) path = path.slice(0, queryIdx);
  const fragIdx = path.indexOf('#');
  if (fragIdx >= 0) path = path.slice(0, fragIdx);
  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0 || segments[0] !== 'project') return EMPTY_PARTS;

  const projectId = segments[1] ? decodeURIComponent(segments[1]) : null;
  let workspaceId: string | null = null;
  let tabId: string | null = null;
  if (segments[2] === 'workspace' && segments[3]) {
    workspaceId = decodeURIComponent(segments[3]);
    if (segments[4] === 'tab' && segments[5]) {
      tabId = decodeURIComponent(segments[5]);
    }
  }
  let tabKind: TabKind | null = null;
  if (tabId) {
    if (tabId.startsWith('chat:')) tabKind = 'chat';
    else if (tabId.startsWith('file:')) tabKind = 'file';
  }
  return { projectId, workspaceId, tabId, tabKind };
}

@Injectable({ providedIn: 'root' })
export class RouterFacade {
  private readonly router = inject(Router);

  private readonly _activeUrl = signal<string>('/');
  readonly activeUrl: Signal<string> = this._activeUrl.asReadonly();

  private readonly _parts = computed<RouterUrlParts>(() =>
    parseUrl(this._activeUrl()),
  );

  readonly activeProjectId: Signal<string | null> = computed(
    () => this._parts().projectId,
  );
  readonly activeWorkspaceId: Signal<string | null> = computed(
    () => this._parts().workspaceId,
  );
  readonly activeTabId: Signal<string | null> = computed(
    () => this._parts().tabId,
  );
  readonly activeTabKind: Signal<TabKind | null> = computed(
    () => this._parts().tabKind,
  );

  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly unloadHandler = () => this.flushNow();
  private bootRestoreConsumed = false;
  private readonly bootRestoreValue: string | null;

  constructor() {
    this.bootRestoreValue = readLastUrl();

    const initialUrl = this.router?.url ?? '/';
    this._activeUrl.set(initialUrl);

    // Defensive against test doubles that stub Router with `{ navigate }`
    // only — without events the facade still serves derived signals
    // seeded from the initial URL.
    const events$ = this.router?.events;
    if (events$ && typeof events$.pipe === 'function') {
      events$
        .pipe(
          filter((e): e is NavigationEnd => e instanceof NavigationEnd),
          takeUntilDestroyed(),
        )
        .subscribe((event) => {
          const url = event.urlAfterRedirects ?? event.url;
          this._activeUrl.set(url);
          this.scheduleFlush();
        });
    }

    const destroyRef = inject(DestroyRef);
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.unloadHandler);
      destroyRef.onDestroy(() => {
        window.removeEventListener('beforeunload', this.unloadHandler);
        this.flushNow();
      });
    }
  }

  /** One-shot read of the URL stored at app close on the previous run.
   *  Returns null after the first read so it can't be replayed twice. */
  bootRestoreUrl(): string | null {
    if (this.bootRestoreConsumed) return null;
    this.bootRestoreConsumed = true;
    return this.bootRestoreValue;
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
      const url = this._activeUrl();
      const parts = parseUrl(url);
      if (!parts.workspaceId) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, url);
      }
    } catch (err) {
      console.warn('[router-facade] flush failed:', err);
    }
  }
}

function readLastUrl(): string | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw || raw === '/' || raw.length > 4096) return null;
    return raw;
  } catch {
    return null;
  }
}
