import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmContextMenuImports } from '@mozart/ui/context-menu';
import { HlmDialogImports, HlmDialogService } from '@mozart/ui/dialog';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmEmptyImports } from '@mozart/ui/empty';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmPopoverImports } from '@mozart/ui/popover';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArchive,
  lucideBell,
  lucideCheck,
  lucideChevronRight,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideCircleX,
  lucideEye,
  lucideEyeOff,
  lucideFolderCog,
  lucideGitBranch,
  lucidePencil,
  lucidePin,
  lucidePlus,
  lucideSettings,
  lucideSmile,
  lucideTag,
  lucideTimer,
  lucideTrash2,
} from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

type WorkspaceStatus =
  | 'backlog'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'canceled';

interface Workspace {
  id: string;
  title: string;
  status: WorkspaceStatus;
  pinned: boolean;
  unread: boolean;
}

interface Project {
  id: string;
  title: string;
  icon?: string;
  path: string;
  workspaces: Workspace[];
  hidden: boolean;
}

interface WorkspaceCtx {
  workspace: Workspace;
  projectId: string;
}

const WORKSPACE_STATUSES: {
  id: WorkspaceStatus;
  label: string;
  icon: string;
}[] = [
  { id: 'backlog', label: 'Backlog', icon: 'lucideCircleDashed' },
  { id: 'in_progress', label: 'In Progress', icon: 'lucideTimer' },
  { id: 'in_review', label: 'In Review', icon: 'lucideEye' },
  { id: 'done', label: 'Done', icon: 'lucideCircleCheck' },
  { id: 'canceled', label: 'Canceled', icon: 'lucideCircleX' },
];

const STATUS_COLORS: Record<WorkspaceStatus, string> = {
  backlog: '',
  in_progress: 'text-amber-500',
  in_review: 'text-blue-500',
  done: 'text-green-500',
  canceled: 'text-red-500',
};

const MOCK_PROJECTS: Project[] = [
  {
    id: 'p1',
    title: 'mozart',
    icon: '🧑‍🎤',
    path: '~/dev/mozart',
    workspaces: [
      {
        id: 'w1',
        title: 'feat/shell-resizable',
        status: 'in_progress',
        pinned: false,
        unread: false,
      },
      {
        id: 'w2',
        title: 'fix/tooltip-default',
        status: 'done',
        pinned: false,
        unread: true,
      },
    ],
    hidden: false,
  },
  {
    id: 'p2',
    title: 'api_server',
    path: '~/dev/api_server',
    workspaces: [
      {
        id: 'w3',
        title: 'feat/auth-middleware',
        status: 'in_review',
        pinned: true,
        unread: false,
      },
    ],
    hidden: false,
  },
  {
    id: 'p3',
    title: 'design_system',
    path: '~/dev/design_system',
    workspaces: [],
    hidden: false,
  },
];

