import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { type FetchContextLines } from '@mozart-ui/diff-view';
import { MzFileDiffCard } from '@mozart-ui/file-diff-card';
import { MzMessageMarkdown } from '@mozart-ui/message-markdown';
import {
  FileViewsFacade,
  RepositoriesFacade,
} from '@mozart/desktop-repositories-data-access';

type ViewMode = 'diff' | 'preview';

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx'];

function isMarkdownPath(path: string | null): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// Smart wrapper around `MzFileDiffCard` + `MzMessageMarkdown`. Picks
// the right renderer for the selected file :
//
//   - `.md` / `.markdown` / `.mdx` → defaults to **Preview** (rendered
//     markdown). A header tab toggle exposes Diff for users who want
//     the unified diff anyway.
//   - everything else → MzFileDiffCard only (no tab toggle).
//
// `RepositoriesFacade.loadFile` fetches the raw content for preview ;
// `loadFileDiff` is unchanged. Both calls are tagged with a monotonic
// `fetchId` so out-of-order responses (user clicks foo then bar) never
// clobber the visible content.
//
// `MzFileDiffCard` accepts a context-fetch callback so P2.3 expand
// bars can reveal unchanged lines between hunks. The callback lazy
// loads the full file body the first time it's needed and slices the
// requested range from a per-path cache; subsequent expansions on the
// same file pay no Tauri round-trip.
@Component({
  selector: 'app-feature-file-diff',
  imports: [MzFileDiffCard, MzMessageMarkdown, HlmButtonImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    @if (showTabs()) {
      <div
        class="border-sidebar-border flex h-8 shrink-0 items-center gap-1 border-b px-2"
      >
        @if (mode() === 'preview') {
          <span
            class="text-muted-foreground min-w-0 flex-1 truncate text-[11px] font-medium"
          >
            {{ path() }}
          </span>
        } @else {
          <span class="flex-1"></span>
        }
        <button
          hlmBtn
          variant="ghost"
          size="xs"
          type="button"
          class="text-muted-foreground hover:text-foreground h-6 px-2 text-[11px]"
          [class.bg-muted]="mode() === 'preview'"
          [class.text-foreground]="mode() === 'preview'"
          (click)="mode.set('preview')"
        >
          Preview
        </button>
        <button
          hlmBtn
          variant="ghost"
          size="xs"
          type="button"
          class="text-muted-foreground hover:text-foreground h-6 px-2 text-[11px]"
          [class.bg-muted]="mode() === 'diff'"
          [class.text-foreground]="mode() === 'diff'"
          (click)="mode.set('diff')"
        >
          Diff
        </button>
      </div>
    }

    <div class="min-h-0 flex-1">
      @if (mode() === 'preview') {
        @if (previewLoading() && !previewText()) {
          <p class="text-muted-foreground px-3 py-3 text-xs">Loading…</p>
        } @else if (previewError(); as err) {
          <p class="text-destructive px-3 py-3 text-xs">
            Failed to read file: {{ err }}
          </p>
        } @else {
          <!-- Defer the markdown renderer : the marked dependency is
               only needed for .md / .mdx previews. With @defer it
               lands in its own chunk, loaded on first preview. -->
          @defer (on viewport) {
            <mz-message-markdown [source]="previewText()" />
          } @placeholder {
            <p class="text-muted-foreground px-3 py-3 text-xs">
              Loading preview…
            </p>
          }
        }
      } @else {
        <!-- @defer (on viewport) so the CodeMirror chunk (~270 kB)
             stays out of the eager bundle. The diff card only renders
             once the workspace tab actually scrolls it into view. -->
        @defer (on viewport) {
          <mz-file-diff-card
            chrome="flush"
            [collapsible]="false"
            [path]="path() ?? ''"
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
          />
        } @placeholder {
          <p class="text-muted-foreground px-3 py-3 text-xs">Loading diff…</p>
        }
      }
    </div>
  `,
})
export class FeatureFileDiff {
  readonly workspaceId = input<string | null>(null);
  readonly path = input<string | null>(null);
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
  // the toggle reflects on-disk truth across tab switches. The card is
  // the canonical place for Viewed after the P1.4 header refactor —
  // see [[plan-p1-4]].
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

  protected readonly previewText = signal<string>('');
  protected readonly previewLoading = signal(false);
  protected readonly previewError = signal<string | null>(null);

  /** Whether the path looks like a markdown file. Drives the tab
   *  toggle visibility + initial view mode. */
  private readonly isMarkdown = computed(() => isMarkdownPath(this.path()));
  protected readonly showTabs = computed(() => this.isMarkdown());
  // Defaults to preview for markdown, diff for everything else. Writable
  // so the header tab toggle can override the default.
  protected readonly mode = linkedSignal<ViewMode>(() =>
    this.isMarkdown() ? 'preview' : 'diff',
  );

  // Tracks the most recent fetch identifier per channel so out-of-order
  // responses don't clobber the visible content.
  private diffFetchId = 0;
  private previewFetchId = 0;

  // Per-path file-body cache for P2.3 expand-bar context fetches.
  // Stays populated across switches so re-opening a file with prior
  // expansions can satisfy them without another Tauri round-trip.
  private readonly fileBodies = new Map<string, string[]>();
  private readonly fileBodyFetches = new Map<string, Promise<string[]>>();

  protected readonly fileLineCount = signal<number | null>(null);

  // Stable callback identity so MzDiffView's effect doesn't tear down
  // on every change-detection pass. Reads the current workspaceId/path
  // through signals at call time.
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

    // Re-fetch preview content whenever the active file is markdown +
    // the mode is preview. The fetch is cheap (small README typically)
    // so we just re-run on every input change.
    effect(() => {
      const id = this.workspaceId();
      const p = this.path();
      this.refreshTick();
      if (!id || !p || !isMarkdownPath(p)) {
        this.previewText.set('');
        this.previewError.set(null);
        return;
      }
      void this.fetchPreview(id, p);
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
    if (isMarkdownPath(p)) {
      void this.fetchPreview(id, p);
    }
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

  private async fetchPreview(workspaceId: string, path: string): Promise<void> {
    const myId = ++this.previewFetchId;
    this.previewLoading.set(true);
    this.previewError.set(null);
    try {
      const text = await this.repos.loadFile(workspaceId, path);
      if (myId !== this.previewFetchId) return;
      this.previewText.set(text);
    } catch (err) {
      if (myId !== this.previewFetchId) return;
      this.previewError.set(err instanceof Error ? err.message : String(err));
      this.previewText.set('');
    } finally {
      if (myId === this.previewFetchId) {
        this.previewLoading.set(false);
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
