import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HlmContextMenuImports } from '@mozart/ui/context-menu';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import type { Project } from '../data/project.model';
import type { Workspace } from '../data/workspace.model';
import type { UiWorkspaceStatus } from '../data/workspace-status';
import {
  ConfirmDeleteProjectDialog,
  type ConfirmDeleteProjectContext,
} from '../ui/confirm-delete-project-dialog/confirm-delete-project-dialog';
import { ProjectContextMenu } from '../ui/project-context-menu/project-context-menu';
import { ProjectRow } from '../ui/project-row/project-row';
import { WorkspaceContextMenu } from '../ui/workspace-context-menu/workspace-context-menu';
import { WorkspaceEmptyState } from '../ui/workspace-empty-state/workspace-empty-state';
import { WorkspaceRow } from '../ui/workspace-row/workspace-row';
import { ProjectListStore } from './project-list.store';

@Component({
  selector: 'app-project-list',
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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul
      hlmSidebarMenu
      cdkDropList
      cdkDropListLockAxis="y"
      (cdkDropListDropped)="onProjectDrop($event)"
    >
      @for (project of store.visibleProjects(); track project.id) {
        <li hlmSidebarMenuItem cdkDrag [cdkDragData]="project">
          <app-project-row
            [project]="project"
            [hovered]="store.hoveredProjectId() === project.id"
            [expanded]="store.isExpanded(project.id)"
            [hlmContextMenuTrigger]="projectCtxMenuTpl"
            [hlmContextMenuTriggerData]="{ $implicit: project }"
            (toggleExpanded)="store.toggleExpanded(project.id)"
            (hoverChange)="store.setHovered($event ? project.id : null)"
            (newWorkspace)="createWorkspace(project.id)"
          />

          @if (store.isExpanded(project.id)) {
            <ul
              class="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-sidebar-border pl-2"
            >
              @if (project.workspaces.length === 0) {
                <li class="px-1 py-2">
                  <app-workspace-empty-state
                    (create)="createWorkspace(project.id)"
                  />
                </li>
              }
              @for (workspace of project.workspaces; track workspace.id) {
                <li
                  hlmSidebarMenuItem
                  [hlmContextMenuTrigger]="workspaceCtxMenuTpl"
                  [hlmContextMenuTriggerData]="{
                    $implicit: { workspace, projectId: project.id },
                  }"
                >
                  <app-workspace-row
                    [workspace]="workspace"
                    (archive)="store.archiveWorkspace(project.id, workspace.id)"
                  />
                </li>
              }
            </ul>
          }
        </li>
      }
    </ul>

    <ng-template #projectCtxMenuTpl let-p>
      <app-project-context-menu
        (newWorkspace)="createWorkspace(p.id)"
        (hide)="store.hideProject(p.id)"
        (remove)="openDeleteDialog(p)"
      />
    </ng-template>

    <ng-template #workspaceCtxMenuTpl let-ctx>
      <app-workspace-context-menu
        [workspace]="ctx.workspace"
        (markUnread)="store.toggleUnread(ctx.projectId, ctx.workspace.id)"
        (pin)="store.togglePinned(ctx.projectId, ctx.workspace.id)"
        (archive)="store.archiveWorkspace(ctx.projectId, ctx.workspace.id)"
        (setStatus)="onSetStatus(ctx, $event)"
      />
    </ng-template>
  `,
})
export class ProjectListContainer {
  protected readonly store = inject(ProjectListStore);
  private readonly _dialogService = inject(HlmDialogService);
  private readonly _router = inject(Router);

  // Creating a workspace navigates to its detail route so the user lands
  // directly on the new conversation.
  protected createWorkspace(projectId: string): void {
    const id = this.store.newWorkspace(projectId);
    void this._router.navigate(['/workspaces', id]);
  }

  protected openDeleteDialog(project: Project): void {
    const context: ConfirmDeleteProjectContext = {
      project,
      onConfirm: () => this.store.removeProject(project.id),
    };
    this._dialogService.open(ConfirmDeleteProjectDialog, { context });
  }

  protected onSetStatus(
    ctx: { projectId: string; workspace: Workspace },
    status: UiWorkspaceStatus,
  ): void {
    this.store.setWorkspaceStatus(ctx.projectId, ctx.workspace.id, status);
  }

  protected onProjectDrop(event: CdkDragDrop<readonly Project[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.store.reorderProjects(event.previousIndex, event.currentIndex);
  }
}