@Component({
  selector: 'app-confirm-delete-project',
  standalone: true,
  imports: [HlmButtonImports, HlmDialogImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Remove "{{ ctx.project.title }}"?</h3>
    </div>
    <p hlmDialogDescription class="text-sm text-muted-foreground px-6">
      The source repository at
      <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">{{
        ctx.project.path
      }}</code>
      will not be deleted. Only this project will be removed from Mozart.
    </p>
    <div hlmDialogFooter class="mt-2">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button hlmBtn variant="destructive" type="button" (click)="confirm()">
        Remove project
      </button>
    </div>
  `,
})
export class ConfirmDeleteProjectDialog {
  protected readonly ctx = injectBrnDialogContext<{
    project: Project;
    onConfirm: () => void;
  }>();
  private readonly _ref = inject(BrnDialogRef);

  protected confirm(): void {
    this.ctx.onConfirm();
    this._ref.close();
  }
}

@Component({
  selector: 'app-project-list',
  imports: [
    NgIcon,
    RouterLink,
    HlmButtonImports,
    HlmContextMenuImports,
    HlmDropdownMenuImports,
    HlmEmptyImports,
    HlmIconImports,
    HlmPopoverImports,
    HlmSidebarImports,
    HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideArchive,
      lucideBell,
      lucideCheck,
      lucideChevronRight,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideCircleX,
      lucideEye,
      lucideEyeOff,
      lucideFolderCog,
      lucideGitBranch,
      lucidePencil,
      lucidePin,
      lucidePlus,
      lucideSettings,
      lucideSmile,
      lucideTag,
      lucideTimer,
      lucideTrash2,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul hlmSidebarMenu>
      @for (project of visibleProjects(); track project.id) {
        <li hlmSidebarMenuItem>
          <div
            class="group/trig relative flex h-8"
            (mouseenter)="hoveredProjectId.set(project.id)"
            (mouseleave)="hoveredProjectId.set(null)"
          >
            <button
              type="button"
              [hlmContextMenuTrigger]="projectCtxMenuTpl"
              [hlmContextMenuTriggerData]="{ $implicit: project }"
              (click)="toggleExpanded(project.id)"
              class="flex h-full w-full items-center gap-1.5 rounded-md pl-0 pr-12 text-sm
                     hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            >
              @if (hoveredProjectId() === project.id) {
                <span class="flex size-5 shrink-0 items-center justify-center">
                  <ng-icon
                    hlm
                    name="lucideChevronRight"
                    size="sm"
                    class="text-muted-foreground transition-transform duration-200"
                    [class.rotate-90]="isExpanded(project.id)"
                  />
                </span>
              } @else if (project.icon) {
                <span
                  class="flex size-5 shrink-0 items-center justify-center text-sm leading-none"
                >
                  {{ project.icon }}
                </span>
              } @else {
                <div
                  class="flex size-5 shrink-0 items-center justify-center rounded-sm
                            bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground"
                >
                  {{ getInitial(project.title) }}
                </div>
              }

              <span class="flex flex-1 min-w-0 items-baseline gap-1.5">
                <span class="truncate text-left">{{ project.title }}</span>
                @if (!isExpanded(project.id)) {
                  <span
                    class="shrink-0 text-xs tabular-nums text-muted-foreground"
                  >
                    {{ project.workspaces.length }}
                  </span>
                }
              </span>
            </button>

            <button
              type="button"
              hlmTooltip="Project settings"
              position="top"
              aria-label="Project settings"
              class="absolute top-1.5 right-6.5 flex size-5 items-center justify-center rounded-md p-0
                     text-muted-foreground opacity-0
                     hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                     group-hover/trig:opacity-100"
            >
              <ng-icon hlm name="lucideFolderCog" size="xs" />
            </button>

            <button
              type="button"
              hlmTooltip="New workspace"
              position="top"
              aria-label="New workspace"
              (click)="newWorkspace(project.id); $event.stopPropagation()"
              class="absolute top-1.5 right-1 flex size-5 items-center justify-center rounded-md p-0
                     text-muted-foreground
                     hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ng-icon hlm name="lucidePlus" size="xs" />
            </button>
          </div>

          <!-- Workspace list -->
          @if (isExpanded(project.id)) {
            <ul
              class="mt-0.5 ml-3 flex flex-col gap-0.5 border-l border-sidebar-border pl-2"
            >
              @if (project.workspaces.length === 0) {
                <li class="px-1 py-2">
                  <div hlmEmpty class="gap-1 rounded-md border p-3">
                    <p class="text-xs text-muted-foreground">
                      No workspaces yet
                    </p>
                    <button
                      type="button"
                      class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      (click)="newWorkspace(project.id)"
                    >
                      Create one
                    </button>
                  </div>
                </li>
              }
              @for (workspace of project.workspaces; track workspace.id) {
                <!-- group/ws-item: scoped hover for archive button, avoids leaking from project group -->
                <li
                  hlmSidebarMenuItem
                  class="group/ws-item"
                  [hlmContextMenuTrigger]="workspaceCtxMenuTpl"
                  [hlmContextMenuTriggerData]="{
                    $implicit: { workspace, projectId: project.id },
                  }"
                >
                  <a
                    hlmSidebarMenuButton
                    [isActive]="workspace.id === activeWorkspaceId()"
                    [routerLink]="['/workspaces', workspace.id]"
                    class="cursor-pointer rounded-sm gap-1.5 px-2"
                  >
                    <ng-icon
                      hlm
                      name="lucideGitBranch"
                      size="xs"
                      class="text-muted-foreground"
                    />
                    <span>{{ workspace.title }}</span>
                  </a>

                  <!-- Archive: shown only on hover of this workspace item -->
                  <div hlmPopover>
                    <button
                      hlmPopoverTrigger
                      type="button"
                      aria-label="Archive workspace"
                      class="absolute right-1 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-md
                             text-muted-foreground opacity-0 transition-opacity
                             hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                             group-hover/ws-item:opacity-100"
                    >
                      <ng-icon hlm name="lucideArchive" size="xs" />
                    </button>
                    <ng-template hlmPopoverPortal>
                      <div hlmPopoverContent class="w-40 p-2">
                        <p class="text-xs text-muted-foreground/80">
                          Archive workspace?
                        </p>
                        <div class="mt-1.5 flex justify-end">
                          <button
                            hlmBtn
                            size="sm"
                            variant="destructive"
                            type="button"
                            (click)="archiveWorkspace(project.id, workspace.id)"
                          >
                            Archive
                          </button>
                        </div>
                      </div>
                    </ng-template>
                  </div>
                </li>
              }
            </ul>
          }
        </li>
      }
    </ul>

    <!-- Project context menu -->
    <ng-template #projectCtxMenuTpl let-p>
      <hlm-dropdown-menu class="w-52">
        <hlm-dropdown-menu-group>
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="newWorkspace(p.id)"
          >
            <ng-icon hlm name="lucidePlus" size="xs" /> New workspace
          </button>
          <button hlmDropdownMenuItem type="button" class="cursor-pointer">
            <ng-icon hlm name="lucideSettings" size="xs" /> Repository settings
          </button>
          <button hlmDropdownMenuItem type="button" class="cursor-pointer">
            <ng-icon hlm name="lucideSmile" size="xs" /> Change icon
          </button>
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="hideProject(p.id)"
          >
            <ng-icon hlm name="lucideEyeOff" size="xs" /> Hide repository
          </button>
        </hlm-dropdown-menu-group>
        <hlm-dropdown-menu-separator />
        <hlm-dropdown-menu-group>
          <button
            hlmDropdownMenuItem
            type="button"
            variant="destructive"
            class="cursor-pointer"
            (triggered)="openDeleteDialog(p)"
          >
            <ng-icon hlm name="lucideTrash2" size="xs" /> Remove repository
          </button>
        </hlm-dropdown-menu-group>
      </hlm-dropdown-menu>
    </ng-template>

    <!-- Workspace context menu -->
    <ng-template #workspaceCtxMenuTpl let-ctx>
      <hlm-dropdown-menu class="w-52">
        <hlm-dropdown-menu-group>
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="markUnread(ctx)"
          >
            <ng-icon hlm name="lucideBell" size="xs" /> Mark as unread
          </button>
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="togglePin(ctx)"
          >
            <ng-icon hlm name="lucidePin" size="xs" /> Pin
          </button>
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            [hlmDropdownMenuTrigger]="statusSubTpl"
            [hlmDropdownMenuTriggerData]="{ $implicit: ctx }"
            align="start"
            side="right"
          >
            <ng-icon hlm name="lucideTag" size="xs" /> Set status
            <hlm-dropdown-menu-item-sub-indicator />
          </button>
          <button hlmDropdownMenuItem type="button" class="cursor-pointer">
            <ng-icon hlm name="lucidePencil" size="xs" /> Rename
          </button>
        </hlm-dropdown-menu-group>
        <hlm-dropdown-menu-separator />
        <hlm-dropdown-menu-group>
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="archiveWorkspace(ctx.projectId, ctx.workspace.id)"
          >
            <ng-icon hlm name="lucideArchive" size="xs" /> Archive
          </button>
        </hlm-dropdown-menu-group>
      </hlm-dropdown-menu>
    </ng-template>

    <!-- Status submenu — receives ctx via hlmDropdownMenuTriggerData -->
    <ng-template #statusSubTpl let-ctx>
      <hlm-dropdown-menu-sub class="w-44">
        @for (s of statuses; track s.id) {
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="
              setWorkspaceStatus(ctx.projectId, ctx.workspace.id, s.id)
            "
          >
            <ng-icon
              hlm
              [name]="s.icon"
              size="xs"
              [class]="statusColor(s.id)"
            />
            {{ s.label }}
            @if (ctx.workspace.status === s.id) {
              <ng-icon hlm name="lucideCheck" size="xs" class="ms-auto" />
            }
          </button>
        }
      </hlm-dropdown-menu-sub>
    </ng-template>
  `,
})
export class ProjectList {
  private readonly _dialogService = inject(HlmDialogService);
  private readonly _router = inject(Router);

