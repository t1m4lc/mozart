import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
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
  lucideWifiOff,
} from '@ng-icons/lucide';
import { AddProjectFlow } from '../core/add-project.flow';
import { ConnectivityService } from '../core/connectivity.service';
import { LayoutService } from '../core/layout.service';
import { OsService } from '../core/os.service';
import { MacWindowControls } from '../core/window-controls/mac-window-controls';
import { NonMacWindowControls } from '../core/window-controls/non-mac-window-controls';
import { FeatureChatList } from '../domains/chat';
import { FeatureTour } from '../domains/onboarding';
import {
  FeatureAddProject,
  GroupByFilter,
  ProjectsFacade,
  ProjectsHeaderContextMenu,
} from '../domains/projects';
import { WorkspacesFacade } from '../domains/workspaces';
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
    NonMacWindowControls,
    HlmButtonImports,
    HlmContextMenuImports,
    HlmIconImports,
    HlmResizableImports,
    HlmSidebarImports,
    HlmToasterImports,
    HlmTooltipImports,
    FeatureAddProject,
    FeatureChatList,
    FeatureTour,
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
      lucideWifiOff,
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
            @if (!isMac) {
              <app-non-mac-window-controls />
            }
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
                  [class.hidden]="projects.visible().length === 0"
                />
                <app-feature-add-project
                  (openProject)="addProjectFlow.openPickerAndOpen()"
                  (openGithubProject)="addProjectFlow.openCloneDialog()"
                  (quickStart)="addProjectFlow.openCreateDialog()"
                />
              </div>

              <ng-template #projectsHeaderCtxMenu>
                <app-projects-header-context-menu
                  (expandAll)="projects.expandAll()"
                  (collapseAll)="projects.collapseAll()"
                  (openFilter)="filter.open()"
                  (openProject)="addProjectFlow.openPickerAndOpen()"
                  (openGithubProject)="addProjectFlow.openCloneDialog()"
                  (quickStart)="addProjectFlow.openCreateDialog()"
                />
              </ng-template>

              <div hlmSidebarGroupContent>
                <app-shell-project-list />
              </div>
            </div>

            <div hlmSidebarGroup class="px-2 py-1">
              <app-feature-chat-list />
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
        [class.hidden]="!showRightAside()"
        (dblclick)="resetRightPanel()"
      />

      <div
        hlmResizablePanel
        #rightPanel="hlmResizablePanel"
        [defaultSize]="rightPanelDefault()"
        [minSize]="showRightAside() ? rightPanel_.min : 0"
        [maxSize]="rightPanel_.max"
        class="transition-[flex] duration-200 ease-out"
      >
        <app-shell-aside class="h-full w-full" />
      </div>
    </div>

    <hlm-toaster
      position="bottom-right"
      [style]="toasterStyle"
    />

    @if (!connectivity.connected()) {
      <div
        role="status"
        class="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center"
      >
        <div
          class="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-xs text-amber-900 shadow dark:text-amber-200"
        >
          <ng-icon hlm name="lucideWifiOff" size="xs" />
          <span>You're offline. Hosted features (sign-in, hosted LLMs) are paused.</span>
        </div>
      </div>
    }

    @if (tourActive()) {
      <app-feature-tour />
    }

    <!-- IMP-003 — On macOS, when there's no right aside (dashboard,
         settings, welcome), the traffic-light buttons float at the
         top-right of the viewport. When a workspace is selected, the
         buttons live in the right-aside header (see ShellAside). -->
    @if (isMac && !showRightAside()) {
      <div
        class="fixed right-3 top-2 z-50"
        data-tauri-drag-region="false"
      >
        <app-mac-window-controls />
      </div>
    }
  `,
})
export class AppShell {
  private readonly _leftPanelRef = viewChild<HlmResizablePanel>('leftPanel');
  private readonly _rightPanelRef = viewChild<HlmResizablePanel>('rightPanel');

  protected readonly isMac = inject(OsService).isMac();
  protected readonly layout = inject(LayoutService);
  protected readonly projects = inject(ProjectsFacade);
  protected readonly addProjectFlow = inject(AddProjectFlow);
  protected readonly connectivity = inject(ConnectivityService);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly route = inject(ActivatedRoute);

  /** Tour overlay visibility — driven by the `?tour=on` query param
   *  attached by `/tour` when it redirects to the workspace. */
  protected readonly tourActive = toSignal(
    this.route.queryParamMap.pipe(map((q) => q.get('tour') === 'on')),
    { initialValue: false },
  );

  // Right aside is only meaningful inside a workspace context. Hidden
  // on the dashboard and any non-workspace route. Combines with the
  // user's manual toggle so closing it in a workspace is still respected.
  protected readonly showRightAside = computed(
    () => this.workspaces.activeId() !== null && this.layout.rightPanelOpen(),
  );

  // Default-size binding. Brn applies defaultSize at panel init and
  // ignores subsequent imperative setSize when it conflicts with the
  // group's first layout pass — driving defaultSize off the same signal
  // keeps initial render in sync with the showRightAside state.
  protected readonly rightPanelDefault = computed(() =>
    this.workspaces.activeId() !== null
      ? pxToPercent(SHELL_RIGHT_PANEL_PX.default)
      : 0,
  );

  protected readonly leftPanel_ = {
    default: pxToPercent(SHELL_LEFT_PANEL_PX.default),
    min: pxToPercent(SHELL_LEFT_PANEL_PX.min),
    max: pxToPercent(SHELL_LEFT_PANEL_PX.max),
  };

  // HlmToaster's default userStyle feeds the sonner CSS variables raw
  // HSL components (e.g. `var(--popover)` -> `0 0% 100%`), which is not
  // a valid CSS color and renders the toast transparent. We wrap each
  // token in `hsl(...)` so the rendered toast picks up the theme's
  // popover background, foreground, and border. libs/ui is read-only,
  // so the override happens here at the consumer.
  protected readonly toasterStyle: Record<string, string> = {
    '--normal-bg': 'hsl(var(--popover))',
    '--normal-text': 'hsl(var(--popover-foreground))',
    '--normal-border': 'hsl(var(--border))',
    '--border-radius': 'var(--radius)',
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
      const open = this.showRightAside();
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
