import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { HlmContextMenuImports } from '@mozart/ui/context-menu';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import {
  ConfirmDeleteProjectDialog,
  type ConfirmDeleteProjectContext,
  ProjectContextMenu,
  ProjectRow,
  ProjectsEmptyState,
  ProjectsFacade,
  type Project,
} from '../domains/projects';
import { WorkspaceContextMenu } from '../domains/workspaces/ui/workspace-context-menu/workspace-context-menu';
import { WorkspaceEmptyState } from '../domains/workspaces/ui/workspace-empty-state/workspace-empty-state';
import { WorkspaceRow } from '../domains/workspaces/ui/workspace-row/workspace-row';
import { WorkspacesFacade } from '../domains/workspaces/data/workspace.facade';
import type { Workspace } from '../domains/workspaces/data/workspace.model';
import type { UiWorkspaceStatus } from '../domains/workspaces/data/workspace-status';

// Cross-domain composer for the left sidebar. This is the only place
// where the projects and workspaces facades meet — per Convention #2
// the shell is the legal home for cross-domain composition.
@Component({
  selector: 'app-shell-project-list',
  imports: [
    CdkDropList,
    CdkDrag,
    HlmContextMenuImports,
    HlmSidebarImports,
    ProjectRow,
    WorkspaceRow,
    ProjectContextMenu,
    WorkspaceContextMenu,
    WorkspaceEmptyState,
    ProjectsEmptyState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visibleProjects().length === 0) {
      <app-projects-empty-state />
    } @else {
      <ul
        hlmSidebarMenu
        cdkDropList
        cdkDropListLockAxis="y"
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
                    [hlmContextMenuTrigger]="workspaceCtxMenuTpl"
                    [hlmContextMenuTriggerData]="{ $implicit: workspace }"
                  >
                    <app-workspace-row
                      [workspace]="workspace"
                      [editing]="editingWorkspaceId() === workspace.id"
                      (archive)="workspaces.archive(workspace.id)"
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
        (hide)="projects.hide(p.id)"
        (remove)="openDeleteDialog(p)"
      />
    </ng-template>

    <ng-template #workspaceCtxMenuTpl let-w>
      <app-workspace-context-menu
        [workspace]="w"
        (markUnread)="workspaces.toggleUnread(w.id)"
        (pin)="workspaces.togglePinned(w.id)"
        (rename)="editingWorkspaceId.set(w.id)"
        (archive)="workspaces.archive(w.id)"
        (setStatus)="onSetStatus(w.id, $event)"
      />
    </ng-template>
  `,
})
export class ShellProjectList {
  protected readonly projects = inject(ProjectsFacade);
  protected readonly workspaces = inject(WorkspacesFacade);
  private readonly _dialogService = inject(HlmDialogService);
  private readonly _router = inject(Router);

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

  // Pinned workspaces float to the top while keeping relative order.
  protected sortPinned(workspaces: readonly Workspace[]): readonly Workspace[] {
    const pinned: Workspace[] = [];
    const rest: Workspace[] = [];
    for (const w of workspaces) (w.pinned ? pinned : rest).push(w);
    return [...pinned, ...rest];
  }

  protected onRenameCommit(workspaceId: string, title: string): void {
    this.workspaces.rename(workspaceId, title);
    this.editingWorkspaceId.set(null);
  }

  // Creating a workspace navigates to its detail route so the user lands
  // directly on the new conversation.
  protected createWorkspace(projectId: string): void {
    const id = this.workspaces.create(projectId);
    void this._router.navigate(['/workspaces', id]);
  }

  protected openDeleteDialog(project: Project): void {
    const context: ConfirmDeleteProjectContext = {
      project,
      onConfirm: () => {
        this.workspaces.removeForProject(project.id);
        this.projects.remove(project.id);
      },
    };
    this._dialogService.open(ConfirmDeleteProjectDialog, { context });
  }

  protected onSetStatus(
    workspaceId: string,
    status: UiWorkspaceStatus,
  ): void {
    this.workspaces.setStatus(workspaceId, status);
  }

  protected onProjectDrop(event: CdkDragDrop<readonly Project[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.projects.reorder(event.previousIndex, event.currentIndex);
  }
}