  protected readonly statuses = WORKSPACE_STATUSES;
  protected readonly activeWorkspaceId = signal('w1');
  protected readonly hoveredProjectId = signal<string | null>(null);

  private readonly _projects = signal<Project[]>(MOCK_PROJECTS);
  private readonly _expandedIds = signal(
    new Set(MOCK_PROJECTS.map((p) => p.id)),
  );

  protected visibleProjects(): Project[] {
    return this._projects().filter((p) => !p.hidden);
  }

  protected isExpanded(id: string): boolean {
    return this._expandedIds().has(id);
  }

  protected toggleExpanded(id: string): void {
    const next = new Set(this._expandedIds());
    next.has(id) ? next.delete(id) : next.add(id);
    this._expandedIds.set(next);
  }

  protected getInitial(title: string): string {
    return (title.split(/[_\-\s]/)[0]?.[0] ?? title[0] ?? '?').toUpperCase();
  }

  protected statusColor(status: WorkspaceStatus): string {
    return STATUS_COLORS[status];
  }

  protected archiveWorkspace(projectId: string, workspaceId: string): void {
    this._projects.update((ps) =>
      ps.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              workspaces: p.workspaces.filter((w) => w.id !== workspaceId),
            },
      ),
    );
  }

  protected setWorkspaceStatus(
    projectId: string,
    workspaceId: string,
    status: WorkspaceStatus,
  ): void {
    this._projects.update((ps) =>
      ps.map((p) =>
        p.id !== projectId
          ? p
          : {
              ...p,
              workspaces: p.workspaces.map((w) =>
                w.id !== workspaceId ? w : { ...w, status },
              ),
            },
      ),
    );
  }

  protected markUnread(ctx: WorkspaceCtx): void {
    this._projects.update((ps) =>
      ps.map((p) =>
        p.id !== ctx.projectId
          ? p
          : {
              ...p,
              workspaces: p.workspaces.map((w) =>
                w.id !== ctx.workspace.id ? w : { ...w, unread: !w.unread },
              ),
            },
      ),
    );
  }

  protected togglePin(ctx: WorkspaceCtx): void {
    this._projects.update((ps) =>
      ps.map((p) =>
        p.id !== ctx.projectId
          ? p
          : {
              ...p,
              workspaces: p.workspaces.map((w) =>
                w.id !== ctx.workspace.id ? w : { ...w, pinned: !w.pinned },
              ),
            },
      ),
    );
  }

  protected newWorkspace(projectId: string): void {
    const ws: Workspace = {
      id: `w${Date.now()}`,
      title: 'new-workspace',
      status: 'backlog',
      pinned: false,
      unread: false,
    };
    this._projects.update((ps) =>
      ps.map((p) =>
        p.id !== projectId ? p : { ...p, workspaces: [ws, ...p.workspaces] },
      ),
    );
    this._router.navigate(['workspaces/', ws.id]);
  }

  protected hideProject(id: string): void {
    this._projects.update((ps) =>
      ps.map((p) => (p.id !== id ? p : { ...p, hidden: true })),
    );
  }

  protected removeProject(id: string): void {
    this._projects.update((ps) => ps.filter((p) => p.id !== id));
  }

  protected openDeleteDialog(project: Project): void {
    this._dialogService.open(ConfirmDeleteProjectDialog, {
      context: { project, onConfirm: () => this.removeProject(project.id) },
    });
  }
}
