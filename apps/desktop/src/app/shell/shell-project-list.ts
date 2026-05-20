import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { HlmContextMenuImports } from '@mozart/ui/context-menu';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronRight,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideCircleX,
  lucideEye,
  lucideTimer,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import {
  type ConfirmDeleteProjectContext,
  ProjectContextMenu,
  ProjectRow,
  ProjectsEmptyState,
  ProjectsFacade,
  type Project,
} from '../domains/projects';
import { AddProjectFlow } from '../core/add-project.flow';
import { ChatFacade } from '../domains/chat';
import type { ConfirmReopenWorkspaceContext } from '../domains/workspaces';
import { WorkspaceContextMenu } from '../domains/workspaces/ui/workspace-context-menu/workspace-context-menu';
import { WorkspaceEmptyState } from '../domains/workspaces/ui/workspace-empty-state/workspace-empty-state';
import { WorkspaceRow } from '../domains/workspaces/ui/workspace-row/workspace-row';
import { WorkspacesFacade } from '../domains/workspaces/data/workspace.facade';
import type { Workspace } from '../domains/workspaces/data/workspace.model';
import {
  UI_WORKSPACE_STATUSES,
  type UiWorkspaceStatus,
  type UiWorkspaceStatusMeta,
} from '../domains/workspaces/data/workspace-status';

// Cross-domain composer for the left sidebar. This is the only place
// where the projects and workspaces facades meet — per Convention #2
// the shell is the legal home for cross-domain composition.
@Component({
  selector: 'app-shell-project-list',
  imports: [
    CdkDropList,
    CdkDrag,
    HlmContextMenuImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmSidebarImports,
    NgIcon,
    ProjectRow,
    WorkspaceRow,
    ProjectContextMenu,
    WorkspaceContextMenu,
    WorkspaceEmptyState,
    ProjectsEmptyState,
  ],
  providers: [
    provideIcons({
      lucideChevronRight,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideCircleX,
      lucideEye,
      lucideTimer,
    }),
  ],
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
                <ng-icon
                  hlm
                  [name]="group.status.icon"
                  size="xs"
                  [class]="
                    group.status.colorClass +
                    ' transition-opacity group-hover/status:opacity-0'
                  "
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
                    <app-workspace-row
                      [workspace]="workspace"
                      [editing]="editingWorkspaceId() === workspace.id"
                      [isStreaming]="streamingIds().has(workspace.id)"
                      [chatTitle]="chatTitleFor(workspace.id)"
                      [lastActivity]="lastActivityFor(workspace.id)"
                      [diffStats]="diffStatsFor(workspace.id)"
                      (renameCommit)="onRenameCommit(workspace.id, $event)"
                      (renameCancel)="editingWorkspaceId.set(null)"
                    />
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
            <app-project-row
              [project]="project"
              [workspaceCount]="workspacesByProject()(project.id).length"
              [hovered]="projects.hoveredId() === project.id"
              [expanded]="projects.isExpanded(project.id)"
              [hlmContextMenuTrigger]="projectCtxMenuTpl"
              [hlmContextMenuTriggerData]="{ $implicit: project }"
              (toggleExpanded)="projects.toggleExpanded(project.id)"
              (hoverChange)="projects.setHovered($event ? project.id : null)"
              (newWorkspace)="createWorkspace(project.id)"
            />

            @if (projects.isExpanded(project.id)) {
              <ul
                class="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-sidebar-border pl-2"
              >
                @let projectWorkspaces = workspacesByProject()(project.id);
                @if (projectWorkspaces.length === 0) {
                  <li class="px-1 py-2">
                    <app-workspace-empty-state
                      [hlmContextMenuTrigger]="emptyWorkspacesCtxMenuTpl"
                      [hlmContextMenuTriggerData]="{ $implicit: project.id }"
                      (create)="createWorkspace(project.id)"
                    />
                  </li>
                }
                @for (
                  workspace of sortPinned(projectWorkspaces);
                  track workspace.id
                ) {
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
                    <app-workspace-row
                      [workspace]="workspace"
                      [editing]="editingWorkspaceId() === workspace.id"
                      [isStreaming]="streamingIds().has(workspace.id)"
                      [chatTitle]="chatTitleFor(workspace.id)"
                      [lastActivity]="lastActivityFor(workspace.id)"
                      [diffStats]="diffStatsFor(workspace.id)"
                      (renameCommit)="onRenameCommit(workspace.id, $event)"
                      (renameCancel)="editingWorkspaceId.set(null)"
                    />
                  </li>
                }
              </ul>
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
      />
    </ng-template>

    <!-- Context menus surfaced on the empty states (right-click on
         "No projects yet." / "No workspaces yet") so the user has the
         same open-project / new-workspace entry points without needing
         to find the sidebar header ` +
    ` button. -->
    <ng-template #emptyProjectsCtxMenuTpl>
      <hlm-dropdown-menu class="w-52">
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="addProjectFlow.openPickerAndOpen()"
        >
          Open a repository on this machine
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="addProjectFlow.openCloneDialog()"
        >
          Clone from Git
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="addProjectFlow.openCreateDialog()"
        >
          Create a new project
        </button>
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
  `,
})
export class ShellProjectList {
  protected readonly projects = inject(ProjectsFacade);
  protected readonly workspaces = inject(WorkspacesFacade);
  protected readonly addProjectFlow = inject(AddProjectFlow);
  private readonly _chat = inject(ChatFacade);
  private readonly _dialogService = inject(HlmDialogService);
  private readonly _router = inject(Router);

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

  // Curried lookup so the template can read workspacesByProject()(id) in
  // both the project-row count and the nested @for loop without re-running
  // the map per access.
  protected readonly workspacesByProject = computed(() => {
    const all = this.workspaces.all();
    const byId = new Map<string, Workspace[]>();
    for (const w of all) {
      const list = byId.get(w.projectId);
      if (list) list.push(w);
      else byId.set(w.projectId, [w]);
    }
    return (projectId: string): readonly Workspace[] =>
      byId.get(projectId) ?? [];
  });

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
      void this._router.navigate(['/workspaces', id]);
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
        this.workspaces.removeForProject(project.id);
        try {
          await this.projects.remove(project.id);
        } catch (err) {
          toast.error('Could not remove project', {
            description: errorMessage(err),
          });
        }
      },
    };
    const { ConfirmDeleteProjectDialog } = await import(
      '../domains/projects/ui-confirm-delete-project-dialog'
    );
    this._dialogService.open(ConfirmDeleteProjectDialog, { context });
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
      const { ConfirmReopenWorkspaceDialog } = await import(
        '../domains/workspaces/ui-confirm-reopen-workspace-dialog'
      );
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
