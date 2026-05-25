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
import { MzFileTabHeader } from '@mozart-ui/file-tab-header';
import { ThemeService } from '@mozart/shared-util-theme';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTabsImports } from '@spartan-ui/tabs';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFileDiff, lucideFilePen } from '@ng-icons/lucide';
import {
  FileTabsService,
  ScrollPositionService,
  WorkspaceMutationsFacade,
  fileTabKey,
} from '@mozart/desktop-workspaces-data-access';
import { FeatureFileDiff } from '@mozart/desktop-repositories-feature';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
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
    HlmButtonImports,
    HlmIconImports,
    HlmTabsImports,
    HlmTooltipImports,
    NgIcon,
    FeatureFileDiff,
    MzCodeEditor,
    MzFileTabHeader,
  ],
  providers: [provideIcons({ lucideFileDiff, lucideFilePen })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col' },
  template: `
    <hlm-tabs
      class="flex min-h-0 flex-1 flex-col"
      [tab]="mode()"
      (tabActivated)="setMode($any($event))"
    >
      <!--
        Shared header layout: path + Diff/Edit toggle for every file
        tab, regardless of mode. Viewed lives inside MzFileDiffCard (in
        Diff mode) — the edit surface has no concept of "reviewed" per
        the P1.4 D5 decision.
      -->
      <mz-file-tab-header>
        <span
          class="select-text text-muted-foreground"
          [attr.title]="filePath()"
        >
          {{ filePath() ?? '' }}
        </span>

        <hlm-tabs-list
          mzFileTabHeaderActions
          variant="line"
          class="flex h-7 items-center gap-1"
          aria-label="File mode"
        >
          <button
            hlmTabsTrigger="diff"
            class="inline-flex h-7 items-center gap-1.5 rounded-md border-transparent! bg-transparent! px-2 text-xs font-normal text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none after:hidden!"
            hlmTooltip="Review (diff)"
          >
            <ng-icon hlm name="lucideFileDiff" size="xs" />
            <span>Diff</span>
          </button>
          <button
            hlmTabsTrigger="edit"
            class="inline-flex h-7 items-center gap-1.5 rounded-md border-transparent! bg-transparent! px-2 text-xs font-normal text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none after:hidden!"
            [disabled]="!canEdit()"
            [hlmTooltip]="
              canEdit() ? 'Edit' : 'Workspace is done — edits disabled'
            "
          >
            <ng-icon hlm name="lucideFilePen" size="xs" />
            <span>Edit</span>
          </button>
        </hlm-tabs-list>
      </mz-file-tab-header>

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

      <!-- Composer is a flex sibling of this tab content's scroll
           ancestor (M16) — no overlay, no clearance constant. The
           editor's bottom is where the composer's top is. -->
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
  private readonly themeService = inject(ThemeService);
  private readonly uiState = inject(UiStateFacade);
  private readonly scrollPosition = inject(ScrollPositionService);
  private readonly fileTabs = inject(FileTabsService);
  private readonly mutations = inject(WorkspaceMutationsFacade);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  // Per-(workspace, path) UI state. Each open tab remembers its own
  // mode + splitDiff independently; switching between two open tabs
  // preserves each tab's view choice.
  private readonly fileViewState = this.uiState.fileViewStateFor(
    this.workspaceId,
    this.filePath,
  );

  protected readonly mode = computed<FileContentMode>(
    () => this.fileViewState().mode,
  );

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
  // Editor buffer. Initialized from any in-memory edit buffer for this
  // (ws, path) so unsaved edits survive tab switches within the
  // session. The buffer is flushed to disk on app close
  // (`onCloseRequested` in app.config.ts) — no localStorage persistence.
  protected readonly editorValue = linkedSignal<string>(() => {
    const key = this.resetKey();
    const [ws, path] = decodeResetKey(key);
    if (!ws || !path) return '';
    return this.uiState.readEdit(ws, path)?.content ?? '';
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
  // Auto-pin guard — per (ws, path) so a different file gets a fresh
  // chance to auto-pin on its own first edit. Resets via the same
  // resetKey the buffer uses.
  private readonly hasAutoPinned = linkedSignal<boolean>(() => {
    this.resetKey();
    return false;
  });
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

    // Auto-pin: first time the buffer becomes dirty for an active
    // preview tab, promote it to pinned. Guarded per (ws, path) so
    // Cmd-Z back to baseline + re-type does NOT fire a second
    // pin-call (pinFor is idempotent but we avoid the cross-component
    // churn). Resets on file/workspace change via `hasAutoPinned`'s
    // linkedSignal.
    effect(() => {
      if (!this.dirty()) return;
      if (this.hasAutoPinned()) return;
      const ws = this.workspaceId();
      const p = this.filePath();
      if (!ws || !p) return;
      const tab = this.fileTabs.findTab(ws, p);
      if (!tab || !tab.isPreview) {
        this.hasAutoPinned.set(true);
        return;
      }
      this.fileTabs.pinForPath(ws, p);
      this.hasAutoPinned.set(true);
    });

    // Live edit buffer: mirror the editor into SessionStore so other
    // surfaces (and the on-close disk flush) can read the latest
    // content + baseline hash. In-memory only; cleared on save success
    // and on tab close (FileTabsService.closeFor). Baseline-equal
    // buffers clear instead of writing a no-op entry.
    effect(() => {
      const ws = this.workspaceId();
      const p = this.filePath();
      if (!ws || !p) return;
      if (this.dirty()) {
        this.uiState.writeEdit(ws, p, this.editorValue(), this.baselineHash());
      } else if (this.uiState.readEdit(ws, p)) {
        this.uiState.clearEdit(ws, p);
      }
    });

    // Per-mode scroll persistence. Both modes use the same per-(ws,
    // path) key — switching modes preserves position within the file.
    // Diff scrolls happen on the `<mz-diff-view>` host (overflow-auto
    // applied in libs/mozart-ui/diff-view). Edit scrolls happen on
    // CodeMirror's internal `.cm-scroller` (CM owns the scrollable
    // even though our host wrapper also declares overflow-auto). One
    // helper wires both — same ScrollPositionService backend the
    // MzScrollSurface directive uses for chat, so persistence is
    // unified across surfaces even though the diff/edit roots live in
    // mozart-ui leaf libs that can't import workspaces-data-access
    // directly.
    this._wireScrollPersist('diff', 'mz-diff-view');
    this._wireScrollPersist('edit', 'mz-code-editor .cm-scroller');

    // Final snapshot on component destroy — covers chat-tab-switch
    // and route-navigate cases where the effect's cleanup didn't run.
    this.destroyRef.onDestroy(() => {
      const ws = this.workspaceId();
      const p = this.filePath();
      if (!ws || !p) return;
      const m = this.mode();
      const selector =
        m === 'diff' ? 'mz-diff-view' : 'mz-code-editor .cm-scroller';
      const el = this.hostEl.nativeElement.querySelector<HTMLElement>(selector);
      if (el) this.scrollPosition.remember(fileTabKey(ws, p), el.scrollTop);
    });
  }

  // Reusable persistence wiring for a given mode + the CSS selector
  // that resolves to the scroll element when that mode is active.
  // Snapshots on cleanup (mode/path/workspace change), restores after
  // the next render so the new content has laid out. The same key
  // (`file:{ws}:{path}`) is reused across modes so switching from
  // diff to edit and back preserves the user's reading position.
  private _wireScrollPersist(
    activeMode: FileContentMode,
    scrollElSelector: string,
  ): void {
    effect((onCleanup) => {
      const ws = this.workspaceId();
      const p = this.filePath();
      const m = this.mode();
      if (m !== activeMode || !ws || !p) return;

      const key = fileTabKey(ws, p);

      afterNextRender(
        () => {
          const el = this.hostEl.nativeElement.querySelector<HTMLElement>(
            scrollElSelector,
          );
          if (!el) return;
          const stored = this.scrollPosition.recall(key);
          el.scrollTop = stored ?? 0;
        },
        { injector: this.injector },
      );

      onCleanup(() => {
        const el = this.hostEl.nativeElement.querySelector<HTMLElement>(
          scrollElSelector,
        );
        if (el) this.scrollPosition.remember(key, el.scrollTop);
      });
    });
  }

  protected setMode(value: string): void {
    if (value !== 'edit' && value !== 'diff') return;
    const ws = this.workspaceId();
    const p = this.filePath();
    if (!ws || !p) return;
    this.uiState.upsertFileView(ws, p, { mode: value });
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
      // Save success: drop the edit buffer AND nudge the Changes tab
      // to refresh so the user's modification shows up without waiting
      // for the FS-watcher debounce. saveError paths skip both.
      this.uiState.clearEdit(ws, p);
      this.mutations.softRefreshAfterMutation(ws);
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
      // Only seed the buffer from disk when there isn't an in-memory
      // edit. A pre-existing edit is the user's unsaved work — preserve
      // it and let `dirty` flip true so the Save button lights up.
      const edit = this.uiState.readEdit(workspaceId, path);
      if (!edit) {
        this.editorValue.set(text);
      }
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

function decodeResetKey(key: string): readonly [string | null, string | null] {
  const sep = key.indexOf('|');
  if (sep <= 0) return [null, null];
  const ws = key.slice(0, sep);
  const p = key.slice(sep + 1);
  return [ws || null, p || null];
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
