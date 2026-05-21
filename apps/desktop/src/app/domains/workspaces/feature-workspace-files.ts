import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmKbdImports } from '@mozart/ui/kbd';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideChevronUp,
  lucideGitCompareArrows,
  lucideListTree,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { events } from '../../core/_bindings';
import { MzDiffStats } from '@mozart-ui/diff-stats';
import {
  FeatureFileTree,
  FileViewsFacade,
  RepositoriesFacade,
  UiConfirmDiscardChangesDialog,
  type ChangedFile,
  type ConfirmDiscardChangesContext,
  type FileNode,
} from '../repositories';
import { UiStateFacade } from '../ui-state';
import { FileTabsService } from './data/file-tabs.service';
import { WorkspacesFacade } from './data/workspace.facade';

// Shared empty array — returning the same reference on cache miss
// keeps `changedFiles`'s computed reference-stable so downstream
// filters don't re-run on every CD pass while the cache is empty.
const EMPTY_CHANGED_FILES: readonly ChangedFile[] = [];

// Top half of the workspace aside: "All files" + "Changes" tabs.
// Owns the per-workspace FS watcher and the agent-run-terminated
// listener that auto-routes to Changes when the agent produces a diff.
// Tab styling matches `feature-workspace-processes` (brand underline)
// so both halves read as one cohesive aside.
@Component({
  selector: 'app-feature-workspace-files',
  imports: [
    NgTemplateOutlet,
    NgIcon,
    HlmIconImports,
    HlmKbdImports,
    HlmTabsImports,
    FeatureFileTree,
    MzDiffStats,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronUp,
      lucideGitCompareArrows,
      lucideListTree,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <hlm-tabs
      class="flex min-h-0 flex-1 flex-col"
      data-tour="aside-files-tab"
      [tab]="filesView()"
      (tabActivated)="setFilesView($any($event))"
    >
      <!-- Header wrapper carries the bg-sidebar + border-b. No fixed
           height here — the inner buttons set h-9 themselves, which
           lets this strip resolve to exactly 37px total (36px tabs +
           1px border-b), matching the chat tab bar's vertical metrics
           without a box-sizing/border-box pixel mismatch. -->
      <div
        class="flex shrink-0 items-stretch border-b border-sidebar-border bg-sidebar"
      >
        <hlm-tabs-list
          variant="line"
          class="flex items-stretch bg-transparent p-0"
          aria-label="Files view"
        >
          <button
            hlmTabsTrigger="all"
            class="relative flex h-9 items-center gap-1.5 rounded-none border-transparent! bg-transparent! px-3 text-xs font-light text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none [&[data-state=active]]:after:absolute [&[data-state=active]]:after:inset-x-0 [&[data-state=active]]:after:-bottom-px [&[data-state=active]]:after:h-0.5 [&[data-state=active]]:after:rounded-full [&[data-state=active]]:after:bg-brand [&[data-state=active]]:after:shadow-[0_0_8px_hsl(var(--brand)/0.45)] [&[data-state=active]]:after:opacity-100"
          >
            <ng-icon hlm name="lucideListTree" size="xs" />
            <span>All files</span>
          </button>
          <button
            hlmTabsTrigger="changes"
            class="relative flex h-9 items-center gap-1.5 rounded-none border-transparent! bg-transparent! px-3 text-xs font-light text-muted-foreground! transition-colors hover:bg-accent/60! hover:text-foreground! data-[state=active]:bg-brand/10! data-[state=active]:text-foreground! data-[state=active]:shadow-none [&[data-state=active]]:after:absolute [&[data-state=active]]:after:inset-x-0 [&[data-state=active]]:after:-bottom-px [&[data-state=active]]:after:h-0.5 [&[data-state=active]]:after:rounded-full [&[data-state=active]]:after:bg-brand [&[data-state=active]]:after:shadow-[0_0_8px_hsl(var(--brand)/0.45)] [&[data-state=active]]:after:opacity-100"
          >
            <ng-icon hlm name="lucideGitCompareArrows" size="xs" />
            <span>Changes</span>
            @if (changedFiles().length > 0) {
              <kbd hlmKbd class="font-mono">{{ changedFiles().length }}</kbd>
            }
          </button>
        </hlm-tabs-list>
      </div>

      <div hlmTabsContent="all" class="flex min-h-0 flex-1 flex-col">
        @if (filesView() === 'all') {
          <!-- Lazy-mount: instantiating FeatureFileTree triggers a
               cache-miss fetch on the active workspace, which is the
               dominant cost when switching to a never-opened heavy
               repo. Only mount when the user is actually looking at
               this tab so a workspace persisted on 'changes' incurs
               zero file-tree work. -->
          <app-feature-file-tree
            class="block min-h-0 flex-1"
            [workspaceId]="workspaceId()"
            [projectId]="activeProjectId()"
            [activePath]="activeFilePath()"
            (fileSelected)="onFileSelected($event)"
          />
        }
      </div>

      <div
        hlmTabsContent="changes"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        @if (changedFiles().length === 0) {
          <p class="p-4 text-xs text-muted-foreground">
            No changes since the base branch.
          </p>
        } @else if (stagedFiles().length > 0) {
          <button
            type="button"
            (click)="toggleStagedOpen()"
            class="flex w-full items-center gap-1 px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            <ng-icon
              hlm
              [name]="stagedOpen() ? 'lucideChevronDown' : 'lucideChevronUp'"
              size="9px"
            />
            <span>Staged ({{ stagedFiles().length }})</span>
          </button>
          @if (stagedOpen()) {
            <ul class="flex flex-col">
              @for (file of stagedFiles(); track file.path) {
                <li>
                  <ng-container
                    [ngTemplateOutlet]="changedRowTpl"
                    [ngTemplateOutletContext]="{ $implicit: file }"
                  />
                </li>
              }
            </ul>
          }
          @if (unstagedFiles().length > 0) {
            <button
              type="button"
              (click)="toggleUnstagedOpen()"
              class="flex w-full items-center gap-1 px-2 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <ng-icon
                hlm
                [name]="
                  unstagedOpen() ? 'lucideChevronDown' : 'lucideChevronUp'
                "
                size="9px"
              />
              <span>Changes ({{ unstagedFiles().length }})</span>
            </button>
            @if (unstagedOpen()) {
              <ul class="flex flex-col pb-2">
                @for (file of unstagedFiles(); track file.path) {
                  <li>
                    <ng-container
                      [ngTemplateOutlet]="changedRowTpl"
                      [ngTemplateOutletContext]="{ $implicit: file }"
                    />
                  </li>
                }
              </ul>
            }
          }
        } @else {
          <ul class="flex flex-col py-1">
            @for (file of changedFiles(); track file.path) {
              <li>
                <ng-container
                  [ngTemplateOutlet]="changedRowTpl"
                  [ngTemplateOutletContext]="{ $implicit: file }"
                />
              </li>
            }
          </ul>
        }
      </div>

      <ng-template #changedRowTpl let-file>
        <button
          type="button"
          [attr.aria-current]="
            activeFilePath() === file.path ? 'true' : null
          "
          class="flex w-full items-center gap-2 px-3 py-1 text-left text-xs hover:bg-accent hover:text-accent-foreground aria-[current=true]:bg-brand/10 aria-[current=true]:text-foreground"
          (click)="onChangedFileClick(file)"
        >
          <span
            class="inline-block w-4 shrink-0 text-center font-mono text-[10px]"
            [class.text-green-600]="file.status === 'added'"
            [class.text-yellow-600]="file.status === 'modified'"
            [class.text-red-600]="file.status === 'deleted'"
          >
            {{ statusLetter(file.status) }}
          </span>
          <span class="min-w-0 flex-1 truncate font-mono">{{ file.path }}</span>
          <mz-diff-stats
            class="ml-auto"
            [added]="file.added"
            [removed]="file.removed"
          />
        </button>
      </ng-template>
    </hlm-tabs>
  `,
})
export class FeatureWorkspaceFiles {
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly repos = inject(RepositoriesFacade);
  private readonly fileViews = inject(FileViewsFacade);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fileTabs = inject(FileTabsService);
  private readonly dialogService = inject(HlmDialogService);
  private readonly uiState = inject(UiStateFacade);

  protected readonly workspaceId = this.workspaces.activeId;

  // Project the active workspace belongs to. Powers the file-tree's
  // sibling-cache fallback: when a never-opened workspace mounts and
  // a sibling has already cached a tree for the same project, that
  // tree paints as a placeholder until the real fetch resolves.
  protected readonly activeProjectId = computed(() => {
    const id = this.workspaceId();
    if (!id) return null;
    return this.workspaces.workspaceById(id)()?.projectId ?? null;
  });

  // Per-workspace tab + group state, persisted via UiStateStore.
  protected readonly asideState = this.uiState.asideStateFor(this.workspaceId);
  protected readonly filesView = computed(() => this.asideState().filesView);
  protected readonly stagedOpen = computed(() => this.asideState().stagedOpen);
  protected readonly unstagedOpen = computed(
    () => this.asideState().unstagedOpen,
  );

  // Path of the currently-active file tab in the central shell. Drives
  // the active-row highlight on All files / Changes lists.
  protected readonly activeFilePath = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return null;
    return this.fileTabs.activeByWorkspace().get(id) ?? null;
  });

  // Changed-files reactive accessor — reads through the repositories
  // cache so workspace alternation never pays the Tauri round-trip
  // when a fresh entry exists. Cache miss / FS-watcher invalidation
  // triggers a fetch via the effect below, which writes back into
  // the cache on resolve.
  protected readonly changedFiles = computed<readonly ChangedFile[]>(
    () => this.cachedChangedFiles() ?? EMPTY_CHANGED_FILES,
  );
  private readonly cachedChangedFiles = this.repos.cachedChangedFilesFor(
    this.workspaceId,
  );

  // Split for the Changes pane: files with index changes (X byte) go
  // in the Staged group; everything else in Unstaged. A file with
  // both staged and unstaged changes counts as staged here — git's
  // own UI does the same and the diff dialog handles the mixed case.
  protected readonly stagedFiles = computed(() =>
    this.changedFiles().filter((f) => f.staged),
  );
  protected readonly unstagedFiles = computed(() =>
    this.changedFiles().filter((f) => !f.staged),
  );

  private currentUnwatch: (() => void) | null = null;

  constructor() {
    // One watcher per active workspace. Replaces the subscription on
    // workspace switch; tears down on destroy.
    effect((onCleanup) => {
      const id = this.workspaceId();
      this.detachWatcher();
      if (!id) return;
      void this.attachWatcher(id);
      onCleanup(() => this.detachWatcher());
    });
    this.destroyRef.onDestroy(() => this.detachWatcher());

    // Initial fetch of the changed-files list on workspace switch.
    // Subsequent updates flow through the FS-watcher's soft-refresh
    // path (`refreshChangedFilesInBackground`) which keeps the cache
    // populated — so this effect only fires on the first visit per
    // workspace (cache miss). Diff stats + file views fire alongside
    // so the sidebar's +N/-N chips and saved-view bookkeeping seed
    // when the workspace is first opened.
    effect(() => {
      const id = this.workspaceId();
      if (!id) return;
      if (this.cachedChangedFiles() !== null) return;
      const capturedRevision = this.repos.treeRevisionFor(id);
      void this.repos
        .listChangedFiles(id)
        .then((files) => {
          if (this.workspaceId() !== id) return;
          this.repos.cacheChangedFiles(id, files, capturedRevision);
        })
        .catch((err) => {
          console.warn('[ws-files] list changed files failed:', err);
        });
      void this.workspaces.refreshDiffStats();
      void this.fileViews.refresh(id).catch((err) => {
        console.warn('[ws-files] refresh file views failed:', err);
      });
    });

    // P2.7.A — auto-route to Changes when the active workspace's agent
    // run completes with a non-empty diff. Silent route: no toast.
    void events.agentRunTerminated
      .listen((e) => {
        const payload = e.payload;
        if (payload.status !== 'done') return;
        if (payload.workspace_id !== this.workspaceId()) return;
        const capturedRevision = this.repos.treeRevisionFor(
          payload.workspace_id,
        );
        void this.repos
          .listChangedFiles(payload.workspace_id)
          .then((files) => {
            if (files.length === 0) return;
            if (this.workspaceId() !== payload.workspace_id) return;
            this.repos.cacheChangedFiles(
              payload.workspace_id,
              files,
              capturedRevision,
            );
            this.uiState.updateWorkspaceAsideState(payload.workspace_id, {
              filesView: 'changes',
            });
            void this.fileViews
              .invalidateAfterRun(payload.workspace_id)
              .catch((err) => {
                console.warn(
                  '[ws-files] file views invalidate after run failed:',
                  err,
                );
              });
          })
          .catch((err) => {
            console.warn(
              '[ws-files] auto-route changed files lookup failed:',
              err,
            );
          });
      })
      .then((unlisten) => {
        this.destroyRef.onDestroy(unlisten);
      });
  }

  // BrnTabs's `tabActivated` emits a plain `string` (the key of the
  // activated trigger). Narrow it back to the union before writing.
  protected setFilesView(view: string): void {
    if (view !== 'all' && view !== 'changes') return;
    const id = this.workspaceId();
    if (!id) return;
    this.uiState.updateWorkspaceAsideState(id, { filesView: view });
  }

  protected toggleStagedOpen(): void {
    const id = this.workspaceId();
    if (!id) return;
    this.uiState.updateWorkspaceAsideState(id, {
      stagedOpen: !this.stagedOpen(),
    });
  }
  protected toggleUnstagedOpen(): void {
    const id = this.workspaceId();
    if (!id) return;
    this.uiState.updateWorkspaceAsideState(id, {
      unstagedOpen: !this.unstagedOpen(),
    });
  }

  protected onChangedFileClick(file: ChangedFile): void {
    this.openFileFromChanges(file.path);
  }

  protected onFileSelected(node: FileNode): void {
    if (node.kind === 'directory') return;
    this.openFileFromAllFiles(node.path);
  }

  protected statusLetter(status: ChangedFile['status']): string {
    switch (status) {
      case 'added':
        return 'A';
      case 'modified':
        return 'M';
      case 'deleted':
        return 'D';
    }
  }

  /** Flip the file's staged state via `git add` / `git reset HEAD`.
   *  Triggers the same soft-refresh path the FS-watcher uses so the
   *  Changes pane reflects the new staged flag without waiting for
   *  the watcher's debounce window. */
  protected async onToggleStaged(file: ChangedFile): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      if (file.staged) {
        await this.repos.unstageFile(id, file.path);
      } else {
        await this.repos.stageFile(id, file.path);
      }
      this.softRefreshAfterMutation(id);
    } catch (err) {
      console.warn('[ws-files] toggle staged failed:', err);
      toast.error('Could not change staged state', {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  protected async onCopyPath(file: ChangedFile): Promise<void> {
    try {
      await navigator.clipboard.writeText(file.path);
      toast.success('Path copied');
    } catch (err) {
      console.warn('[ws-files] copy path failed:', err);
      toast.error('Could not copy path');
    }
  }

  /** Destructive — open a confirmation dialog first; on confirm reuse
   *  the workspace-level reset command. */
  protected onDiscardChanges(file: ChangedFile): void {
    const id = this.workspaceId();
    if (!id) return;
    const context: ConfirmDiscardChangesContext = {
      path: file.path,
      onConfirm: async () => {
        try {
          await this.repos.discardWorkspaceChanges(id);
          this.softRefreshAfterMutation(id);
        } catch (err) {
          toast.error('Could not discard changes', {
            description: err instanceof Error ? err.message : String(err),
          });
        }
      },
    };
    this.dialogService.open(UiConfirmDiscardChangesDialog, { context });
  }

  /** Shared post-mutation refresh: covers the case where the user's
   *  click on Stage / Discard produces UI updates faster than the
   *  FS-watcher's debounce window. Mirrors the watcher callback so
   *  both code paths converge on the same cache state. */
  private softRefreshAfterMutation(workspaceId: string): void {
    void this.repos.refreshTreeInBackground(workspaceId);
    void this.repos.refreshChangedFilesInBackground(workspaceId);
    void this.workspaces.refreshDiffStats();
    void this.fileViews.refresh(workspaceId).catch((err) => {
      console.warn('[ws-files] refresh file views failed:', err);
    });
  }

  private openFileFromAllFiles(path: string): void {
    const id = this.workspaceId();
    if (!id) return;
    this.uiState.openWorkspaceFile(id, path, {
      mode: 'edit',
      source: 'all-files',
    });
    this.fileTabs.openFor(id, path);
  }

  private openFileFromChanges(path: string): void {
    const id = this.workspaceId();
    if (!id) return;
    this.uiState.openWorkspaceFile(id, path, {
      mode: 'diff',
      source: 'changes',
    });
    this.fileTabs.openFor(id, path);
  }

  private async attachWatcher(workspaceId: string): Promise<void> {
    try {
      const unwatch = await this.repos.watch(workspaceId, () => {
        if (this.workspaceId() !== workspaceId) return;
        // Soft refresh: keep the old tree on screen, refetch in the
        // background, swap the cache entry atomically when the new
        // data lands. CdkTree's `trackBy: node.path` then reuses
        // unchanged rows so a typical save (one file's status flips)
        // never tears the tree down. The Rust-side cache was already
        // invalidated by `spawn_watcher` before this callback fired,
        // so the refetch goes straight to a real walk.
        void this.repos.refreshTreeInBackground(workspaceId);
        void this.repos.refreshChangedFilesInBackground(workspaceId);
        // Project-wide diff badge counts + per-workspace file-view
        // metadata. Previously fired indirectly via the
        // `watcherTick` → cache-invalidation chain; now that the
        // cache stays populated, trigger them directly so the
        // sidebar's +N/-N chips and saved-view bookkeeping stay in
        // step with FS changes.
        void this.workspaces.refreshDiffStats();
        void this.fileViews.refresh(workspaceId).catch((err) => {
          console.warn('[ws-files] refresh file views failed:', err);
        });
      });
      if (this.workspaceId() !== workspaceId) {
        try {
          unwatch();
        } catch (e) {
          console.warn('[ws-files] late unwatch failed:', e);
        }
        return;
      }
      this.currentUnwatch = unwatch;
    } catch (err) {
      console.warn('[ws-files] watch failed:', err);
    }
  }

  private detachWatcher(): void {
    const fn = this.currentUnwatch;
    this.currentUnwatch = null;
    if (!fn) return;
    try {
      fn();
    } catch (e) {
      console.warn('[ws-files] unwatch failed:', e);
    }
  }
}
