import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmKbdImports } from '@mozart/ui/kbd';
import { HlmTabsImports } from '@mozart/ui/tabs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideGitCompareArrows,
  lucideListTree,
} from '@ng-icons/lucide';
import { events } from '../../../core/_bindings';
import { FeatureFileTree } from '@mozart/desktop-repositories-feature';
import {
  FileViewsFacade,
  RepositoriesFacade,
  type ChangedFile,
} from '@mozart/desktop-repositories-data-access';
import type { FileNode } from '@mozart/desktop-repositories-util';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import {
  FileTabsService,
  WorkspacesFacade,
  WorkspaceTabRegistry,
} from '@mozart/desktop-workspaces-data-access';
import { workspaceTabRouteCommands } from '@mozart/desktop-workspaces-util';
import { FeatureChangesList } from './feature-changes-list';

// Shared empty array — returning the same reference on cache miss
// keeps `changedFiles`'s computed reference-stable so downstream
// filters don't re-run on every CD pass while the cache is empty.
const EMPTY_CHANGED_FILES: readonly ChangedFile[] = [];

// Top half of the workspace aside: "All files" + "Changes" tabs.
// Owns the per-workspace FS watcher and the agent-run-terminated
// listener that auto-routes to Changes when the agent produces a diff.
// The Changes-tab body lives in `<app-feature-changes-list>` so the
// staged/unstaged grouping and per-file mutations don't crowd this
// file. Auto-route stays here because it writes ui-state.filesView —
// the parent owns tab routing.
@Component({
  selector: 'app-feature-workspace-files',
  imports: [
    NgIcon,
    HlmIconImports,
    HlmKbdImports,
    HlmTabsImports,
    FeatureFileTree,
    FeatureChangesList,
  ],
  providers: [
    provideIcons({
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
            @if (changedFilesCount() > 0) {
              <kbd hlmKbd class="font-mono">{{ changedFilesCount() }}</kbd>
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
        <app-feature-changes-list />
      </div>
    </hlm-tabs>
  `,
})
export class FeatureWorkspaceFiles {
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly repos = inject(RepositoriesFacade);
  private readonly fileViews = inject(FileViewsFacade);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fileTabs = inject(FileTabsService);
  private readonly tabs = inject(WorkspaceTabRegistry);
  private readonly router = inject(Router);
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

  // Per-workspace tab state, persisted via UiStateStore.
  protected readonly asideState = this.uiState.asideStateFor(this.workspaceId);
  protected readonly filesView = computed(() => this.asideState().filesView);

  // Path of the currently-active file tab in the central shell. Drives
  // the active-row highlight on All files.
  protected readonly activeFilePath = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return null;
    return this.fileTabs.activeByWorkspace().get(id) ?? null;
  });

  // Count for the Changes tab badge. Reads through the same cache the
  // child consumes — single source of truth, no input plumbing.
  private readonly cachedChangedFiles = this.repos.cachedChangedFilesFor(
    this.workspaceId,
  );
  protected readonly changedFilesCount = computed(
    () => (this.cachedChangedFiles() ?? EMPTY_CHANGED_FILES).length,
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

    // Auto-route to Changes when the active workspace's agent run
    // completes with a non-empty diff. Silent route: no toast. Stays
    // on the parent because it writes ui-state.filesView — tab routing
    // belongs to the tab owner.
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

  protected onFileSelected(node: FileNode): void {
    if (node.kind === 'directory') return;
    this.openFileFromAllFiles(node.path);
  }

  private openFileFromAllFiles(path: string): void {
    const id = this.workspaceId();
    if (!id) return;
    const workspace = this.workspaces.workspaceById(id)();
    if (!workspace) return;
    const tabId = this.tabs.fileTabId(path);
    if (!tabId) return;

    this.uiState.openWorkspaceFile(id, path, {
      mode: 'edit',
      source: 'all-files',
    });
    void this.router.navigate(
      workspaceTabRouteCommands(workspace.projectId, id, tabId),
    );
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
