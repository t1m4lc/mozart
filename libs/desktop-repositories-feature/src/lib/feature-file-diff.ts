import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { type FetchContextLines } from '@mozart-ui/diff-view';
import {
  MzFileDiffCard,
  type FileDiffStatus,
} from '@mozart-ui/file-diff-card';
import {
  FileViewsFacade,
  RepositoriesFacade,
} from '@mozart/desktop-repositories-data-access';

// Smart wrapper around `MzFileDiffCard`. Owns diff fetching, file-body
// caching for P2.3 expand-bar context fetches, and Viewed persistence
// via `FileViewsFacade`. Stale-response discipline via per-channel
// fetch ids so out-of-order resolutions never clobber visible content.
//
// Header content (Diff/Edit mode toggle, etc.) is projected via the
// `[mzFileDiffCardTrailing]` slot so the parent file-tab can attach
// its segmented control without this component knowing about modes.
@Component({
  selector: 'app-feature-file-diff',
  imports: [MzFileDiffCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Parent (feature-file-content) supplies `min-h-0 flex-1 flex-col`
  // via the class binding. We add `flex flex-col` here so the inner
  // diff-card (whose own host is `block`) participates in flex sizing
  // and never collapses behind the workspace composer below.
  host: { class: 'flex w-full flex-col' },
  template: `
    <!-- Inner wrapper is a flex column so mz-file-diff-card (a block
         host) can use min-h-0 + flex-1 to fill the available space.
         Without this, the card article (which uses h-full) computes
         against an auto-height container and collapses, leaving the
         workspace composer visually overlapping the diff. -->
    <div class="flex min-h-0 flex-1 flex-col">
      <!-- @defer (on viewport) so the CodeMirror chunk (~270 kB) stays
           out of the eager bundle. The diff card only renders once the
           workspace tab actually scrolls it into view. -->
      @defer (on viewport) {
        <mz-file-diff-card
          class="flex min-h-0 flex-1 flex-col"
          chrome="flush"
          pathTruncate="start"
          [collapsible]="false"
          [path]="path() ?? ''"
          [status]="status()"
          [diffText]="diffText()"
          [loading]="loading()"
          [error]="error()"
          [fetchContext]="fetchContext"
          [fileLineCount]="fileLineCount()"
          [scrollPaddingBottom]="scrollPaddingBottom()"
          [viewed]="viewed()"
          (refresh)="reload()"
          (pathCopy)="pathCopy.emit($event)"
          (copyError)="copyError.emit($event)"
          (viewedChange)="onViewedChange($event)"
        >
          <ng-content
            select="[mzFileDiffCardTrailing]"
            ngProjectAs="[mzFileDiffCardTrailing]"
          />
        </mz-file-diff-card>
      } @placeholder {
        <p class="text-muted-foreground px-3 py-3 text-xs">Loading diff…</p>
      }
    </div>
  `,
})
export class FeatureFileDiff {
  readonly workspaceId = input<string | null>(null);
  readonly path = input<string | null>(null);
  readonly status = input<FileDiffStatus | null>(null);
  // Forwarded to the inner MzFileDiffCard / MzDiffView. Bottom padding
  // (px) inside the diff CodeMirror so the last hunk can scroll past
  // a fixed overlay below (workspace composer on file tabs). 0
  // disables — the default in standalone usage.
  readonly scrollPaddingBottom = input<number>(0);
  /** Bumped by the parent on FS-watcher pings; triggers a re-fetch
   *  even when workspaceId + path stay the same. */
  readonly refreshTick = input<number>(0);

  readonly pathCopy = output<string>();
  readonly copyError = output<Error>();

  private readonly repos = inject(RepositoriesFacade);
  private readonly fileViews = inject(FileViewsFacade);

  // Mirror the `MzFileDiffCard` Viewed state from FileViewsFacade so
  // the toggle reflects on-disk truth across tab switches.
  protected readonly viewed = computed(() => {
    const ws = this.workspaceId();
    const p = this.path();
    if (!ws || !p) return false;
    const entry = this.fileViews.entryFor(ws, p);
    return entry?.state === 'viewed';
  });

  protected onViewedChange(next: boolean): void {
    const ws = this.workspaceId();
    const p = this.path();
    if (!ws || !p) return;
    const action = next
      ? this.fileViews.markViewed(ws, p)
      : this.fileViews.clearViewed(ws, p);
    void action.catch((err) => {
      console.warn('[file-diff] viewedChange failed:', err);
    });
  }

  protected readonly diffText = signal<string>('');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  private diffFetchId = 0;

  // Per-path file-body cache for P2.3 expand-bar context fetches.
  // Stays populated across switches so re-opening a file with prior
  // expansions can satisfy them without another Tauri round-trip.
  private readonly fileBodies = new Map<string, string[]>();
  private readonly fileBodyFetches = new Map<string, Promise<string[]>>();

  protected readonly fileLineCount = signal<number | null>(null);

  // Stable callback identity so MzDiffView's effect doesn't tear down
  // on every change-detection pass.
  protected readonly fetchContext: FetchContextLines = (from, to) =>
    this.loadContextLines(from, to);

  constructor() {
    // Re-fetch diff whenever workspace, path, or watcher tick changes.
    effect(() => {
      const id = this.workspaceId();
      const p = this.path();
      this.refreshTick();
      if (!id || !p) {
        this.diffText.set('');
        this.error.set(null);
        this.fileLineCount.set(null);
        return;
      }
      void this.fetchDiff(id, p);
    });

    // FS-watcher invalidation: clear the imperative per-file body cache
    // (Maps, not signals) when the watcher tick bumps. Hunks shift on
    // edit; the cached lines would be stale.
    effect(() => {
      this.refreshTick();
      this.fileBodies.clear();
      this.fileBodyFetches.clear();
    });
  }

  protected reload(): void {
    const id = this.workspaceId();
    const p = this.path();
    if (!id || !p) return;
    void this.fetchDiff(id, p);
  }

  private async fetchDiff(workspaceId: string, path: string): Promise<void> {
    const myId = ++this.diffFetchId;
    this.loading.set(true);
    this.error.set(null);
    try {
      const text = await this.repos.loadFileDiff(workspaceId, path);
      if (myId !== this.diffFetchId) return; // stale
      this.diffText.set(text);
    } catch (err) {
      if (myId !== this.diffFetchId) return;
      this.error.set(err instanceof Error ? err.message : String(err));
      this.diffText.set('');
    } finally {
      if (myId === this.diffFetchId) {
        this.loading.set(false);
      }
    }
  }

  private async loadContextLines(
    from: number,
    to: number,
  ): Promise<readonly string[]> {
    const ws = this.workspaceId();
    const p = this.path();
    if (!ws || !p) return [];

    const lines = await this.ensureFileBody(ws, p);
    if (lines.length === 0) return [];
    const safeFrom = Math.max(1, from);
    const safeTo = Math.min(lines.length, to);
    if (safeTo < safeFrom) return [];
    // lines is indexed 0-based; line numbers are 1-based.
    return lines.slice(safeFrom - 1, safeTo);
  }

  private async ensureFileBody(
    workspaceId: string,
    path: string,
  ): Promise<string[]> {
    const key = bodyKey(workspaceId, path);
    const cached = this.fileBodies.get(key);
    if (cached) return cached;

    const pending = this.fileBodyFetches.get(key);
    if (pending) return pending;

    const promise = this.repos.loadFile(workspaceId, path).then(
      (text) => {
        const lines = splitLines(text);
        this.fileBodies.set(key, lines);
        this.fileBodyFetches.delete(key);
        if (this.workspaceId() === workspaceId && this.path() === path) {
          this.fileLineCount.set(lines.length);
        }
        return lines;
      },
      (err) => {
        this.fileBodyFetches.delete(key);
        throw err;
      },
    );
    this.fileBodyFetches.set(key, promise);
    return promise;
  }
}

function bodyKey(workspaceId: string, path: string): string {
  return `${workspaceId}/${path}`;
}

function splitLines(text: string): string[] {
  if (!text) return [];
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  return trimmed.split('\n');
}
