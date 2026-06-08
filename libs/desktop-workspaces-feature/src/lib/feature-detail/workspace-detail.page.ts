import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { OsService } from '@mozart/shared-util-os';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { LayoutService } from '@mozart/desktop-ui-state-data-access';
import { MacWindowControls } from '@mozart/desktop-core-ui';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import {
  FeatureCommitDialog,
  type CommitDialogContext,
} from '@mozart/desktop-repositories-feature';
import { RunRegistry } from '@mozart/desktop-runs-data-access';
import { IdeDetectionService } from '@mozart/desktop-workspaces-data-access';
import {
  OPEN_IN_TOOLS,
  type OpenInTool,
  type UiWorkspaceStatus,
} from '@mozart/desktop-workspaces-util';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import { WorkspaceToolbar } from '../workspace-toolbar';
import { WorkspaceDetailStore } from '@mozart/desktop-workspaces-data-access';

@Component({
  selector: 'app-workspace-detail-page',
  imports: [
    RouterOutlet,
    NgIcon,
    MacWindowControls,
    WorkspaceToolbar,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePanelLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // h-full (exact, not min-h-full) so the page is locked to the viewport.
  // overflow-hidden so any inner overflow is scoped to scroll containers
  // inside the page (chat-scroll-surface, CodeMirror) instead of leaking
  // up to <main>. Without this, long content can scroll the whole page
  // and the composer (absolutely positioned inside WorkspaceTabContent)
  // scrolls with it instead of staying pinned at viewport bottom.
  host: { class: 'flex h-full flex-col overflow-hidden' },
  template: `
    <app-workspace-toolbar
      class="sticky top-0 z-30"
      [projectIcon]="projectIcon()"
      [projectName]="projectName()"
      [repoPath]="project()?.path ?? null"
      [repoUrl]="repoUrl()"
      [workspaceTitle]="workspaceName()"
      [currentBranch]="workspace()?.branch ?? ''"
      [baseBranch]="workspace()?.baseBranch ?? 'main'"
      [isStreaming]="isStreaming()"
      [leadingSlot]="layout.leftPanelOpen() ? null : sidebarHeader()"
      [availableTools]="availableTools()"
      [lastUsedTool]="effectiveLastUsedTool()"
      [prUrl]="workspace()?.pr?.url ?? null"
      [prNumber]="workspace()?.pr?.number ?? null"
      [runStatus]="runStatus()"
      [hasRunCommand]="hasRunCommand()"
      [workspaceStatus]="workspaceStatus()"
      [frozen]="frozen()"
      [hasUncommittedChanges]="hasUncommittedChanges()"
      [baseFreshness]="baseFreshness()"
      [updatingFromBase]="updatingFromBase()"
      data-tour="aside-header-buttons"
      (toggleRightPanel)="layout.toggleRightPanel()"
      (workspaceTitleChange)="onRename($event)"
      (openIn)="onOpenIn($event)"
      (commit)="onCommit()"
      (updateFromBase)="onUpdateFromBase()"
      (openPr)="onOpenPr()"
      (openRepoFolder)="onOpenRepoFolder()"
      (openRepoRemote)="onOpenRepoRemote()"
      (run)="onRun()"
      (stopRun)="onStopRun()"
      (workspaceStatusChange)="onWorkspaceStatusChange($event)"
    />

    <section class="flex min-h-0 flex-1 flex-col">
      <router-outlet />
    </section>

    <ng-template #sidebarHeaderTpl>
      @if (isMac) {
        <app-mac-window-controls />
      }
      <button
        hlmBtn
        variant="ghost"
        size="icon-xs"
        type="button"
        hlmTooltip="Toggle left sidebar"
        position="bottom"
        class="size-7 rounded-md text-muted-foreground"
        (click)="layout.toggleLeftPanel(); $any($event.currentTarget).blur()"
      >
        <ng-icon hlm name="lucidePanelLeft" size="sm" />
      </button>
    </ng-template>
  `,
})
export class WorkspaceDetailPage {
  readonly projectId = input<string | undefined>();
  readonly workspaceId = input<string | undefined>();

  protected readonly store = inject(WorkspaceDetailStore);
  protected readonly layout = inject(LayoutService);
  protected readonly isMac = inject(OsService).isMac();

  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly ides = inject(IdeDetectionService);
  private readonly dialog = inject(HlmDialogService);
  private readonly runs = inject(RunRegistry);
  private readonly chatFacade = inject(ChatFacade);
  private readonly externalLink = inject(ExternalLinkService);
  private readonly repos = inject(RepositoriesFacade);

  protected readonly availableTools = this.ides.availableTools;

  protected readonly effectiveLastUsedTool = computed<OpenInTool>(() => {
    const tools = this.availableTools();
    const last = this.store.lastUsedTool();
    if (tools.find((t) => t.id === last.id)) return last;
    return tools[0] ?? OPEN_IN_TOOLS[0];
  });

  protected readonly workspace = computed(() => {
    const id = this.workspaceId();
    return id ? this.workspaces.workspaceById(id)() : null;
  });

  protected readonly project = computed(() => {
    const ws = this.workspace();
    return ws ? this.projects.byId(ws.projectId)() : null;
  });

  protected readonly projectName = computed(() => this.project()?.name ?? '');
  protected readonly projectIcon = computed(() => this.project()?.icon ?? null);
  protected readonly workspaceName = computed(() => this.workspace()?.name ?? '');

  // GitHub URL of the source repository, when the project's remote is a
  // github.com repo. Drives the clickable project crumb ("open on
  // GitHub"). Null for non-GitHub / pending / no-remote.
  protected readonly repoUrl = computed(() => {
    const pid = this.project()?.id;
    if (!pid) return null;
    const status = this.projects.githubRemoteStatusFor(pid)();
    return status?.kind === 'github'
      ? `https://github.com/${status.owner}/${status.repo}`
      : null;
  });

  protected readonly isStreaming = this.chatFacade.isStreaming(
    computed(() => this.workspaceId() ?? null),
  );

  // Working-tree changed files, kept reactive via `resource` (no manual
  // effect). Re-loads on workspace change and whenever the FS-watcher
  // revision bumps — tracked through the changed-files cache, which the
  // aside refreshes on watcher pings.
  private readonly changedFilesRevision = this.repos.cachedChangedFilesFor(
    computed(() => this.workspaceId() ?? null),
  );
  private readonly changedFilesResource = resource({
    params: () => ({
      id: this.workspaceId() ?? null,
      rev: this.changedFilesRevision(),
    }),
    loader: ({ params }) =>
      params.id
        ? this.repos.listChangedFiles(params.id)
        : Promise.resolve([]),
  });
  // Drives the Commit-button brand color: true when the working tree has
  // files to commit.
  protected readonly hasUncommittedChanges = computed(
    () => (this.changedFilesResource.value()?.length ?? 0) > 0,
  );

  // Base freshness for the toolbar chip. Cheap-local read on hydrate
  // (fetch=false) — no network round-trip; the chip renders immediately
  // from the last-fetched `origin/<base>` ref. The on-demand fetch
  // happens inside the update flow (`onUpdateFromBase`), which reloads
  // this resource afterwards.
  private readonly baseFreshnessResource = resource({
    params: () => ({ id: this.workspaceId() ?? null }),
    loader: ({ params }) =>
      params.id
        ? this.workspaces.baseFreshness(params.id, false)
        : Promise.resolve(null),
  });
  protected readonly baseFreshness = computed(
    () => this.baseFreshnessResource.value() ?? null,
  );
  // True while an update-from-base merge is in flight.
  protected readonly updatingFromBase = signal(false);

  protected readonly runStatus = computed(() => {
    const id = this.workspaceId();
    if (!id) return 'idle' as const;
    return this.runs.ensureEntry(id).status();
  });

  // Effective run command (DB column OR `.mozart/run.json`). Mirrors
  // `FeatureWorkspaceProcesses.hasRunCommand` so the page-level
  // toolbar agrees with the right-aside toolbar.
  protected readonly hasRunCommand = computed(() => {
    const pid = this.project()?.id;
    if (!pid) return false;
    return !!this.projects.effectiveCommandsFor(pid)().runCommand;
  });

  protected readonly frozen = computed(() => {
    const id = this.workspaceId();
    if (!id) return false;
    return this.workspaces.isFrozen(id)();
  });

  // Linear-style status of the active workspace. Surfaces in the
  // toolbar's Status dropdown (between Commit and Open-in IDE). Null
  // means no workspace resolved yet — the toolbar hides the trigger.
  protected readonly workspaceStatus = computed<UiWorkspaceStatus | null>(
    () => this.workspace()?.status ?? null,
  );

  protected readonly sidebarHeader =
    viewChild.required<TemplateRef<unknown>>('sidebarHeaderTpl');

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      if (id) {
        this.store.loadWorkspace(id);
        void this.workspaces.markRead(id).catch(() => undefined);
        // Page-level safety net: the workspace must have at least one
        // chat before any tab renders, because the composer (mounted
        // above the @switch) may send before the user ever visits a
        // chat tab. Idempotent; facade is the single source of truth.
        this.chatFacade.ensureChatForWorkspace(id);
      }
    });

    // Probe `.mozart/run.json` so the page-toolbar Run/Stop button
    // reflects script presence even when the DB column is null.
    // Idempotent on second visit (facade dedupes).
    effect(() => {
      const pid = this.project()?.id;
      if (!pid) return;
      void this.projects.ensureDetectedScripts(pid);
      // Resolve the GitHub remote so the project crumb can offer
      // "open on GitHub". De-duped inside the facade.
      void this.projects.ensureGithubRemoteStatus(pid);
    });
  }

  protected async onRename(name: string): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.workspaces.rename(id, name);
    } catch (err) {
      console.warn('rename workspace failed', err);
    }
  }

  protected async onOpenIn(tool: OpenInTool): Promise<void> {
    this.store.openIn(tool);
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.workspaces.openInIde(id, tool.id);
    } catch (err) {
      console.warn('[detail] open-in-ide failed:', err);
    }
  }

  protected async onCommit(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    const context: CommitDialogContext = {
      workspaceId: id,
    };
    this.dialog.open(FeatureCommitDialog, { context });
  }

  // Update-from-base flow. Merges the freshest `origin/<base>` into the
  // workspace branch (mirrors the merge flow's toast routing). Refuses a
  // dirty tree; a conflict leaves the worktree mid-merge for the user to
  // resolve in their IDE.
  protected async onUpdateFromBase(): Promise<void> {
    const id = this.workspaceId();
    if (!id || this.updatingFromBase()) return;
    const baseName = this.workspace()?.baseBranch ?? 'base';
    const wasBehind = (this.baseFreshness()?.behind ?? 0) > 0;
    this.updatingFromBase.set(true);
    try {
      const outcome = await this.workspaces.updateFromBase(id);
      if (outcome.status === 'conflict') {
        const n = outcome.conflicting_files.length;
        toast.error(
          `Conflicts in ${n} ${n === 1 ? 'file' : 'files'}. Resolve in your editor — Open in IDE`,
        );
        return;
      }
      toast.success(
        wasBehind
          ? `Updated from ${baseName}`
          : `Already up to date with ${baseName}`,
      );
    } catch (err) {
      const kind = readAppErrorKind(err);
      if (kind === 'MergeDirtyTree') {
        toast.error('Commit your changes before updating.');
        return;
      }
      if (kind === 'Frozen') {
        toast.error('This workspace is read-only.');
        return;
      }
      console.warn('[detail] update from base failed:', err);
      toast.error('Update failed.', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.updatingFromBase.set(false);
      // Re-read freshness (this run fetched origin/<base>), so the chip
      // reflects the post-update state.
      this.baseFreshnessResource.reload();
    }
  }

  protected async onRun(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    // Mirror the toolbar's disabled-when-no-command rule at the
    // handler level too: the toolbar's Run/Stop split-button already
    // disables itself when `hasRunCommand` is false, but a stale
    // toolbar binding or a keyboard shortcut could still fire this
    // path. Guarding here keeps the backend from rejecting the call.
    if (!this.hasRunCommand()) return;
    try {
      await this.runs.start(id);
    } catch (err) {
      console.warn('[detail] run start failed:', err);
    }
  }

  protected async onStopRun(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.runs.stop(id);
    } catch (err) {
      console.warn('[detail] run stop failed:', err);
    }
  }

  protected onWorkspaceStatusChange(next: UiWorkspaceStatus): void {
    const id = this.workspaceId();
    if (!id) return;
    void this.workspaces.setStatus(id, next).catch((err) => {
      console.warn('[detail] setStatus failed:', err);
    });
  }

  // Open the workspace's existing PR in the browser (no auto-open; only
  // on the explicit "PR #N" chip click).
  protected onOpenPr(): void {
    const url = this.workspace()?.pr?.url;
    if (url) void this.externalLink.openExternal(url);
  }

  // Open the source repository's local folder in the OS file manager.
  protected onOpenRepoFolder(): void {
    const path = this.project()?.path;
    if (path) void this.externalLink.revealPath(path);
  }

  // Open the source repository on GitHub.
  protected onOpenRepoRemote(): void {
    const url = this.repoUrl();
    if (url) void this.externalLink.openExternal(url);
  }
}

// `AppError` crosses the IPC boundary as `{ kind, message }`. Adapters
// re-throw the raw object; this guard lets the update-flow toast router
// pattern-match on `kind` without depending on a runtime type from
// `_bindings`.
function readAppErrorKind(err: unknown): string | null {
  if (
    err &&
    typeof err === 'object' &&
    'kind' in err &&
    typeof (err as { kind: unknown }).kind === 'string'
  ) {
    return (err as { kind: string }).kind;
  }
  return null;
}
