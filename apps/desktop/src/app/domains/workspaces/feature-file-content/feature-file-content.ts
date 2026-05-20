import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { ThemeService } from '@mozart/shared-util-theme';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { MzCodeEditorImports } from '@mozart-ui/code-editor';
import {
  FeatureFileDiff,
  FeatureFileToolbar,
  FileViewsFacade,
  RepositoriesFacade,
  type DiffMode,
  type FileMode,
  type FileViewedState,
} from '../../repositories';

type FileContentMode = FileMode;

interface SaveError {
  readonly kind: 'frozen' | 'stale' | 'other';
  readonly message: string;
}

const TEXT_ENCODER = new TextEncoder();

/**
 * File-only content for the middle shell — projected into
 * `FeatureWorkspaceMiddle`'s `[middle-content]` slot when a file tab
 * is active.
 *
 * Diff mode embeds the existing `FeatureFileDiff` (unified diff +
 * markdown preview); Edit mode lazy-loads CodeMirror via
 * `MzCodeEditor`, tracks an explicit dirty signal, and exposes a
 * Save action that round-trips through `RepositoriesFacade.saveFile`
 * with a sha256 baseline so the backend can refuse a save when the
 * file changed on disk under the editor.
 */
@Component({
  selector: 'app-feature-file-content',
  imports: [
    HlmTabsImports,
    HlmButtonImports,
    FeatureFileDiff,
    FeatureFileToolbar,
    MzCodeEditorImports,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    <hlm-tabs
      class="flex min-h-0 flex-1 flex-col"
      [tab]="mode()"
      (tabActivated)="setMode($any($event))"
    >
      <!-- P2.2 toolbar : filename badge + Viewed checkbox + diff layout
           tabs (in Diff mode) + Diff/Edit tabs. Edit-mode save / discard
           actions sit just under the toolbar so the toolbar surface
           stays consistent across modes. -->
      <app-feature-file-toolbar
        [filePath]="filePath()"
        [viewedState]="viewedState()"
        [isFrozen]="!canEdit()"
        [diffMode]="diffMode()"
        [fileMode]="mode()"
        (markViewed)="onMarkViewed()"
        (markUnviewed)="onMarkUnviewed()"
        (diffModeChange)="setDiffMode($event)"
        (fileModeChange)="setMode($event)"
      />

      @if (mode() === 'edit') {
        <div
          class="flex h-8 shrink-0 items-center justify-end gap-2 border-b border-border px-2 text-[11px]"
        >
          @if (saving()) {
            <span class="text-muted-foreground">Saving…</span>
          } @else if (dirty()) {
            <span class="text-muted-foreground">Unsaved</span>
          }
          <button
            type="button"
            hlmBtn
            variant="outline"
            size="xs"
            class="h-7 px-2 text-[11px]"
            [disabled]="!dirty() || saving() || !canEdit()"
            (click)="save()"
          >
            Save
          </button>
          <button
            type="button"
            hlmBtn
            variant="ghost"
            size="xs"
            class="h-7 px-2 text-[11px] text-muted-foreground"
            [disabled]="!dirty() || saving()"
            (click)="discardEdits()"
          >
            Discard
          </button>
        </div>
      }

      <!-- Edit pane — defers CodeMirror until the user actually clicks
           Edit so the startup bundle never pays for it. -->
      <div hlmTabsContent="edit" class="flex min-h-0 flex-1 flex-col">
        @if (mode() === 'edit') {
          @if (loadError(); as err) {
            <div
              class="flex flex-1 items-center justify-center p-6 text-sm text-destructive"
            >
              <div class="text-center">
                <p class="font-medium">Couldn't open file</p>
                <p class="mt-1 text-xs">{{ err }}</p>
                <button
                  type="button"
                  hlmBtn
                  variant="outline"
                  size="sm"
                  class="mt-3"
                  (click)="reloadFromDisk()"
                >
                  Retry
                </button>
              </div>
            </div>
          } @else if (loading()) {
            <p class="px-3 py-3 text-xs text-muted-foreground">Loading…</p>
          } @else if (filePath(); as p) {
            @if (saveError(); as serr) {
              <div
                class="flex shrink-0 items-center justify-between gap-2 border-b border-amber-400/40 bg-amber-50/60 px-3 py-2 text-xs dark:bg-amber-950/30"
              >
                <span class="text-amber-900 dark:text-amber-200">
                  @if (serr.kind === 'stale') {
                    File changed on disk. Reload to see the new version
                    or keep editing and overwrite.
                  } @else if (serr.kind === 'frozen') {
                    This workspace is done and read-only.
                  } @else {
                    Save failed: {{ serr.message }}
                  }
                </span>
                <span class="flex items-center gap-1">
                  @if (serr.kind === 'stale') {
                    <button
                      type="button"
                      hlmBtn
                      variant="outline"
                      size="xs"
                      class="h-6 px-2 text-[11px]"
                      (click)="reloadFromDisk()"
                    >
                      Reload
                    </button>
                    <button
                      type="button"
                      hlmBtn
                      variant="ghost"
                      size="xs"
                      class="h-6 px-2 text-[11px]"
                      (click)="dismissSaveError()"
                    >
                      Keep editing
                    </button>
                  } @else {
                    <button
                      type="button"
                      hlmBtn
                      variant="ghost"
                      size="xs"
                      class="h-6 px-2 text-[11px]"
                      (click)="dismissSaveError()"
                    >
                      Dismiss
                    </button>
                  }
                </span>
              </div>
            }
            @defer (when mode() === 'edit') {
              <mz-code-editor
                class="flex-1 min-h-0"
                [value]="editorValue()"
                [path]="p"
                [readOnly]="!canEdit()"
                [theme]="editorTheme()"
                (valueChange)="onEditorChange($event)"
              />
            } @placeholder {
              <p class="px-3 py-3 text-xs text-muted-foreground">
                Loading editor…
              </p>
            }
          } @else {
            <div
              class="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground"
            >
              No file selected.
            </div>
          }
        }
      </div>

      <!-- Diff pane — embeds the existing file-diff view. -->
      <div hlmTabsContent="diff" class="flex min-h-0 flex-1 flex-col">
        <app-feature-file-diff
          class="flex-1 min-h-0"
          [workspaceId]="workspaceId()"
          [path]="filePath()"
        />
      </div>
    </hlm-tabs>
  `,
})
export class FeatureFileContent {
  readonly workspaceId = input<string | null>(null);
  readonly filePath = input<string | null>(null);
  readonly canEdit = input<boolean>(true);

  private readonly repos = inject(RepositoriesFacade);
  private readonly fileViews = inject(FileViewsFacade);
  private readonly themeService = inject(ThemeService);

  protected readonly mode = signal<FileContentMode>('diff');
  protected readonly diffMode = signal<DiffMode>('unified');
  /** Three-way Viewed decoration for the currently-open file. Computed
   *  against the FileViewsFacade so the toolbar checkbox always
   *  reflects the durable mark — opening the file never flips it. */
  protected readonly viewedState = computed<FileViewedState>(() => {
    const ws = this.workspaceId();
    const path = this.filePath();
    if (!ws || !path) return 'not_viewed';
    const entry = this.fileViews.entryFor(ws, path);
    if (!entry) return 'not_viewed';
    return entry.state;
  });

  // Edit-mode state. `baseline` is the buffer we last loaded or saved,
  // `editorValue` is what the user sees; `dirty` flips when they
  // diverge. `baselineHash` is the sha256-hex stale-detection token
  // the backend compares against the current on-disk hash at save.
  private readonly baseline = signal<string>('');
  private readonly baselineHash = signal<string>('');
  protected readonly editorValue = signal<string>('');
  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly saveError = signal<SaveError | null>(null);
  protected readonly dirty = computed(
    () => this.editorValue() !== this.baseline(),
  );
  protected readonly editorTheme = computed<'light' | 'dark'>(() =>
    this.themeService.isDark() ? 'dark' : 'light',
  );

  // Monotonic fetch id so out-of-order responses don't clobber the
  // visible buffer (same pattern as `FeatureFileDiff`).
  private loadFetchId = 0;

  constructor() {
    // Whenever the active file (or workspace) changes AND we're in Edit
    // mode, reload the buffer. The first Edit-mode click on a fresh
    // file also triggers this via `mode()` becoming 'edit'.
    effect(() => {
      const ws = this.workspaceId();
      const p = this.filePath();
      const m = this.mode();
      if (m !== 'edit' || !ws || !p) {
        return;
      }
      void this.loadFile(ws, p);
    });

    // File path changed while we were editing → drop the buffer state
    // so the next Edit-mode entry refetches clean (no leaking dirty
    // edits from one file into another).
    effect(() => {
      this.filePath();
      this.baseline.set('');
      this.baselineHash.set('');
      this.editorValue.set('');
      this.saveError.set(null);
      this.loadError.set(null);
    });
  }

  protected setMode(value: string): void {
    if (value !== 'edit' && value !== 'diff') return;
    this.mode.set(value);
  }

  protected setDiffMode(value: DiffMode): void {
    this.diffMode.set(value);
  }

  protected onMarkViewed(): void {
    const ws = this.workspaceId();
    const path = this.filePath();
    if (!ws || !path) return;
    void this.fileViews.markViewed(ws, path).catch((err) => {
      console.warn('[file-content] markViewed failed:', err);
    });
  }

  protected onMarkUnviewed(): void {
    const ws = this.workspaceId();
    const path = this.filePath();
    if (!ws || !path) return;
    void this.fileViews.clearViewed(ws, path).catch((err) => {
      console.warn('[file-content] clearViewed failed:', err);
    });
  }

  protected onEditorChange(next: string): void {
    this.editorValue.set(next);
    // User typed → clear any stale-from-server banner so they can
    // attempt another save.
    if (this.saveError()) this.saveError.set(null);
  }

  protected discardEdits(): void {
    this.editorValue.set(this.baseline());
    this.saveError.set(null);
  }

  protected dismissSaveError(): void {
    this.saveError.set(null);
  }

  protected reloadFromDisk(): void {
    const ws = this.workspaceId();
    const p = this.filePath();
    if (!ws || !p) return;
    void this.loadFile(ws, p);
  }

  protected async save(): Promise<void> {
    const ws = this.workspaceId();
    const p = this.filePath();
    if (!ws || !p) return;
    if (this.saving()) return;
    const content = this.editorValue();
    const expected = this.baselineHash();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const newHash = await this.repos.saveFile(ws, p, content, expected);
      this.baseline.set(content);
      this.baselineHash.set(newHash);
    } catch (err) {
      this.saveError.set(mapSaveError(err));
    } finally {
      this.saving.set(false);
    }
  }

  private async loadFile(workspaceId: string, path: string): Promise<void> {
    const myId = ++this.loadFetchId;
    this.loading.set(true);
    this.loadError.set(null);
    this.saveError.set(null);
    try {
      const text = await this.repos.loadFile(workspaceId, path);
      if (myId !== this.loadFetchId) return;
      const hash = await sha256Hex(text);
      if (myId !== this.loadFetchId) return;
      this.baseline.set(text);
      this.baselineHash.set(hash);
      this.editorValue.set(text);
    } catch (err) {
      if (myId !== this.loadFetchId) return;
      this.loadError.set(err instanceof Error ? err.message : String(err));
    } finally {
      if (myId === this.loadFetchId) {
        this.loading.set(false);
      }
    }
  }
}

interface AppErrorShape {
  readonly kind?: unknown;
  readonly message?: unknown;
}

function mapSaveError(err: unknown): SaveError {
  if (err && typeof err === 'object') {
    const e = err as AppErrorShape;
    const kind = typeof e.kind === 'string' ? e.kind : null;
    const message =
      typeof e.message === 'string' ? e.message : String(err);
    if (kind === 'StaleFile') return { kind: 'stale', message };
    if (kind === 'Frozen') return { kind: 'frozen', message };
    return { kind: 'other', message };
  }
  return {
    kind: 'other',
    message: err instanceof Error ? err.message : String(err),
  };
}

/** sha256 → lowercase hex. Mirrors the backend `sha256_hex` helper so
 *  the editor's baseline matches what the Rust side computes for a
 *  given UTF-8 buffer. */
async function sha256Hex(text: string): Promise<string> {
  const bytes = TEXT_ENCODER.encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let out = '';
  for (let i = 0; i < view.length; i++) {
    const b = view[i];
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}
