import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HlmBadgeImports } from '@mozart/ui/badge';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmContextMenuImports } from '@mozart/ui/context-menu';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSkeletonImports } from '@mozart/ui/skeleton';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideChevronUp,
  lucideCircleStop,
  lucideGitCompareArrows,
  lucideListTree,
  lucidePlay,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { ProjectsFacade } from '../../projects';
import {
  FeatureFileTree,
  RepositoriesFacade,
  UiChangesContextMenu,
  UiConfirmDiscardChangesDialog,
  type ChangedFile,
  type ConfirmDiscardChangesContext,
  type FileNode,
} from '../../repositories';
import { FeatureWorkspaceRun, RunRegistry } from '../../runs';
import { FeatureWorkspaceTerminal } from '../../terminals';
import { UiStateFacade, type WorkspaceAsideBottomTab } from '../../ui-state';
import { FileTabsService } from '../data/file-tabs.service';
import { WorkspacesFacade } from '../data/workspace.facade';

// ─────────────────────────────────────────────────────────────────────
// Tab-state map  (post-P1.1 — dogfood-readiness)
// ─────────────────────────────────────────────────────────────────────
// Every signal in this component that influences which tab / sub-tab
// is visible, and where it lives. Decision context lives in
// docs/specs/plan-mozart-dogfood-readiness.md §P1.1.
//
//   Signal              Source                            Scope
//   ──────────────────  ────────────────────────────────  ───────────────
//   bottomTab           uiState.asideStateFor(wsId)       per-workspace
//                                                         (localStorage)
//   filesView           uiState.asideStateFor(wsId)       per-workspace
//                                                         (localStorage)
//   bottomOpen          uiState.asideStateFor(wsId)       per-workspace
//                                                         (localStorage)
//   bottomHeight        uiState.asideStateFor(wsId)       per-workspace
//                                                         (localStorage)
//   stagedOpen          uiState.asideStateFor(wsId)       per-workspace
//                                                         (localStorage)
//   unstagedOpen        uiState.asideStateFor(wsId)       per-workspace
//                                                         (localStorage)
//   activeFilePath      FileTabsService.activeByWorkspace per-workspace
//   watcherTick         local signal, bumped by watcher   component
//                                                         (internal)
//   changedFiles        local signal — data, not tab UI   component
//
// URL contract:
//   `?tab=…` is a one-shot deep-link hint. On the first activation of
//   a given workspace this session the hint is consumed into
//   UiStateStore (only if no entry exists yet), then the param is
//   removed from the URL — preventing Angular's
//   `queryParamsHandling: 'merge'` from leaking it across workspaces.
//
// Sub-tab vs top-tab for "Changes":
//   "All files" / "Changes" stays a Files-slot sub-tab (`filesView`),
//   not a peer of the setup / run / terminal bottom-tabs. The bottom
//   slot keeps three values only; P2.4 tab-aware open behavior reads
//   `filesView` per-workspace from the same store.
// ─────────────────────────────────────────────────────────────────────

// Right aside is a vertical stack:
//   - Files (flex-1) : All files / Changes tabs, click opens main tab
//   - Bottom toolbar (always visible) : Setup / Run / Terminal + Run
//   - Bottom content (fixed h-72 when open, hidden when collapsed)
// Run + Terminal are lazy-loaded via `@defer` so xterm and the run-
// command machinery don't bloat the main bundle.
type BottomTab = WorkspaceAsideBottomTab;

const BOTTOM_TAB_VALUES: readonly BottomTab[] = [
  'setup',
  'run',
  'terminal',
] as const;
const DEFAULT_BOTTOM_TAB: BottomTab = 'run';

function coerceBottomTab(raw: string | null): BottomTab {
  return (BOTTOM_TAB_VALUES as readonly string[]).includes(raw ?? '')
    ? (raw as BottomTab)
    : DEFAULT_BOTTOM_TAB;
}

