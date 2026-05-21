import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { OsService } from '@mozart/shared-util-os';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmContextMenuImports } from '@mozart/ui/context-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmSidebarImports } from '@mozart/ui/sidebar';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleQuestionMark,
  lucidePanelLeft,
  lucideSettings,
} from '@ng-icons/lucide';
import { AddProjectFlow } from '../core/add-project.flow';
import { FeatureFlagsService } from '../core/feature-flags';
import { LayoutService } from '../core/layout.service';
import { MacWindowControls } from '../core/window-controls/mac-window-controls';
import { FeatureChatList } from '../domains/chat';
import {
  FeatureAddProject,
  GroupByFilter,
  ProjectsFacade,
  ProjectsHeaderContextMenu,
} from '../domains/projects';
import { SHELL_LEFT_PANEL_WIDTH } from './shell-panel.constants';
import { ShellProjectList } from './shell-project-list';

// Left shell panel. Owns its own collapse behavior: width snaps to
// SHELL_LEFT_PANEL_WIDTH when open, 0px when closed. Hosts the projects
// list, optional chat list, and the footer (help + settings).
//
// Pulled out of `app-shell` so the root shell stays a thin composer.
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
  host: {
    class:
      'relative block shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
    '[style.width]': '_width()',
  },
  template: `
    <!-- Inner panel is absolute-positioned at the host's left edge with
         a fixed width. The border-r lives ON this inner panel (not the
         host), so when the host shrinks to 0px, overflow-hidden clips
         both the content AND the border in one stroke — no orphan
         border line remains when the sidebar is closed. -->
    <div
      class="absolute inset-y-0 left-0 border-r border-sidebar-border"
      [style.width]="_fullWidth"
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
              src="/assets/shared/logos/mozart-logo.svg"
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
  `,
})
export class ShellLeft {
  protected readonly isMac = inject(OsService).isMac();
  protected readonly layout = inject(LayoutService);
  protected readonly projects = inject(ProjectsFacade);
  protected readonly addProjectFlow = inject(AddProjectFlow);
  protected readonly flags = inject(FeatureFlagsService);

  // Inner panel keeps a constant width — only the host's width
  // animates (0 ↔ SHELL_LEFT_PANEL_WIDTH). overflow-hidden does the
  // reveal/hide via clipping; the inner stays put.
  protected readonly _fullWidth = SHELL_LEFT_PANEL_WIDTH;
  protected readonly _width = computed(() =>
    this.layout.leftPanelOpen() ? SHELL_LEFT_PANEL_WIDTH : '0px',
  );
}
