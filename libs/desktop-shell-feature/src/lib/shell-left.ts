import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { OsService } from '@mozart/shared-util-os';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmContextMenuImports } from '@spartan-ui/context-menu';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmSidebarImports } from '@spartan-ui/sidebar';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft, lucideSettings } from '@ng-icons/lucide';
import { AddProjectFlow } from './add-project.flow';
import { ShellHelpMenu } from './shell-help-menu';
import { FeatureFlagsService } from '@mozart/desktop-core-util';
import { LayoutService } from '@mozart/desktop-ui-state-data-access';
import { MacWindowControls } from '@mozart/desktop-core-ui';
import { FeatureChatList } from '@mozart/desktop-chat-feature';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { GroupByFilter } from '@mozart/desktop-projects-feature';
import {
  FeatureAddProject,
  ProjectsHeaderContextMenu,
} from '@mozart/desktop-projects-ui';
import { SHELL_LEFT_PANEL_WIDTH } from './shell-panel.constants';
import { ShellProjectList } from './shell-project-list';
import { ShellSidePanel } from './shell-side-panel';

// Left shell panel. Outer collapse chrome lives in <app-shell-side-panel>
// (shared with shell-right). This component composes the left-specific
// content: projects list, optional chat list, and the footer
// (help + settings).
@Component({
  selector: 'app-shell-left',
  imports: [
    RouterLink,
    NgIcon,
    MacWindowControls,
    HlmButtonImports,
    HlmContextMenuImports,
    HlmIconImports,
    HlmSidebarImports,
    HlmTooltipImports,
    FeatureAddProject,
    FeatureChatList,
    GroupByFilter,
    ProjectsHeaderContextMenu,
    ShellHelpMenu,
    ShellProjectList,
    ShellSidePanel,
  ],
  providers: [
    provideIcons({
      lucidePanelLeft,
      lucideSettings,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <app-shell-side-panel
      side="left"
      [open]="layout.leftPanelOpen()"
      [width]="_fullWidth"
    >
      <hlm-sidebar side="left" collapsible="none" class="h-full w-full">
        <div
          hlmSidebarHeader
          data-tauri-drag-region
          class="h-10 flex-row items-center gap-1 border-b border-sidebar-border px-2 py-1"
        >
          @if (isMac) {
            <app-mac-window-controls />
          } @else {
            <img
              src="/assets/shared/logos/mozart-logo-icon.svg"
              alt="Mozart desktop"
              class="size-6 shrink-0 cursor-default "
            />
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
            (click)="
              layout.toggleLeftPanel(); $any($event.currentTarget).blur()
            "
          >
            <ng-icon hlm name="lucidePanelLeft" size="sm" />
          </button>
        </div>

        <div hlmSidebarContent>
          <div hlmSidebarGroup class="px-2 py-1">
            <div
              class="flex h-8 items-center gap-0.5"
              [hlmContextMenuTrigger]="projectsHeaderCtxMenu"
            >
              <span
                class="text-sidebar-foreground/70 flex-1 text-[13px] font-medium tracking-tight"
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
                [githubConnected]="profile.githubConnected()"
                (openProject)="addProjectFlow.openPickerAndOpen()"
                (openGithubProject)="addProjectFlow.openCloneDialog()"
              />
              <!-- (quickStart)="addProjectFlow.openCreateDialog()" -->
            </div>

            <ng-template #projectsHeaderCtxMenu>
              <app-projects-header-context-menu
                [githubConnected]="profile.githubConnected()"
                (expandAll)="projects.expandAll()"
                (collapseAll)="projects.collapseAll()"
                (openFilter)="filter.open()"
                (openProject)="addProjectFlow.openPickerAndOpen()"
                (openGithubProject)="addProjectFlow.openCloneDialog()"
              />
              <!-- (quickStart)="addProjectFlow.openCreateDialog()" -->
            </ng-template>

            <div hlmSidebarGroupContent>
              <app-shell-project-list />
            </div>
          </div>

          @if (flags.chat()) {
            <div hlmSidebarGroup class="px-2 py-1">
              <app-feature-chat-list />
            </div>
          }
        </div>

        <div
          hlmSidebarFooter
          class="flex-row justify-end border-t border-sidebar-border"
        >
          <app-shell-help-menu />
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
            <ng-icon hlm name="lucideSettings" size="sm" />
          </button>
        </div>
      </hlm-sidebar>
    </app-shell-side-panel>
  `,
})
export class ShellLeft {
  protected readonly isMac = inject(OsService).isMac();
  protected readonly layout = inject(LayoutService);
  protected readonly projects = inject(ProjectsFacade);
  protected readonly profile = inject(ProfileFacade);
  protected readonly addProjectFlow = inject(AddProjectFlow);
  protected readonly flags = inject(FeatureFlagsService);

  // Constant — only the side panel's host width animates between this
  // and 0 (driven by ShellSidePanel from layout.leftPanelOpen()).
  protected readonly _fullWidth = SHELL_LEFT_PANEL_WIDTH;
}
