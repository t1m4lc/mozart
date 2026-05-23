import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
// Direct symbol import (not via the *Imports array) so Angular's
// @defer analyzer can tell mz-code-editor is referenced only inside a
// @defer block and split it (with its CodeMirror deps) into a lazy
// chunk.
import { MzCodeEditor } from '@mozart-ui/code-editor';
import { ThemeService } from '@mozart/shared-util-theme';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { provideIcons } from '@ng-icons/core';
import {
  lucideColumns2,
  lucideFileDiff,
  lucideFilePen,
} from '@ng-icons/lucide';
import {
  ScrollPositionService,
  fileTabKey,
} from '@mozart/desktop-workspaces-data-access';
import {
  FeatureFileDiff,
  FeatureFileToolbar,
  type DiffMode,
  type FileViewedState,
} from '@mozart/desktop-repositories-feature';
import {
  FileViewsFacade,
  RepositoriesFacade,
} from '@mozart/desktop-repositories-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import type { WorkspaceFileContentMode } from '@mozart/desktop-ui-state-util';

type FileContentMode = WorkspaceFileContentMode;

interface SaveError {
  readonly kind: 'frozen' | 'stale' | 'other';
  readonly message: string;
}

const TEXT_ENCODER = new TextEncoder();

@Component({
  selector: 'app-feature-file-content',
  imports: [
    HlmTabsImports,
    HlmButtonImports,
    FeatureFileDiff,
    FeatureFileToolbar,
    MzCodeEditor,
  ],
  providers: [provideIcons({ lucideFileDiff, lucideFilePen, lucideColumns2 })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    <hlm-tabs
      class="flex min-h-0 flex-1 flex-col"
      [tab]="mode()"
      (tabActivated)="setMode($any($event))"
    >
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
                    File changed on disk. Reload to see the new version or keep
                    editing and overwrite.
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
  private readonly uiState = inject(UiStateFacade);
  private readonly scrollPosition = inject(ScrollPositionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  private readonly fileViewState = this.uiState.fileViewStateFor(
    this.workspaceId,
  );

  protected readonly mode = computed<FileContentMode>(() => {
    const state = this.fileViewState();
    const flow = state.activeFlow;
    if (!flow) return 'diff';
    const active = state[flow];
    return active.path === this.filePath() ? active.mode : 'diff';
  });

  protected readonly diffMode = computed<DiffMode>(() => {
    const state = this.fileViewState();
    const flow = state.activeFlow;
    if (!flow) return 'unified';
    const active = state[flow];
    if (active.path !== this.filePath()) return 'unified';
    return active.splitDiff ? 'split' : 'unified';
  });

  protected readonly viewedState = computed<FileViewedState>(() => {
    const ws = this.workspaceId();
    const path = this.filePath();
    if (!ws || !path) return 'not_viewed';
    const entry = this.fileViews.entryFor(ws, path);
    if (!entry) return 'not_viewed';
    return entry.state;
  });

  // Key for resetting per-file edit state. Reading this in a linkedSignal
  // computation makes baseline/editorValue/etc. snap back to defaults when
  // the workspace or file changes.
  private readonly resetKey = computed(
    () => `${this.workspaceId() ?? ''}|${this.filePath() ?? ''}`,
  );
  private readonly baseline = linkedSignal<string>(() => {
    this.resetKey();
    return '';
  });
  private readonly baselineHash = linkedSignal<string>(() => {
    this.resetKey();
    return '';
  });
  protected readonly editorValue = linkedSignal<string>(() => {
    this.resetKey();
    return '';
  });
  protected readonly loading = signal(false);
  protected readonly loadError = linkedSignal<string | null>(() => {
    this.resetKey();
    return null;
  });
  protected readonly saving = signal(false);
  protected readonly saveError = linkedSignal<SaveError | null>(() => {
    this.resetKey();
    return null;
  });
  protected readonly dirty = computed(
    () => this.editorValue() !== this.baseline(),
  );
  protected readonly editorTheme = computed<'light' | 'dark'>(() =>
    this.themeService.isDark() ? 'dark' : 'light',
  );

  private loadFetchId = 0;
  private readonly loadedEditKey = linkedSignal<string | null>(() => {
    this.resetKey();
    return null;
  });

  constructor() {
    effect(() => {
      const ws = this.workspaceId();
      const p = this.filePath();
      const m = this.mode();
      if (m !== 'edit' || !ws || !p) {
        return;
      }

      const key = fileStateKey(ws, p);
      if (this.loadedEditKey() === key) return;
      void this.loadFile(ws, p);
    });

    // Diff-mode scroll persistence. The actual scroll surface is the
    // `<mz-diff-view>` host (in libs/mozart-ui/diff-view, marked
    // `overflow-auto`). We snapshot its scrollTop on cleanup, restore
    // on activate via afterNextRender. The edit-mode editor owns its
    // own scroll (CodeMirror's scrollDOM) and is intentionally NOT
    // persisted here — captured as a follow-up in TODOS.md.
    effect((onCleanup) => {
      const ws = this.workspaceId();
      const p = this.filePath();
      const m = this.mode();
      if (m !== 'diff' || !ws || !p) return;

      const key = fileTabKey(ws, p);

      afterNextRender(
        () => {
          const el = this.findDiffScrollEl();
          if (!el) return;
          const stored = this.scrollPosition.recall(key);
          el.scrollTop = stored ?? 0;
        },
        { injector: this.injector },
      );

      onCleanup(() => {
        const el = this.findDiffScrollEl();
        if (el) this.scrollPosition.remember(key, el.scrollTop);
      });
    });

    // Final snapshot on component destroy — covers chat-tab-switch
    // and route-navigate cases where the effect's cleanup didn't run.
    this.destroyRef.onDestroy(() => {
      const ws = this.workspaceId();
      const p = this.filePath();
      if (this.mode() !== 'diff' || !ws || !p) return;
      const el = this.findDiffScrollEl();
      if (el) this.scrollPosition.remember(fileTabKey(ws, p), el.scrollTop);
    });
  }

  // The `<mz-diff-view>` element is the diff's scroll surface. Its host
  // carries `overflow-auto`. Returns null when the diff view isn't
  // mounted (e.g., in edit mode, during a re-render, or on first
  // mount before afterNextRender fires).
  private findDiffScrollEl(): HTMLElement | null {
    return this.hostEl.nativeElement.querySelector('mz-diff-view');
  }

  protected setMode(value: string): void {
    if (value !== 'edit' && value !== 'diff') return;
    const ws = this.workspaceId();
    const p = this.filePath();
    if (!ws || !p) return;

    const state = this.fileViewState();
    const flow = state.activeFlow;
    const active = flow ? state[flow] : null;

    if (flow && active?.path === p) {
      this.uiState.updateActiveWorkspaceFileViewState(ws, { mode: value });
      return;
    }

    this.uiState.openWorkspaceFile(ws, p, {
      mode: value,
      source: value === 'edit' ? 'all-files' : 'changes',
    });
  }

  protected setDiffMode(value: DiffMode): void {
    const ws = this.workspaceId();
    const p = this.filePath();
    if (!ws || !p) return;

    const state = this.fileViewState();
    const flow = state.activeFlow;
    const active = flow ? state[flow] : null;

    if (!flow || active?.path !== p) {
      this.uiState.openWorkspaceFile(ws, p, {
        mode: 'diff',
        source: 'changes',
      });
    }

    this.uiState.updateActiveWorkspaceFileViewState(ws, {
      splitDiff: value === 'split',
    });
  }

  protected toggleSplit(): void {
    this.setDiffMode(this.diffMode() === 'split' ? 'unified' : 'split');
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

      this.loadedEditKey.set(fileStateKey(workspaceId, path));
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

function fileStateKey(workspaceId: string, path: string): string {
  return `${workspaceId}:${path}`;
}

function mapSaveError(err: unknown): SaveError {
  if (err && typeof err === 'object') {
    const e = err as AppErrorShape;
    const kind = typeof e.kind === 'string' ? e.kind : null;
    const message = typeof e.message === 'string' ? e.message : String(err);

    if (kind === 'StaleFile') return { kind: 'stale', message };
    if (kind === 'Frozen') return { kind: 'frozen', message };

    return { kind: 'other', message };
  }

  return {
    kind: 'other',
    message: err instanceof Error ? err.message : String(err),
  };
}

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
