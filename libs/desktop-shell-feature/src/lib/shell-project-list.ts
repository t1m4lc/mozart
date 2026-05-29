import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { MzStatusIcon } from '@mozart-ui/status-icon';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { TasksFacade } from '@mozart/desktop-tasks-data-access';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import {
  AddProjectMenuItems,
  ConfirmDeleteProjectDialog,
  ProjectContextMenu,
  ProjectsEmptyState,
  type ConfirmDeleteProjectContext,
} from '@mozart/desktop-projects-ui';
import type { Project } from '@mozart/desktop-projects-util';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import { WorkspaceContextMenu } from '@mozart/desktop-workspaces-feature';
import {
  ConfirmRemoveWorkspaceDialog,
  ConfirmReopenWorkspaceDialog,
  WorkspaceRow,
  type ConfirmRemoveWorkspaceContext,
  type ConfirmReopenWorkspaceContext,
} from '@mozart/desktop-workspaces-ui';
import {
  UI_WORKSPACE_STATUSES,
  workspaceRouteCommands,
  type UiWorkspaceStatus,
  type UiWorkspaceStatusMeta,
  type Workspace,
} from '@mozart/desktop-workspaces-util';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmContextMenuImports } from '@spartan-ui/context-menu';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmSidebarImports } from '@spartan-ui/sidebar';
import { HlmSkeletonImports } from '@spartan-ui/skeleton';
import { AddProjectFlow } from './add-project.flow';
import { ShellProjectRow } from './shell-project-row';

