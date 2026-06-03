import { NgTemplateOutlet } from '@angular/common';
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
  untracked,
} from '@angular/core';
// Direct symbol import (not via the *Imports array) so Angular's
// @defer analyzer can tell mz-code-editor is referenced only inside a
// @defer block and split it (with its CodeMirror deps) into a lazy
// chunk.
import { MzCodeEditor } from '@mozart-ui/code-editor';
import { MzFileTabHeader } from '@mozart-ui/file-tab-header';
import { ThemeService } from '@mozart/shared-util-theme';
import { HlmBadgeImports } from '@spartan-ui/badge';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCopy,
  lucideFileDiff,
  lucideFilePen,
} from '@ng-icons/lucide';
import {
  FileTabsService,
  ScrollPositionService,
  WorkspaceMutationsFacade,
  fileTabKey,
} from '@mozart/desktop-workspaces-data-access';
import { FeatureFileDiff } from '@mozart/desktop-repositories-feature';
import {
  RepositoriesFacade,
  type ChangedFile,
} from '@mozart/desktop-repositories-data-access';
import {
  type FileDiffStatus,
} from '@mozart-ui/file-diff-card';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import type { WorkspaceFileContentMode } from '@mozart/desktop-ui-state-util';

type FileContentMode = WorkspaceFileContentMode;
type CopyState = 'idle' | 'copied' | 'err';

interface SaveError {
  readonly kind: 'frozen' | 'stale' | 'other';
  readonly message: string;
}

interface StatusBadge {
  readonly label: string;
  readonly toneClass: string;
}

const STATUS_BADGE: Record<FileDiffStatus, StatusBadge> = {
  modified: { label: 'MOD', toneClass: 'text-muted-foreground' },
  added: { label: 'ADD', toneClass: 'text-[var(--diff-add-marker-fg)]' },
  deleted: { label: 'DEL', toneClass: 'text-[var(--diff-remove-marker-fg)]' },
  renamed: { label: 'REN', toneClass: 'text-muted-foreground' },
  binary: { label: 'BIN', toneClass: 'text-muted-foreground/70' },
  'too-large': { label: 'BIG', toneClass: 'text-muted-foreground/70' },
  'no-diff': { label: 'NIL', toneClass: 'text-muted-foreground/70' },
};

const TEXT_ENCODER = new TextEncoder();

