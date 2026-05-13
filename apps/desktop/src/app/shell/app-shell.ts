import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmContextMenuImports } from '@mozart/ui/context-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmResizableImports, HlmResizablePanel } from '@mozart/ui/resizable';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { HlmToasterImports } from '@mozart/ui/sonner';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleQuestionMark,
  lucidePanelLeft,
  lucideSettings,
} from '@ng-icons/lucide';
import { LayoutService } from '../core/layout.service';
import { OsService } from '../core/os.service';
import { MacWindowControls } from '../core/window-controls/mac-window-controls';
import {
  FeatureAddProject,
  GroupByFilter,
  ProjectsFacade,
  ProjectsHeaderContextMenu,
} from '../domains/projects';
import { ShellAside } from './shell-aside';
import {
  SHELL_LEFT_PANEL_PX,
  SHELL_RIGHT_PANEL_PX,
  pxToPercent,
} from './shell-panel.constants';
import { ShellProjectList } from './shell-project-list';

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterOutlet,
    NgIcon,
    MacWindowControls,
    HlmButtonImports,
    HlmContextMenuImports,
    HlmIconImports,
    HlmResizableImports,
    HlmSidebarImports,
    HlmToasterImports,
    HlmTooltipImports,
    FeatureAddProject,
    GroupByFilter,
    ProjectsHeaderContextMenu,
    ShellAside,
    ShellProjectList,
  ],
  providers: [
    provideIcons({
      lucideCircleQuestionMark,
      lucidePanelLeft,
      lucideSettings,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-screen w-screen bg-background text-foreground' },
  template: `
    <div hlmResizableGroup direction="horizontal" class="h-full">
      <div
        hlmResizablePanel
        #leftPanel="hlmResizablePanel"
        [defaultSize]="leftPanel_.default"
        [minSize]="layout.leftPanelOpen() ? leftPanel_.min : 0"
        [maxSize]="leftPanel_.max"
        class="transition-[flex] duration-200 ease-out"
      >
        <hlm-sidebar side="left" collapsible="none" class="h-full w-full">
          <div
            hlmSidebarHeader
            data-tauri-drag-region
            class="h-9 flex-row items-center gap-1 border-b border-sidebar-border px-2 py-1"
          >
            @if (!isMac) {
              <app-mac-window-controls />
            }
            <span class="flex-1" data-tauri-drag-region></span>
            <button
              hlmBtn
              variant="ghost"
              size="icon-xs"
              type="button"
              hlmTooltip="Toggle left sidebar"
              position="bottom"
              class="size-7 rounded-md text-muted-foreground"
              data-tauri-drag-region="false"
              (click)="
                layout.toggleLeftPanel(); $any($event.currentTarget).blur()
              "
            >
              <ng-icon hlm name="lucidePanelLeft" size="xs" />
            </button>
          </div>

          <div hlmSidebarContent>
            <div hlmSidebarGroup class="px-2 py-1">
              <div
                class="flex h-8 items-center gap-0.5"
                [hlmContextMenuTrigger]="projectsHeaderCtxMenu"
              >
                <span
                  class="text-sidebar-foreground/70 flex-1 text-xs font-medium"
                >
                  Projects
                </span>
                <app-group-by-filter
                  #filter
                  [groupBy]="projects.groupBy()"
                  (groupByChange)="projects.setGroupBy($event)"
                />
                <app-feature-add-project
                  (openProject)="projects.openPickerAndAdd()"
                />
              </div>

              <ng-template #projectsHeaderCtxMenu>
                <app-projects-header-context-menu
                  (expandAll)="projects.expandAll()"
                  (collapseAll)="projects.collapseAll()"
                  (openFilter)="filter.open()"
                />
              </ng-template>

              <div hlmSidebarGroupContent>
                <app-shell-project-list />
              </div>
            </div>
          </div>

          <div
            hlmSidebarFooter
            class="flex-row justify-end border-t border-sidebar-border"
          >
            <button
              disabled
              hlmBtn
              variant="ghost"
              size="icon-xs"
              type="button"
              aria-label="Help"
              class="size-7 rounded-md text-muted-foreground"
              hlmTooltip="Help"
              position="top"
            >
              <ng-icon hlm name="lucideCircleQuestionMark" size="xs" />
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="icon-xs"
              type="button"
              routerLink="/settings"
              aria-label="Settings"
              class="size-7 rounded-md text-muted-foreground"
              hlmTooltip="Settings"
              position="top"
            >
              <ng-icon hlm name="lucideSettings" size="xs" />
            </button>
          </div>
        </hlm-sidebar>
      </div>

      <hlm-resizable-handle
        [hidden]="!layout.leftPanelOpen()"
        (dblclick)="resetLeftPanel()"
      />

      <main hlmResizablePanel class="min-w-0 overflow-auto">
        <router-outlet />
      </main>

      <hlm-resizable-handle
        [class.hidden]="!layout.rightPanelOpen()"
        (dblclick)="resetRightPanel()"
      />

      <div
        hlmResizablePanel
        #rightPanel="hlmResizablePanel"
        [defaultSize]="rightPanel_.default"
        [minSize]="layout.rightPanelOpen() ? rightPanel_.min : 0"
        [maxSize]="rightPanel_.max"
        class="transition-[flex] duration-200 ease-out"
      >
        <app-shell-aside class="h-full w-full" />
      </div>
    </div>

    <hlm-toaster position="bottom-right" />
  `,
})
export class AppShell {
  private readonly _leftPanelRef = viewChild<HlmResizablePanel>('leftPanel');
  private readonly _rightPanelRef = viewChild<HlmResizablePanel>('rightPanel');

  protected readonly isMac = inject(OsService).isMac();
  protected readonly layout = inject(LayoutService);
  protected readonly projects = inject(ProjectsFacade);

  protected readonly leftPanel_ = {
    default: pxToPercent(SHELL_LEFT_PANEL_PX.default),
    min: pxToPercent(SHELL_LEFT_PANEL_PX.min),
    max: pxToPercent(SHELL_LEFT_PANEL_PX.max),
  };

  protected readonly rightPanel_ = {
    default: pxToPercent(SHELL_RIGHT_PANEL_PX.default),
    min: pxToPercent(SHELL_RIGHT_PANEL_PX.min),
    max: pxToPercent(SHELL_RIGHT_PANEL_PX.max),
  };

  constructor() {
    effect(() => {
      const open = this.layout.leftPanelOpen();
      const panel = this._leftPanelRef();
      if (panel) {
        panel.setSize(open ? pxToPercent(SHELL_LEFT_PANEL_PX.default) : 0);
      }
    });

    effect(() => {
      const open = this.layout.rightPanelOpen();
      const panel = this._rightPanelRef();
      if (panel) {
        panel.setSize(open ? pxToPercent(SHELL_RIGHT_PANEL_PX.default) : 0);
      }
    });
  }

  protected resetLeftPanel(): void {
    this._leftPanelRef()?.setSize(pxToPercent(SHELL_LEFT_PANEL_PX.default));
  }

  protected resetRightPanel(): void {
    this._rightPanelRef()?.setSize(pxToPercent(SHELL_RIGHT_PANEL_PX.default));
  }
}
