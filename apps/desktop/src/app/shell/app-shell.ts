import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmResizableImports, HlmResizablePanel } from '@mozart/ui/resizable';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleQuestionMark,
  lucideFolderOpen,
  lucideFolderPlus,
  lucideGithub,
  lucidePanelLeft,
  lucideSettings,
  lucideZap,
} from '@ng-icons/lucide';
import { OsService } from '../core/os.service';
import { ShellLayoutService } from '../core/shell-layout.service';
import { GroupByFilter } from './group-by-filter';
import { MacWindowControls } from './mac-window-controls';
import { ProjectList } from './project-list';
import { ShellAside } from './shell-aside';
import {
  SHELL_LEFT_PANEL_PX,
  SHELL_RIGHT_PANEL_PX,
  pxToPercent,
} from './shell-panel.constants';

@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterOutlet,
    NgIcon,
    MacWindowControls,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmResizableImports,
    HlmSidebarImports,
    HlmTooltipImports,
    GroupByFilter,
    ProjectList,
    ShellAside,
  ],
  providers: [
    provideIcons({
      lucideCircleQuestionMark,
      lucideFolderOpen,
      lucideFolderPlus,
      lucideGithub,
      lucidePanelLeft,
      lucideSettings,
      lucideZap,
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
      >
        <hlm-sidebar side="left" collapsible="none" class="h-full w-full">
          <div
            hlmSidebarHeader
            data-tauri-drag-region
            class="h-9 flex-row items-center gap-1 border-b border-sidebar-border px-2 py-1"
          >
            @if (isMac) {
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
              class="size-6 text-muted-foreground"
              data-tauri-drag-region="false"
              (click)="layout.toggleLeftPanel()"
            >
              <ng-icon hlm name="lucidePanelLeft" size="sm" />
            </button>
          </div>

          <div hlmSidebarContent>
            <div hlmSidebarGroup class="px-2 py-1">
              <div class="flex h-8 items-center gap-0.5">
                <span
                  class="text-sidebar-foreground/70 flex-1 text-xs font-medium"
                >
                  Projects
                </span>
                <app-group-by-filter />
                <button
                  hlmBtn
                  variant="ghost"
                  size="icon-xs"
                  hlmTooltip="Add repository"
                  position="top"
                  class="size-7 rounded-md text-muted-foreground"
                  [hlmDropdownMenuTrigger]="addMenu"
                >
                  <ng-icon hlm name="lucideFolderPlus" size="xs" />
                </button>
                <ng-template #addMenu>
                  <hlm-dropdown-menu>
                    <button hlmDropdownMenuItem type="button">
                      <ng-icon hlm name="lucideFolderOpen" size="sm" />
                      Open project
                    </button>
                    <button
                      hlmDropdownMenuItem
                      type="button"
                      disabled
                      hlmTooltip="Coming in v0.2"
                    >
                      <ng-icon hlm name="lucideGithub" size="sm" />
                      Open GitHub project
                    </button>
                    <button
                      hlmDropdownMenuItem
                      type="button"
                      disabled
                      hlmTooltip="Coming in v0.2"
                    >
                      <ng-icon hlm name="lucideZap" size="sm" />
                      Quick start
                    </button>
                  </hlm-dropdown-menu>
                </ng-template>
              </div>

              <div hlmSidebarGroupContent>
                <app-project-list />
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
              size="icon-sm"
              type="button"
              aria-label="Help"
              class="text-muted-foreground"
              hlmTooltip="Help"
              position="top"
            >
              <ng-icon hlm name="lucideCircleQuestionMark" size="sm" />
            </button>
            <button
              hlmBtn
              variant="ghost"
              size="icon-sm"
              type="button"
              routerLink="/settings"
              aria-label="Settings"
              class="text-muted-foreground"
              hlmTooltip="Settings"
              position="top"
            >
              <ng-icon hlm name="lucideSettings" size="sm" />
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
      >
        <app-shell-aside class="h-full w-full" />
      </div>
    </div>
  `,
})
export class AppShell {
  private readonly _leftPanelRef = viewChild<HlmResizablePanel>('leftPanel');
  private readonly _rightPanelRef = viewChild<HlmResizablePanel>('rightPanel');

  protected readonly isMac = inject(OsService).isMac();
  protected readonly layout = inject(ShellLayoutService);

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