@Component({
  selector: 'app-feature-file-content',
  imports: [
    NgTemplateOutlet,
    HlmBadgeImports,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
    NgIcon,
    FeatureFileDiff,
    MzCodeEditor,
    MzFileTabHeader,
  ],
  providers: [
    provideIcons({ lucideCheck, lucideCopy, lucideFileDiff, lucideFilePen }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `min-h-0 + flex-1` are added by the parent (workspace-tab-content)
  // via a class binding so this component participates in the parent's
  // flex layout cleanly. We deliberately omit `h-full` here — combining
  // it with `flex-1` made the diff-mode child fight the flex algorithm
  // and visually pushed the composer behind the file content. The
  // `relative` anchor keeps the floating Save/Discard banner pinned
  // inside this surface.
  host: { class: 'relative flex w-full flex-col' },
  template: `
    <ng-template #modeToggle>
      <div
        class="bg-muted/40 ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-md p-0.5"
        role="tablist"
        aria-label="File mode"
      >
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="mode() === 'diff'"
          class="inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          [class.bg-background]="mode() === 'diff'"
          [class.text-foreground]="mode() === 'diff'"
          [class.shadow-sm]="mode() === 'diff'"
          hlmTooltip="Review (diff)"
          (click)="setMode('diff')"
        >
          <ng-icon hlm name="lucideFileDiff" size="md" />
          <span>Diff</span>
        </button>
        <button
          type="button"
          role="tab"
          [attr.aria-selected]="mode() === 'edit'"
          class="inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          [class.bg-background]="mode() === 'edit'"
          [class.text-foreground]="mode() === 'edit'"
          [class.shadow-sm]="mode() === 'edit'"
          [disabled]="!canEdit()"
          [hlmTooltip]="
            canEdit() ? 'Edit' : 'Workspace is done — edits disabled'
          "
          (click)="setMode('edit')"
        >
          <ng-icon hlm name="lucideFilePen" size="md" />
          <span>Edit</span>
        </button>
      </div>
    </ng-template>

    @if (mode() === 'diff') {
      <app-feature-file-diff
        class="flex min-h-0 flex-1 flex-col"
        [workspaceId]="workspaceId()"
        [path]="filePath()"
        [status]="fileChangeStatus()"
        [refreshTick]="watcherTick()"
      >
        <div mzFileDiffCardTrailing class="contents">
          <ng-container *ngTemplateOutlet="modeToggle" />
        </div>
      </app-feature-file-diff>
    } @else {
      <mz-file-tab-header pathTruncate="start">
        <span [attr.title]="filePath()" class="select-text text-foreground">
          {{ filePath() ?? '' }}
        </span>

        <div mzFileTabHeaderActions class="contents">
          @if (filePath()) {
            <button
              type="button"
              hlmBtn
              variant="ghost"
              size="xs"
              class="text-muted-foreground hover:text-foreground h-6 w-6 shrink-0 p-0"
              [hlmTooltip]="copyTooltip()"
              [attr.aria-label]="copyTooltip()"
              (click)="copyPath()"
            >
              <ng-icon
                hlm
                [name]="copyState() === 'copied' ? 'lucideCheck' : 'lucideCopy'"
                size="md"
                [class.text-status-ok]="copyState() === 'copied'"
                [class.text-destructive]="copyState() === 'err'"
              />
            </button>
          }

          @if (statusBadge(); as badge) {
            <span
              hlmBadge
              variant="outline"
              class="h-5 shrink-0 px-1.5 font-mono text-[10px] tracking-wider"
              [class]="badge.toneClass"
              [attr.aria-label]="'Status: ' + badge.label"
            >{{ badge.label }}</span>
          }

          <ng-container *ngTemplateOutlet="modeToggle" />
        </div>
      </mz-file-tab-header>

      <!-- File content + composer are now two distinct flex rows in
           the workspace tab layout. The editor lives in this scrolling
           region; the composer sits below in its own row. No
           scrollPaddingBottom is needed because nothing overlaps the
           editor's last line. -->
      <div class="relative flex min-h-0 flex-1 flex-col">
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
      </div>
    }

    <!-- Floating Save/Discard overlay. Anchored to the component host
         (relative) and rendered OUTSIDE the diff/edit branches so a
         user who dirties the buffer in Edit mode and switches to Diff
         to glance at the change can still reach Save. The composer is
         now a sibling row below file-content (not an overlay), so the
         button sits a comfortable 12 px above the file-content's
         bottom edge — the composer chrome handles its own spacing.
         pointer-events-none on the wrapper + pointer-events-auto on
         the card keeps the rest of the surface clickable. aria-hidden
         flips with the visibility state so screen readers ignore the
         overlay when it's faded out. -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3"
      aria-live="polite"
      [attr.aria-hidden]="!dirty() && !saving()"
    >
      <div
        class="bg-popover/95 pointer-events-auto flex items-center gap-2 rounded-full border border-border px-2 py-1 shadow-md backdrop-blur transition-all duration-150"
        [class.opacity-0]="!dirty() && !saving()"
        [class.translate-y-1]="!dirty() && !saving()"
        [class.opacity-100]="dirty() || saving()"
        [class.translate-y-0]="dirty() || saving()"
      >
        <span class="text-muted-foreground px-1.5 text-[11px]">
          @if (saving()) {
            Saving…
          } @else {
            Unsaved changes
          }
        </span>
        <button
          type="button"
          hlmBtn
          variant="ghost"
          size="xs"
          class="text-muted-foreground hover:text-foreground h-7 px-2 text-[11px]"
          [disabled]="!dirty() || saving()"
          (click)="discardEdits()"
        >
          Discard
        </button>
        <button
          type="button"
          hlmBtn
          variant="default"
          size="xs"
          class="h-7 px-3 text-[11px]"
          [disabled]="!dirty() || saving() || !canEdit()"
          (click)="save()"
        >
          Save
        </button>
      </div>
    </div>
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

  // FS-activity tick for the open workspace. Bumped on every watcher
  // ping; feeds the diff card's `refreshTick` and drives the reconcile
  // effect that refreshes the open editor buffer against disk.
  protected readonly watcherTick = this.repos.watcherTickFor(this.workspaceId);
  private _lastSeenTick = -1;

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

  private readonly cachedChangedFiles = this.repos.cachedChangedFilesFor(
    this.workspaceId,
  );
  // Map the workspace-relative path to a `FileDiffStatus`. Null when the
  // path is not in the changed-files cache (e.g. tracked-but-unchanged or
  // the cache hasn't loaded yet) so no status badge is shown rather than
  // guessing a wrong 'modified'.
  protected readonly fileChangeStatus = computed<FileDiffStatus | null>(() => {
    const p = this.filePath();
    if (!p) return null;
    const files = this.cachedChangedFiles();
    if (!files) return null;
    const match: ChangedFile | undefined = files.find((f) => f.path === p);
    return match?.status ?? null;
  });
  protected readonly statusBadge = computed<StatusBadge | null>(() => {
    const status = this.fileChangeStatus();
    return status ? STATUS_BADGE[status] : null;
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
  // Editor buffer. Plain signal — NOT a linkedSignal — because reading
  // `readEdit` inside a linkedSignal subscribes to `_dirtyEdits`, and a
  // post-save `clearEdit()` would then snap the buffer back to '' and
  // wipe the editor. Seeded/reset by an effect on (workspace, path) via
  // `untracked` so the dirty-edits map is NOT a dependency.
  protected readonly editorValue = signal<string>('');
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

  protected readonly copyState = signal<CopyState>('idle');
  protected readonly copyTooltip = computed(() => {
    switch (this.copyState()) {
      case 'copied':
        return 'Copied!';
      case 'err':
        return 'Copy failed';
      default:
        return 'Copy path';
    }
  });
  private copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  private loadFetchId = 0;
  private readonly loadedEditKey = linkedSignal<string | null>(() => {
    this.resetKey();
    return null;
  });

  constructor() {
    // Seed/reset editorValue on (workspace, path) change ONLY. Reading
    // `readEdit` in `untracked` keeps `_dirtyEdits` out of the dep list,
    // so a post-save `clearEdit()` does NOT trigger this and wipe the
    // editor buffer. If no in-memory edit exists, leave the buffer empty;
    // `loadFile()` will populate it once the disk read settles.
    effect(() => {
      const key = this.resetKey();
      untracked(() => {
        const [ws, path] = decodeResetKey(key);
        if (!ws || !path) {
          this.editorValue.set('');
          return;
        }
        const edit = this.uiState.readEdit(ws, path);
        this.editorValue.set(edit?.content ?? '');
      });
    });

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
    // preview tab, promote it to pinned.
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

    // Diff-mode scroll persistence. The actual scroll surface is the
    // `<mz-diff-view>` host (in libs/mozart-ui/diff-view, marked
    // `overflow-auto`). We snapshot its scrollTop on cleanup, restore
    // on activate via afterNextRender.
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

    // External-change reconcile: when the FS watcher pings (a file
    // changed on disk — e.g. edited in another editor), re-read the
    // open file. Skips the first tick (initial wiring) and any file
    // we haven't loaded yet (the mode effect already reads current
    // disk on first open). The reconcile itself hashes against the
    // baseline, so unrelated worktree changes — the watcher fires for
    // the whole tree — neither flash the editor nor raise a false
    // stale warning.
    effect(() => {
      const tick = this.watcherTick();
      untracked(() => {
        const first = this._lastSeenTick === -1;
        this._lastSeenTick = tick;
        if (first) return;
        const ws = this.workspaceId();
        const p = this.filePath();
        if (!ws || !p) return;
        if (this.loadedEditKey() !== fileStateKey(ws, p)) return;
        void this.reconcileExternalChange(ws, p);
      });
    });

    // Final snapshot on component destroy — covers chat-tab-switch
    // and route-navigate cases where the effect's cleanup didn't run.
    // Copy-state timer cleanup runs unconditionally so an edit-mode
    // destroy (the typical Copy click context) doesn't leak the timer
    // closure or write to a destroyed signal.
    this.destroyRef.onDestroy(() => {
      if (this.copyResetTimer !== null) {
        clearTimeout(this.copyResetTimer);
        this.copyResetTimer = null;
      }
      const ws = this.workspaceId();
      const p = this.filePath();
      if (this.mode() !== 'diff' || !ws || !p) return;
      const el = this.findDiffScrollEl();
      if (el) this.scrollPosition.remember(fileTabKey(ws, p), el.scrollTop);
    });
  }

  private findDiffScrollEl(): HTMLElement | null {
    return this.hostEl.nativeElement.querySelector('mz-diff-view');
  }

  protected setMode(value: string): void {
    if (value !== 'edit' && value !== 'diff') return;
    if (value === 'edit' && !this.canEdit()) return;
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

  protected async copyPath(): Promise<void> {
    const path = this.filePath();
    if (!path) return;
    this.clearCopyResetTimer();
    try {
      await navigator.clipboard.writeText(path);
      this.copyState.set('copied');
    } catch {
      this.copyState.set('err');
    }
    this.copyResetTimer = setTimeout(() => {
      this.copyState.set('idle');
      this.copyResetTimer = null;
    }, 1500);
  }

  private clearCopyResetTimer(): void {
    if (this.copyResetTimer !== null) {
      clearTimeout(this.copyResetTimer);
      this.copyResetTimer = null;
    }
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
      this.uiState.clearEdit(ws, p);
      this.mutations.softRefreshAfterMutation(ws);
    } catch (err) {
      this.saveError.set(mapSaveError(err));
    } finally {
      this.saving.set(false);
    }
  }

  // Re-read the open file after an external (non-Mozart) change. No-op
  // when the on-disk content still matches our baseline (most watcher
  // ticks aren't about this file). Clean buffer → silently adopt the
  // new content; dirty buffer → raise the stale banner so the user
  // chooses reload vs. overwrite rather than losing unsaved edits.
  private async reconcileExternalChange(
    workspaceId: string,
    path: string,
  ): Promise<void> {
    if (this.saving()) return;
    let text: string;
    try {
      text = await this.repos.loadFile(workspaceId, path);
    } catch {
      return; // file may be mid-rename/delete — leave the buffer as-is
    }
    if (this.workspaceId() !== workspaceId || this.filePath() !== path) return;
    const hash = await sha256Hex(text);
    if (this.workspaceId() !== workspaceId || this.filePath() !== path) return;
    if (hash === this.baselineHash()) return;
    if (this.dirty()) {
      if (!this.saveError()) {
        this.saveError.set({ kind: 'stale', message: 'File changed on disk.' });
      }
      return;
    }
    this.baseline.set(text);
    this.baselineHash.set(hash);
    this.editorValue.set(text);
    this.loadedEditKey.set(fileStateKey(workspaceId, path));
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