// Cross-domain composer for the left sidebar. This is the only place
// where the projects and workspaces facades meet — per Convention #2
// the shell is the legal home for cross-domain composition.
@Component({
  selector: 'app-shell-project-list',
  imports: [
    CdkDropList,
    CdkDrag,
    NgTemplateOutlet,
    HlmContextMenuImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmSidebarImports,
    ...HlmSkeletonImports,
    NgIcon,
    MzStatusIcon,
    WorkspaceRow,
    ProjectContextMenu,
    WorkspaceContextMenu,
    ProjectsEmptyState,
    ShellProjectRow,
    AddProjectMenuItems,
  ],
  providers: [provideIcons({ lucideChevronRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template:
    `
    @if (visibleProjects().length === 0) {
      <app-projects-empty-state
        [hlmContextMenuTrigger]="emptyProjectsCtxMenuTpl"
      />
    } @else if (projects.groupBy() === 'status') {
      <ul hlmSidebarMenu data-tour="sidebar-projects-group">
        @for (group of statusGroups(); track group.status.id) {
          @let collapsed = projects.isStatusCollapsed(group.status.id);
          <li hlmSidebarMenuItem class="group/status">
            <button
              type="button"
              tabindex="-1"
              (click)="projects.toggleStatusCollapsed(group.status.id)"
              [attr.aria-expanded]="!collapsed"
              class="flex h-7 w-full items-center gap-2 rounded-md px-2 text-xs font-medium text-muted-foreground outline-none
                     hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <span
                class="relative flex size-4 shrink-0 items-center justify-center"
              >
                <mz-status-icon
                  [status]="group.status.id"
                  class="transition-opacity group-hover/status:opacity-0"
                />
                <ng-icon
                  hlm
                  name="lucideChevronRight"
                  size="xs"
                  class="absolute inset-0 m-auto text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover/status:opacity-100"
                  [class.rotate-90]="!collapsed"
                />
              </span>
              <span class="flex-1 text-left">{{ group.status.label }}</span>
              @if (collapsed) {
                <span class="shrink-0 text-[10px] font-normal opacity-60">
                  {{ group.workspaces.length }}
                </span>
              }
            </button>
            @if (!collapsed) {
              <ul
                class="ml-3 flex flex-col gap-0.5 border-l border-sidebar-border pl-2"
              >
                @for (workspace of group.workspaces; track workspace.id) {
                  <li
                    hlmSidebarMenuItem
                    [attr.data-tour]="
                      workspaces.activeId() === workspace.id
                        ? 'workspace-row-active'
                        : null
                    "
                    [hlmContextMenuTrigger]="workspaceCtxMenuTpl"
                    [hlmContextMenuTriggerData]="{ $implicit: workspace }"
                  >
                    @if (deletingWorkspaceIds().has(workspace.id)) {
                      <ng-container
                        [ngTemplateOutlet]="workspaceSkeletonTpl"
                      />
                    } @else {
                      <app-workspace-row
                        [workspace]="workspace"
                        [active]="workspaces.activeId() === workspace.id"
                        [editing]="editingWorkspaceId() === workspace.id"
                        [isStreaming]="streamingIds().has(workspace.id)"
                        [setupState]="workspaces.installStateFor(workspace.id)"
                        [chatTitle]="chatTitleFor(workspace.id)"
                        [lastActivity]="lastActivityFor(workspace.id)"
                        [diffStats]="diffStatsFor(workspace.id)"
                        (renameCommit)="onRenameCommit(workspace.id, $event)"
                        (renameCancel)="editingWorkspaceId.set(null)"
                      />
                    }
                  </li>
                }
              </ul>
            }
          </li>
        }
      </ul>
    } @else {
      <ul
        hlmSidebarMenu
        cdkDropList
        cdkDropListLockAxis="y"
        data-tour="sidebar-projects-group"
        (cdkDropListDropped)="onProjectDrop($event)"
      >
        @for (project of visibleProjects(); track project.id) {
          <li hlmSidebarMenuItem cdkDrag [cdkDragData]="project">
            @if (deletingProjectIds().has(project.id)) {
              <ng-container
                [ngTemplateOutlet]="projectSkeletonTpl"
                [ngTemplateOutletContext]="{
                  expanded: projects.isExpanded(project.id),
                  workspaceCount: workspaceCountFor(project.id)
                }"
              />
            } @else {
              <app-shell-project-row
                [project]="project"
                [projectCtxMenu]="projectCtxMenuTpl"
                [workspaceCtxMenu]="workspaceCtxMenuTpl"
                [emptyWorkspacesCtxMenu]="emptyWorkspacesCtxMenuTpl"
                [deletingWorkspaceIds]="deletingWorkspaceIds()"
                [(editingWorkspaceId)]="editingWorkspaceId"
                (createWorkspace)="createWorkspace($event)"
                (renameCommit)="onRenameCommit($event.id, $event.name)"
              />
            }
          </li>
        }
      </ul>
    }

    <ng-template #projectCtxMenuTpl let-p>
      <app-project-context-menu
        (newWorkspace)="createWorkspace(p.id)"
        (hide)="hideProject(p.id)"
        (remove)="openDeleteDialog(p)"
      />
    </ng-template>

    <ng-template #workspaceCtxMenuTpl let-w>
      <app-workspace-context-menu
        [workspace]="w"
        (markUnread)="toggleUnreadWorkspace(w.id)"
        (pin)="togglePinnedWorkspace(w.id)"
        (rename)="editingWorkspaceId.set(w.id)"
        (setStatus)="onSetStatus(w.id, $event)"
        (remove)="openRemoveWorkspaceDialog(w)"
      />
    </ng-template>

    <!-- Context menus surfaced on the empty states (right-click on
         "No projects yet." / "No workspaces yet") so the user has the
         same open-project / new-workspace entry points without needing
         to find the sidebar header ` +
    ` button. -->
    <ng-template #emptyProjectsCtxMenuTpl>
      <hlm-dropdown-menu class="w-52">
        <app-add-project-menu-items
          [githubConnected]="profile.githubConnected()"
          (openProject)="addProjectFlow.openPickerAndOpen()"
          (openGithubProject)="addProjectFlow.openCloneDialog()"
        />
      </hlm-dropdown-menu>
    </ng-template>

    <ng-template #emptyWorkspacesCtxMenuTpl let-pid>
      <hlm-dropdown-menu class="w-52">
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="createWorkspace(pid)"
        >
          New workspace
        </button>
      </hlm-dropdown-menu>
    </ng-template>

    <!-- Skeleton placeholders shown in the row's exact slot while a
         delete is in flight. Keeps the sidebar's vertical rhythm so
         the surrounding rows don't reflow when a project or workspace
         vanishes. -->
    <ng-template
      #projectSkeletonTpl
      let-expanded="expanded"
      let-workspaceCount="workspaceCount"
    >
      <div
        class="flex h-8 items-center gap-1.5 px-2"
        aria-busy="true"
        aria-label="Removing project"
      >
        <hlm-skeleton class="size-5 shrink-0 rounded-sm" />
        <hlm-skeleton class="h-3 flex-1" />
      </div>
      @if (expanded) {
        <ul
          class="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-sidebar-border pl-2"
          aria-hidden="true"
        >
          @for (
            i of skeletonRowsFor(workspaceCount);
            track $index
          ) {
            <li>
              <ng-container [ngTemplateOutlet]="workspaceSkeletonTpl" />
            </li>
          }
        </ul>
      }
    </ng-template>

    <ng-template #workspaceSkeletonTpl>
      <div
        class="flex h-8 items-center gap-1.5 px-2"
        aria-busy="true"
        aria-label="Removing workspace"
      >
        <hlm-skeleton class="size-3 shrink-0 rounded-full" />
        <hlm-skeleton class="h-3 flex-1" />
      </div>
    </ng-template>
  `,
})
export class ShellProjectList {
  protected readonly projects = inject(ProjectsFacade);
  protected readonly workspaces = inject(WorkspacesFacade);
  protected readonly profile = inject(ProfileFacade);
  protected readonly addProjectFlow = inject(AddProjectFlow);
  private readonly _chat = inject(ChatFacade);
  private readonly _dialogService = inject(HlmDialogService);
  private readonly _router = inject(Router);
  private readonly _tasks = inject(TasksFacade);
  private readonly _uiState = inject(UiStateFacade);

  // Workspace ids currently streaming. Each row reads
  // `streamingIds().has(workspace.id)` rather than a per-id computed —
  // one Set lookup per render beats N computed signals.
  protected readonly streamingIds = this._chat.streamingWorkspaceIds;

  // Returns the first chat's title for a workspace, or '' when none
  // is loaded. The row falls back to workspace.name when this is empty
  // or equals the default 'Start'.
  protected chatTitleFor(workspaceId: string): string {
    return this._chat.chatByWorkspace().get(workspaceId)?.title ?? '';
  }

  // Last message timestamp for a workspace, or 0 when no activity has
  // been tracked yet (the row falls back to workspace.createdAt).
  protected lastActivityFor(workspaceId: string): number {
    return this._chat.lastActivityByWorkspace().get(workspaceId) ?? 0;
  }

  // Aggregate diff stats from the workspaces facade. `null` when stats
  // haven't been fetched yet or this workspace has no changes — the
  // row hides the chip in both cases.
  protected diffStatsFor(
    workspaceId: string,
  ): { added: number; removed: number } | null {
    return this.workspaces.diffStats().get(workspaceId) ?? null;
  }

  protected readonly editingWorkspaceId = signal<string | null>(null);
  protected readonly visibleProjects = this.projects.visible;

  // Ids the user has confirmed a delete on but whose Tauri call is
  // still in flight. The row renders a skeleton in this slot so the
  // sidebar's vertical rhythm stays stable until the row actually
  // vanishes. Cleared in `finally` so an error path doesn't leave a
  // permanent placeholder.
  //
  // Project ids are tracked here (no project-level loading store yet);
  // workspace ids live in the workspace store's `loadingIds` Set so
  // the state is reactive cause-agnostically (delete, initialize,
  // future archive flows all flip the same signal).
  protected readonly deletingProjectIds = signal<ReadonlySet<string>>(
    new Set(),
  );
  protected readonly deletingWorkspaceIds = this.workspaces.loadingIds;

  // Mirrors the expanded-project row's nested workspace count so the
  // skeleton renders the same number of placeholder rows. Reading off
  // the live workspace store works here — the rows are still in the
  // store during the in-flight delete (they're swept right after the
  // Tauri call resolves).
  protected workspaceCountFor(projectId: string): number {
    return this.workspaces.all().filter((w) => w.projectId === projectId)
      .length;
  }

  // Fixed-length sentinel array for the `@for` skeleton loop. Caps at 4
  // so a project with dozens of workspaces doesn't render dozens of
  // skeleton rows — the visual is "loading, this row is going away",
  // not "preview of what's about to vanish".
  protected skeletonRowsFor(workspaceCount: number): readonly null[] {
    const n = Math.max(1, Math.min(4, workspaceCount));
    return Array.from({ length: n }, () => null);
  }

  // Group-by-Status render: one section per non-empty status, ordered
  // by the canonical UI_WORKSPACE_STATUSES list. Only workspaces whose
  // project is visible (i.e. not filtered out by the popover) are
  // included — keeps the popover filter consistent across group modes.
  protected readonly statusGroups = computed<
    readonly {
      readonly status: UiWorkspaceStatusMeta;
      readonly workspaces: readonly Workspace[];
    }[]
  >(() => {
    const visibleIds = new Set(this.visibleProjects().map((p) => p.id));
    const byStatus = new Map<UiWorkspaceStatus, Workspace[]>();
    for (const w of this.workspaces.all()) {
      if (!visibleIds.has(w.projectId)) continue;
      const bucket = byStatus.get(w.status);
      if (bucket) bucket.push(w);
      else byStatus.set(w.status, [w]);
    }
    return UI_WORKSPACE_STATUSES.flatMap((status) => {
      const bucket = byStatus.get(status.id);
      return bucket && bucket.length > 0
        ? [{ status, workspaces: this.sortPinned(bucket) }]
        : [];
    });
  });

  // Pinned workspaces float to the top while keeping relative order.
  protected sortPinned(workspaces: readonly Workspace[]): readonly Workspace[] {
    const pinned: Workspace[] = [];
    const rest: Workspace[] = [];
    for (const w of workspaces) (w.pinned ? pinned : rest).push(w);
    return [...pinned, ...rest];
  }

  protected async onRenameCommit(
    workspaceId: string,
    name: string,
  ): Promise<void> {
    this.editingWorkspaceId.set(null);
    try {
      await this.workspaces.rename(workspaceId, name);
    } catch (err) {
      toast.error('Could not rename workspace', {
        description: errorMessage(err),
      });
    }
  }

  // Creating a workspace navigates to its detail route so the user lands
  // directly on the new conversation. The pending ghost row in the
  // sidebar surfaces during the ~200ms Tauri round-trip.
  protected async createWorkspace(projectId: string): Promise<void> {
    try {
      const id = await this.workspaces.createForPrompt({ projectId });
      void this._router.navigate(workspaceRouteCommands(projectId, id));
    } catch (err) {
      toast.error('Could not create workspace', {
        description: errorMessage(err),
      });
    }
  }

  protected async togglePinnedWorkspace(workspaceId: string): Promise<void> {
    try {
      await this.workspaces.togglePinned(workspaceId);
    } catch (err) {
      toast.error('Could not update pin', {
        description: errorMessage(err),
      });
    }
  }

  protected async toggleUnreadWorkspace(workspaceId: string): Promise<void> {
    try {
      await this.workspaces.toggleUnread(workspaceId);
    } catch (err) {
      toast.error('Could not update unread', {
        description: errorMessage(err),
      });
    }
  }

  protected async openDeleteDialog(project: Project): Promise<void> {
    const context: ConfirmDeleteProjectContext = {
      project,
      onConfirm: async () => {
        // Pessimistic order: commit the backend delete first, then
        // sweep every in-memory store. The previous order wiped
        // workspaces optimistically and only rolled back the project
        // store on adapter failure, which left the project row visible
        // (with stale workspace count) when the adapter failed AND left
        // orphan task/ui-state rows when it succeeded.
        const activeId = this.workspaces.activeId();
        const active = activeId
          ? this.workspaces.workspaceById(activeId)()
          : null;
        if (active?.projectId === project.id) {
          await this._router.navigate(['/']);
        }
        this.markProjectDeleting(project.id, true);
        try {
          await this.projects.remove(project.id);
        } catch (err) {
          toast.error('Could not remove project', {
            description: errorMessage(err),
          });
          this.markProjectDeleting(project.id, false);
          return;
        }
        this.workspaces.removeForProject(project.id);
        this._tasks.removeForProject(project.id);
        this._uiState.setExpandedProjects(
          [...this._uiState.expandedProjectIds()].filter(
            (id) => id !== project.id,
          ),
        );
        // Row has now vanished from `visibleProjects()` — drop the
        // deleting flag so the Set doesn't grow unbounded across the
        // session.
        this.markProjectDeleting(project.id, false);
      },
    };
    this._dialogService.open(ConfirmDeleteProjectDialog, { context });
  }

  // Flip the project-deleting flag. Workspaces route through the
  // workspace facade's `setLoading` (driven from `archive`), so this
  // helper only owns the project side. Returns a new Set each call so
  // signal subscribers re-evaluate.
  private markProjectDeleting(projectId: string, on: boolean): void {
    const next = new Set(this.deletingProjectIds());
    if (on) next.add(projectId);
    else next.delete(projectId);
    this.deletingProjectIds.set(next);
  }

  protected openRemoveWorkspaceDialog(workspace: Workspace): void {
    const stats = this.workspaces.diffStats().get(workspace.id);
    const hasUncommittedChanges = !!stats && stats.added + stats.removed > 0;
    const prNotSent = workspace.lastMergeAction !== 'pr';
    const context: ConfirmRemoveWorkspaceContext = {
      workspace,
      hasUncommittedChanges,
      prNotSent,
      onConfirm: async () => {
        // Cancel any in-flight LLM turn for this workspace. Rust's
        // `archive_workspace` already kills the terminal + run PTYs and
        // the file watcher, but the chat-streaming handle lives in TS
        // and would otherwise keep writing tokens into a row that's
        // about to vanish.
        this._chat.cancelActive(workspace.id);

        // If the workspace being removed is the one currently in view,
        // route away first so the detail page unsubscribes before the
        // row disappears. Prefer the next sibling in the same project;
        // fall back to home when no sibling remains.
        if (this.workspaces.activeId() === workspace.id) {
          const next = this.workspaces
            .byProject(workspace.projectId)()
            .find((w) => w.id !== workspace.id);
          await this._router.navigate(
            next
              ? workspaceRouteCommands(workspace.projectId, next.id)
              : ['/'],
          );
        }

        // `archive` flips the workspace store's loading flag for its
        // own duration; no local tracking needed here.
        try {
          await this.workspaces.archive(workspace.id);
        } catch (err) {
          toast.error('Could not remove workspace', {
            description: errorMessage(err),
          });
        }
      },
    };
    this._dialogService.open(ConfirmRemoveWorkspaceDialog, { context });
  }

  protected async hideProject(projectId: string): Promise<void> {
    try {
      await this.projects.hide(projectId);
    } catch (err) {
      toast.error('Could not hide project', {
        description: errorMessage(err),
      });
    }
  }

  // Plan P0.2: a status pick that crosses from a frozen state
  // (done | canceled) into an active state is conceptually a reopen,
  // and the user has to confirm. Done↔canceled sideways moves stay
  // frozen on both sides and skip the dialog. Other transitions are
  // straight optimistic updates. The dialog component is dynamically
  // imported so its bundle stays out of the sidebar's critical path.
  protected async onSetStatus(
    workspaceId: string,
    status: UiWorkspaceStatus,
  ): Promise<void> {
    const current = this.workspaces.workspaceById(workspaceId)();
    const wasFrozen =
      current?.status === 'done' || current?.status === 'canceled';
    const willBeFrozen = status === 'done' || status === 'canceled';
    const isReopen = wasFrozen && !willBeFrozen;
    if (isReopen) {
      const context: ConfirmReopenWorkspaceContext = {
        onConfirm: async () => {
          try {
            await this.workspaces.reopen(workspaceId, status);
          } catch (err) {
            toast.error('Could not reopen workspace', {
              description: errorMessage(err),
            });
          }
        },
      };
      this._dialogService.open(ConfirmReopenWorkspaceDialog, { context });
      return;
    }
    try {
      await this.workspaces.setStatus(workspaceId, status);
    } catch (err) {
      toast.error('Could not update status', {
        description: errorMessage(err),
      });
    }
  }

  protected onProjectDrop(event: CdkDragDrop<readonly Project[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.projects.reorder(event.previousIndex, event.currentIndex);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