@Component({
  selector: 'app-feature-workspace-aside',
  imports: [
    NgTemplateOutlet,
    HlmBadgeImports,
    HlmButtonImports,
    HlmContextMenuImports,
    HlmIconImports,
    HlmTooltipImports,
    NgIcon,
    FeatureFileTree,
    FeatureWorkspaceRun,
    FeatureWorkspaceTerminal,
    UiChangesContextMenu,
    ...HlmSkeletonImports,
  ],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronUp,
      lucideCircleStop,
      lucideGitCompareArrows,
      lucideListTree,
      lucidePlay,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full flex-col bg-background' },
  template: `
    <!-- Files area takes flex-1. Toolbar pinned below; bottom content
         area conditional. Section headers carry the sidebar bg; the
         content areas stay transparent so the bg-background of the
         shell shows through (item: "remove background for content"). -->
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-0 flex-1 flex-col" data-tour="aside-files-tab">
        <!-- Files-view picker: labeled rounded pill tabs. No
               background row, no border underline — just two pills
               that highlight when active. -->
        <div
          class="flex h-9 shrink-0 items-center gap-1 px-2"
          role="tablist"
          aria-label="Files view"
        >
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="filesView() === 'all'"
            (click)="setFilesView('all')"
            class="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-normal text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground aria-selected:bg-brand/10 aria-selected:text-foreground"
          >
            <ng-icon hlm name="lucideListTree" size="xs" />
            <span>All files</span>
          </button>
          <button
            type="button"
            role="tab"
            [attr.aria-selected]="filesView() === 'changes'"
            (click)="setFilesView('changes')"
            class="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-normal text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground aria-selected:bg-brand/10 aria-selected:text-foreground"
          >
            <ng-icon hlm name="lucideGitCompareArrows" size="xs" />
            <span>Changes</span>
            @if (changedFiles().length > 0) {
              <span
                hlmBadge
                variant="secondary"
                class="h-4 min-w-4 justify-center rounded-md px-1 text-xs font-medium"
              >
                {{ changedFiles().length }}
              </span>
            }
          </button>
        </div>

        <!-- Files / Changes are rendered IN PARALLEL with [hidden]
             rather than swapped via @if so the file-tree's CdkTree
             DOM survives the tab toggle. Switching from "All files"
             to "Changes" and back used to remount the tree component
             and rebuild every row from scratch — wasted hundreds of
             ms on large repos. Same pattern as the bottom-slot
             tabs lower in this template. -->
        <app-feature-file-tree
          class="block min-h-0 flex-1"
          [hidden]="filesView() !== 'all'"
          [workspaceId]="workspaceId()"
          [projectId]="activeProjectId()"
          [refreshTick]="watcherTick()"
          [activePath]="activeFilePath()"
          (fileSelected)="onFileSelected($event)"
        />

        <!-- Changes : flat path list. Click opens the file as a
               tab in the central shell tab bar (the diff renders in
               the central content area, replacing the chat panel).
               When staged files exist, the list splits into two
               collapsible groups; otherwise it's a single flat list
               for the common case. -->
        <div
          class="min-h-0 flex-1 flex-col overflow-y-auto"
          [class.flex]="filesView() === 'changes'"
          [hidden]="filesView() !== 'changes'"
        >
          @if (changedFiles().length === 0) {
            <p class="p-4 text-xs text-muted-foreground">
              No changes since the base branch.
            </p>
          } @else if (stagedFiles().length > 0) {
            <!-- Staged group -->
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
            <!-- Unstaged group -->
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
            [attr.aria-current]="activeFilePath() === file.path ? 'true' : null"
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
            <span class="min-w-0 flex-1 truncate font-mono">{{
              file.path
            }}</span>
            @if (file.added > 0 || file.removed > 0) {
              <span
                class="ml-auto flex shrink-0 items-center gap-1 font-mono text-[10px] tabular-nums"
              >
                @if (file.added > 0) {
                  <span class="text-emerald-600 dark:text-emerald-500"
                    >+{{ file.added }}</span
                  >
                }
                @if (file.removed > 0) {
                  <span class="text-red-600 dark:text-red-500"
                    >−{{ file.removed }}</span
                  >
                }
              </span>
            }
          </button>
        </ng-template>
      </div>
    </div>

    <!-- Drag handle to resize the bottom-slot content area. Only
         renders when the bottom is open. Mousedown captures the
         pointer and updates bottomHeight until release. -->
    @if (bottomOpen()) {
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize bottom panel"
        (mousedown)="onResizeStart($event)"
        class="h-1 shrink-0 cursor-row-resize bg-sidebar-border hover:bg-brand/60 active:bg-brand"
      ></div>
    }

    <!-- Bottom slot — toolbar always visible at the bottom edge of
         the aside. Content area collapses to 0 height when closed.
         Collapse toggle far left, Run trigger far right. border-t
         separates the toolbar from the files area above. -->
    <div
      class="flex h-9 shrink-0 items-stretch border-t border-b border-sidebar-border bg-sidebar"
      role="tablist"
      aria-label="Workspace processes"
    >
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        [hlmTooltip]="bottomOpen() ? 'Collapse panel' : 'Expand panel'"
        position="top"
        class="my-1 ml-1 size-7 shrink-0 rounded-md text-muted-foreground"
        [attr.aria-expanded]="bottomOpen()"
        (click)="toggleBottomSlot()"
      >
        <ng-icon
          hlm
          [name]="bottomOpen() ? 'lucideChevronDown' : 'lucideChevronUp'"
          size="xs"
        />
      </button>
      <button
        #setupTabBtn
        type="button"
        role="tab"
        [attr.aria-selected]="bottomOpen() && bottomTab() === 'setup'"
        (click)="onTabClick('setup')"
        class="relative flex h-full items-center px-2 text-xs font-light text-muted-foreground transition-colors hover:bg-accent/60 aria-selected:bg-brand/10 aria-selected:text-foreground"
      >
        Setup
        @if (bottomOpen() && bottomTab() === 'setup') {
          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand shadow-[0_0_8px_hsl(var(--brand)/0.45)]"
          ></span>
        }
      </button>
      <button
        #runTabBtn
        type="button"
        role="tab"
        [attr.aria-selected]="bottomOpen() && bottomTab() === 'run'"
        (click)="onTabClick('run')"
        class="relative flex h-full items-center px-2 text-xs font-light text-muted-foreground transition-colors hover:bg-accent/60 aria-selected:bg-brand/10 aria-selected:text-foreground"
      >
        Run
        @if (bottomOpen() && bottomTab() === 'run') {
          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand shadow-[0_0_8px_hsl(var(--brand)/0.45)]"
          ></span>
        }
      </button>
      <button
        #terminalTabBtn
        type="button"
        role="tab"
        [attr.aria-selected]="bottomOpen() && bottomTab() === 'terminal'"
        (click)="onTabClick('terminal')"
        class="relative flex h-full items-center px-2 text-xs font-light text-muted-foreground transition-colors hover:bg-accent/60 aria-selected:bg-brand/10 aria-selected:text-foreground"
      >
        Terminal
        @if (bottomOpen() && bottomTab() === 'terminal') {
          <span
            aria-hidden="true"
            class="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand shadow-[0_0_8px_hsl(var(--brand)/0.45)]"
          ></span>
        }
      </button>
      <span class="flex-1"></span>
      @if (runStatus() === 'running') {
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          hlmTooltip="Stop the run"
          position="top"
          class="my-1 mr-1 size-7 shrink-0 rounded-md text-destructive"
          (click)="onStopRun()"
        >
          <ng-icon hlm name="lucideCircleStop" size="xs" />
        </button>
      } @else {
        <button
          hlmBtn
          variant="ghost"
          size="icon-xs"
          type="button"
          hlmTooltip="Run the configured command"
          position="top"
          class="my-1 mr-1 size-7 shrink-0 rounded-md text-muted-foreground"
          [disabled]="!hasRunCommand() || frozen()"
          (click)="onStartRun()"
        >
          <ng-icon hlm name="lucidePlay" size="xs" />
        </button>
      }
    </div>

    <!-- Content area — collapses to 0 height when closed. Each tab
         is rendered in parallel inside [hidden] divs so state
         survives switches (Terminal PTY in particular stays alive
         across visits). Heavy tabs use @defer to keep their chunks
         out of the main bundle. -->
    @if (bottomOpen()) {
      <div class="shrink-0 overflow-hidden" [style.height.px]="bottomHeight()">
        <!-- Setup : plain text, always rendered. -->
        <div [hidden]="bottomTab() !== 'setup'" class="h-full overflow-auto">
          <div class="p-4 text-sm text-muted-foreground">
            <p class="font-medium text-foreground">Setup</p>
            <p class="mt-1">
              Workspace setup steps — package install, run command, environment
              — land here.
            </p>
          </div>
        </div>

        <!-- Run : the panel is light (it's an EmptyState until a run
             fires; xterm only mounts on start). No defer — the earlier
             on-immediate trigger delayed first paint of the workspace
             and showed an empty bg-muted strip for around a second. -->
        <div [hidden]="bottomTab() !== 'run'" class="h-full overflow-hidden">
          <app-feature-workspace-run
            class="block h-full w-full"
            [workspaceId]="workspaceId()"
            [active]="bottomTab() === 'run'"
          />
        </div>

        <!-- Terminal : @defer (on interaction) waits until the user
             clicks the Terminal tab button. Once loaded the PTY
             stays alive across tab switches — re-opening Terminal
             returns to the same scrollback. -->
        <div
          [hidden]="bottomTab() !== 'terminal'"
          class="h-full overflow-hidden"
        >
          @defer (on interaction(terminalTabBtn)) {
            <app-feature-workspace-terminal
              class="block h-full w-full"
              [workspaceId]="workspaceId()"
              [active]="bottomTab() === 'terminal'"
            />
          } @loading (minimum 0ms) {
            <hlm-skeleton class="h-full w-full rounded-none" />
          } @placeholder {
            <hlm-skeleton class="h-full w-full rounded-none opacity-40" />
          }
        </div>
      </div>
    }
  `,
})
export class FeatureWorkspaceAside {
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly repos = inject(RepositoriesFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fileTabs = inject(FileTabsService);
  private readonly runs = inject(RunRegistry);
  private readonly projects = inject(ProjectsFacade);
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

  // Live status of the active workspace's run, surfaced in the bottom
  // toolbar so the play/stop button always reflects reality.
  protected readonly runStatus = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return 'idle' as const;
    return this.runs.ensureEntry(id).status();
  });

  protected readonly hasRunCommand = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return false;
    const ws = this.workspaces.workspaceById(id)();
    if (!ws) return false;
    const project = this.projects.byId(ws.projectId)();
    return !!project?.runCommand;
  });

  // Plan P0.2 — when the active workspace is frozen (status === 'done')
  // the bottom-toolbar Run button is disabled. Stop stays available so
  // an in-flight run can still be cancelled.
  protected readonly frozen = computed(() => {
    const id = this.workspaces.activeId();
    return id ? this.workspaces.isFrozen(id)() : false;
  });

  // Per-workspace tab + pane state. Backed by UiStateStore so each
  // workspace remembers its own choices across switches and reloads.
  // All template bindings read from these `computed`s; mutations go
  // through `uiState.updateWorkspaceAsideState` so the storage-sync
  // adapter picks them up.
  protected readonly asideState = this.uiState.asideStateFor(this.workspaceId);
  protected readonly bottomTab = computed(() => this.asideState().bottomTab);
  protected readonly filesView = computed(() => this.asideState().filesView);
  protected readonly bottomOpen = computed(() => this.asideState().bottomOpen);
  protected readonly bottomHeight = computed(
    () => this.asideState().bottomHeight,
  );
  protected readonly stagedOpen = computed(() => this.asideState().stagedOpen);
  protected readonly unstagedOpen = computed(
    () => this.asideState().unstagedOpen,
  );

  // Workspace ids whose `?tab=` URL hint has already been consumed
  // this session. The first activation of a workspace reads the
  // hint into store (if present), then clears the URL so it can't
  // leak across workspace switches via Angular's queryParam merge.
  private readonly hydratedFromUrl = new Set<string>();

  // Changed-files snapshot, refreshed on workspace change and on each
  // FS watcher tick. Empty when no workspace is active.
  protected readonly changedFiles = signal<readonly ChangedFile[]>([]);

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

  // Bumped on every FS-watcher ping. The file-tree consumes this as
  // an input → effects re-run and re-fetch.
  protected readonly watcherTick = signal(0);

  // Path of the currently-active file tab in the central shell. Drives
  // the active-row highlight on All files / Changes lists.
  protected readonly activeFilePath = computed(() => {
    const id = this.workspaces.activeId();
    if (!id) return null;
    return this.fileTabs.activeByWorkspace().get(id) ?? null;
  });

  // Active watcher unsubscribe; replaced when workspaceId changes,
  // called on destroy.
  private currentUnwatch: (() => void) | null = null;

  constructor() {
    // One watcher per active workspace. When the workspace changes
    // (or component is destroyed), tear down the previous subscription.
    effect((onCleanup) => {
      const id = this.workspaceId();
      this.detachWatcher();
      if (!id) return;
      void this.attachWatcher(id);
      onCleanup(() => this.detachWatcher());
    });
    this.destroyRef.onDestroy(() => this.detachWatcher());

    // One-shot URL → store hydration per workspace. The URL `?tab=` is
    // honored only on the first activation of a given workspace this
    // session; after that the store is the source of truth and the
    // URL param is cleared so it can't bleed into other workspaces
    // via Angular's queryParamsHandling: 'merge'.
    effect(() => {
      const id = this.workspaceId();
      if (!id || this.hydratedFromUrl.has(id)) return;
      this.hydratedFromUrl.add(id);
      const raw = this.route.snapshot.queryParamMap.get('tab');
      const hasEntry = !!this.uiState.asideStateByWorkspace()[id];
      if (raw !== null && !hasEntry) {
        this.uiState.updateWorkspaceAsideState(id, {
          bottomTab: coerceBottomTab(raw),
        });
      }
      if (raw !== null) {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { tab: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        });
      }
    });

    // Reload the changed-files snapshot on workspace change and on
    // every FS watcher tick. The Changes tab reads from this signal.
    effect(() => {
      const id = this.workspaceId();
      // Subscribe to the watcher tick so post-write refreshes happen.
      this.watcherTick();
      if (!id) {
        this.changedFiles.set([]);
        return;
      }
      void this.repos
        .listChangedFiles(id)
        .then((files) => {
          if (this.workspaceId() === id) {
            this.changedFiles.set(files);
          }
        })
        .catch((err) => {
          console.warn('[aside] list changed files failed:', err);
          if (this.workspaceId() === id) {
            this.changedFiles.set([]);
          }
        });
      // Refresh sidebar aggregate chips alongside the file list — same
      // tick that picks up new files also picks up new line counts.
      void this.workspaces.refreshDiffStats();
    });
  }

  protected setFilesView(view: 'all' | 'changes'): void {
    const id = this.workspaceId();
    if (!id) return;
    this.uiState.updateWorkspaceAsideState(id, { filesView: view });
  }

  protected onChangedFileClick(file: ChangedFile): void {
    const id = this.workspaceId();
    if (!id) return;
    // Opens a file tab in the central shell tab bar AND makes it
    // active — the workspace detail page then swaps the chat panel
    // for the diff view.
    this.fileTabs.openFor(id, file.path);
  }

  /** Flip the file's staged state via `git add` / `git reset HEAD`.
   *  The ChangedFile row carries the current staged flag, so the toggle
   *  direction is local; the FS watcher refreshes the list afterwards. */
  protected async onToggleStaged(file: ChangedFile): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      if (file.staged) {
        await this.repos.unstageFile(id, file.path);
      } else {
        await this.repos.stageFile(id, file.path);
      }
      // Force an immediate refresh — the FS watcher debounces and the
      // user expects the row to flip groups on the next paint.
      this.watcherTick.update((n) => n + 1);
    } catch (err) {
      console.warn('[aside] toggle staged failed:', err);
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
      console.warn('[aside] copy path failed:', err);
      toast.error('Could not copy path');
    }
  }

  /** Right-clicked → Discard changes. Destructive: open a confirmation
   *  dialog first; on confirm reuse the existing workspace-level reset
   *  command (per plan: `discard_changes_to` reused for v0.1.0-beta.1). */
  protected onDiscardChanges(file: ChangedFile): void {
    const id = this.workspaceId();
    if (!id) return;
    const context: ConfirmDiscardChangesContext = {
      path: file.path,
      onConfirm: async () => {
        try {
          await this.repos.discardWorkspaceChanges(id);
          this.watcherTick.update((n) => n + 1);
        } catch (err) {
          toast.error('Could not discard changes', {
            description: err instanceof Error ? err.message : String(err),
          });
        }
      },
    };
    this.dialogService.open(UiConfirmDiscardChangesDialog, { context });
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

  protected onFileSelected(node: FileNode): void {
    if (node.kind === 'directory') return;
    const id = this.workspaceId();
    if (!id) return;
    // Tree click opens a file tab in the central shell — matches the
    // Changes list behavior so there's a single way files surface.
    this.fileTabs.openFor(id, node.path);
  }

  // Clicking a tab :
  //   - opens the bottom slot if it's collapsed
  //   - records the choice in UiStateStore so it survives ws switches
  protected onTabClick(tab: BottomTab): void {
    const id = this.workspaceId();
    if (!id) return;
    const patch: Partial<{ bottomOpen: boolean; bottomTab: BottomTab }> = {};
    if (!this.bottomOpen()) patch.bottomOpen = true;
    if (tab !== this.bottomTab()) patch.bottomTab = tab;
    if (Object.keys(patch).length === 0) return;
    this.uiState.updateWorkspaceAsideState(id, patch);
  }

  protected toggleBottomSlot(): void {
    const id = this.workspaceId();
    if (!id) return;
    this.uiState.updateWorkspaceAsideState(id, {
      bottomOpen: !this.bottomOpen(),
    });
  }

  /** Pointer-driven height resize for the bottom-slot content area.
   *  Captures the pointer on mousedown, follows movement, releases on
   *  mouseup. Height is clamped between 120 px (one prompt visible)
   *  and 80% of viewport (file tree still reachable). */
  protected onResizeStart(event: MouseEvent): void {
    event.preventDefault();
    const id = this.workspaceId();
    if (!id) return;
    const startY = event.clientY;
    const startHeight = this.bottomHeight();
    const min = 120;
    const max = Math.max(min + 1, Math.floor(window.innerHeight * 0.8));
    const onMove = (e: MouseEvent) => {
      // Dragging up grows the panel; clientY decreases as we move up.
      const delta = startY - e.clientY;
      const next = Math.min(max, Math.max(min, startHeight + delta));
      this.uiState.updateWorkspaceAsideState(id, { bottomHeight: next });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }

  protected async onStartRun(): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    try {
      await this.runs.start(id);
      // Auto-jump to the Run tab + expand the slot so the user sees
      // output the instant the process starts.
      const patch: Partial<{ bottomOpen: boolean; bottomTab: BottomTab }> = {};
      if (!this.bottomOpen()) patch.bottomOpen = true;
      if (this.bottomTab() !== 'run') patch.bottomTab = 'run';
      if (Object.keys(patch).length > 0) {
        this.uiState.updateWorkspaceAsideState(id, patch);
      }
    } catch (err) {
      console.warn('[aside] run start failed:', err);
    }
  }

  protected async onStopRun(): Promise<void> {
    const id = this.workspaces.activeId();
    if (!id) return;
    try {
      await this.runs.stop(id);
    } catch (err) {
      console.warn('[aside] run stop failed:', err);
    }
  }

  private async attachWatcher(workspaceId: string): Promise<void> {
    try {
      const unwatch = await this.repos.watch(workspaceId, () => {
        // Each ping bumps the tick; both children re-fetch via their
        // own effects. The aside owns the single subscription.
        if (this.workspaceId() === workspaceId) {
          this.watcherTick.update((n) => n + 1);
          // Same event is the canonical invalidation signal for the
          // file-tree cache (P1.2). Never call this on a timer.
          this.repos.invalidateTreeCache(workspaceId);
        }
      });
      // If the workspace changed during the await, drop the late
      // subscription immediately.
      if (this.workspaceId() !== workspaceId) {
        try {
          unwatch();
        } catch (e) {
          console.warn('[aside] late unwatch failed:', e);
        }
        return;
      }
      this.currentUnwatch = unwatch;
    } catch (err) {
      console.warn('[aside] watch failed:', err);
    }
  }

  private detachWatcher(): void {
    const fn = this.currentUnwatch;
    this.currentUnwatch = null;
    if (!fn) return;
    try {
      fn();
    } catch (e) {
      console.warn('[aside] unwatch failed:', e);
    }
  }
}
