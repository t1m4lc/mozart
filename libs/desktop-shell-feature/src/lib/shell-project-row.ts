import {
  ChangeDetectionStrategy,
  Component,
  TemplateRef,
  computed,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { HlmContextMenuImports } from '@spartan-ui/context-menu';
import { HlmSkeletonImports } from '@spartan-ui/skeleton';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import type { Project } from '@mozart/desktop-projects-util';
import { ProjectRow } from '@mozart/desktop-projects-ui';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import type { Workspace } from '@mozart/desktop-workspaces-util';
import {
  WorkspaceEmptyState,
  WorkspaceRow,
} from '@mozart/desktop-workspaces-ui';

const EMPTY_DELETING_IDS: ReadonlySet<string> = new Set();

// Per-project sidebar row + nested workspaces list. Owned by the shell
// layer (the legal cross-domain composer). Reads its data straight off
// the projects + workspaces + chat facades; the parent
// (ShellProjectList) only passes the project and the three context-menu
// templates that have to be declared at the parent level so they can be
// shared between this row and the status-grouping render mode.
//
// `editingWorkspaceId` is two-way bound: opening rename from a context
// menu writes the id; committing or canceling clears it. Hoisting it
// out of this row keeps state ownership consistent with the
// status-grouping branch in ShellProjectList.
@Component({
  selector: 'app-shell-project-row',
  imports: [
    HlmContextMenuImports,
    ...HlmSkeletonImports,
    ProjectRow,
    WorkspaceRow,
    WorkspaceEmptyState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <app-project-row
      [project]="project()"
      [workspaceCount]="projectWorkspaces().length"
      [hovered]="projects.hoveredId() === project().id"
      [expanded]="projects.isExpanded(project().id)"
      [active]="isActive()"
      [hlmContextMenuTrigger]="projectCtxMenu()"
      [hlmContextMenuTriggerData]="{ $implicit: project() }"
      (toggleExpanded)="projects.toggleExpanded(project().id)"
      (hoverChange)="projects.setHovered($event ? project().id : null)"
      (newWorkspace)="createWorkspace.emit(project().id)"
    />

    @if (projects.isExpanded(project().id)) {
      <ul
        class="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-sidebar-border pl-2"
      >
        @if (projectWorkspaces().length === 0) {
          <li class="px-1 py-2">
            <app-workspace-empty-state
              [hlmContextMenuTrigger]="emptyWorkspacesCtxMenu()"
              [hlmContextMenuTriggerData]="{ $implicit: project().id }"
              (create)="createWorkspace.emit(project().id)"
            />
          </li>
        }
        @for (workspace of sortedWorkspaces(); track workspace.id) {
          <li
            hlmSidebarMenuItem
            [attr.data-tour]="
              workspaces.activeId() === workspace.id
                ? 'workspace-row-active'
                : null
            "
            [hlmContextMenuTrigger]="workspaceCtxMenu()"
            [hlmContextMenuTriggerData]="{ $implicit: workspace }"
          >
            @if (deletingWorkspaceIds().has(workspace.id)) {
              <div
                class="flex h-8 items-center gap-1.5 px-2"
                aria-busy="true"
                aria-label="Removing workspace"
              >
                <hlm-skeleton class="size-3 shrink-0 rounded-full" />
                <hlm-skeleton class="h-3 flex-1" />
              </div>
            } @else {
              <app-workspace-row
                [workspace]="workspace"
                [editing]="editingWorkspaceId() === workspace.id"
                [isStreaming]="streamingIds().has(workspace.id)"
                [setupState]="workspaces.installStateFor(workspace.id)"
                [chatTitle]="chatTitleFor(workspace.id)"
                [lastActivity]="lastActivityFor(workspace.id)"
                [diffStats]="diffStatsFor(workspace.id)"
                (renameCommit)="
                  renameCommit.emit({ id: workspace.id, name: $event })
                "
                (renameCancel)="editingWorkspaceId.set(null)"
              />
            }
          </li>
        }
      </ul>
    }
  `,
})
export class ShellProjectRow {
  protected readonly projects = inject(ProjectsFacade);
  protected readonly workspaces = inject(WorkspacesFacade);
  private readonly _chat = inject(ChatFacade);

  readonly project = input.required<Project>();
  readonly projectCtxMenu = input.required<TemplateRef<unknown>>();
  readonly workspaceCtxMenu = input.required<TemplateRef<unknown>>();
  readonly emptyWorkspacesCtxMenu = input.required<TemplateRef<unknown>>();
  readonly editingWorkspaceId = model<string | null>(null);
  // Per-row mirror of the parent shell-project-list's deleting set —
  // used to flip each workspace row to a skeleton while its Tauri
  // archive is in flight. Default is an empty Set so spec-light parent
  // mounts don't have to thread the input.
  readonly deletingWorkspaceIds = input<ReadonlySet<string>>(
    EMPTY_DELETING_IDS,
  );

  readonly createWorkspace = output<string>();
  readonly renameCommit = output<{ id: string; name: string }>();

  protected readonly streamingIds = this._chat.streamingWorkspaceIds;

  protected readonly projectWorkspaces = computed<readonly Workspace[]>(() => {
    const pid = this.project().id;
    return this.workspaces.all().filter((w) => w.projectId === pid);
  });

  // Pinned workspaces float to the top while keeping relative order.
  protected readonly sortedWorkspaces = computed<readonly Workspace[]>(() => {
    const pinned: Workspace[] = [];
    const rest: Workspace[] = [];
    for (const w of this.projectWorkspaces()) {
      (w.pinned ? pinned : rest).push(w);
    }
    return [...pinned, ...rest];
  });

  protected readonly isActive = computed(() => {
    const activeId = this.workspaces.activeId();
    if (!activeId) return false;
    return this.workspaces.workspaceById(activeId)()?.projectId === this.project().id;
  });

  protected chatTitleFor(workspaceId: string): string {
    return this._chat.chatByWorkspace().get(workspaceId)?.title ?? '';
  }

  protected lastActivityFor(workspaceId: string): number {
    return this._chat.lastActivityByWorkspace().get(workspaceId) ?? 0;
  }

  protected diffStatsFor(
    workspaceId: string,
  ): { added: number; removed: number } | null {
    return this.workspaces.diffStats().get(workspaceId) ?? null;
  }
}
