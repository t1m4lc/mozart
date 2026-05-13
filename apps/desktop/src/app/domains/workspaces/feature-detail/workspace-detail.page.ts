import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  viewChild,
  TemplateRef,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft } from '@ng-icons/lucide';
import { LayoutService } from '../../../core/layout.service';
import { OsService } from '../../../core/os.service';
import { MacWindowControls } from '../../../core/window-controls/mac-window-controls';
import { OPEN_IN_TOOLS } from '../data/open-in-tools';
import { ChatEmptyState } from '../ui/chat-empty-state/chat-empty-state';
import { WorkspaceTabBar } from '../ui/workspace-tab-bar/workspace-tab-bar';
import { WorkspaceToolbar } from '../ui/workspace-toolbar/workspace-toolbar';
import { WorkspaceDetailStore } from './workspace-detail.store';

@Component({
  selector: 'app-workspace-detail-page',
  imports: [
    NgIcon,
    MacWindowControls,
    WorkspaceToolbar,
    WorkspaceTabBar,
    ChatEmptyState,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePanelLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <app-workspace-toolbar
      [projectIcon]="store.projectIcon()"
      [projectName]="store.projectName()"
      [workspaceTitle]="store.workspaceTitle()"
      [targetBranch]="store.targetBranch()"
      [selectableBranches]="store.selectableBranches()"
      [tools]="tools"
      [lastUsedTool]="store.lastUsedTool()"
      [leadingSlot]="layout.leftPanelOpen() ? null : sidebarHeader()"
      (targetBranchChange)="store.setTargetBranch($event)"
      (openIn)="store.openIn($event)"
      (toggleRightPanel)="layout.toggleRightPanel()"
      (workspaceTitleChange)="store.setWorkspaceTitle($event)"
    />

    <app-workspace-tab-bar />

    <app-chat-empty-state
      [projectName]="store.projectName()"
      [workspaceName]="store.workspaceTitle()"
      [sourceBranch]="store.workspaceTitle()"
      [targetBranch]="store.targetBranch()"
      [numberOfFiles]="0"
    />

    <ng-template #sidebarHeaderTpl>
      @if (isMac) {
        <app-mac-window-controls />
      }
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
          layout.toggleLeftPanel();
          $any($event.currentTarget).blur()
        "
      >
        <ng-icon hlm name="lucidePanelLeft" size="xs" />
      </button>
    </ng-template>
  `,
})
export class WorkspaceDetailPage {
  // Route param — Angular's `withComponentInputBinding()` would normally
  // hand us the `id` here. The current router setup binds via `input()`.
  readonly id = input<string | undefined>();

  protected readonly store = inject(WorkspaceDetailStore);
  protected readonly layout = inject(LayoutService);
  protected readonly isMac = inject(OsService).isMac();
  protected readonly tools = OPEN_IN_TOOLS;

  protected readonly sidebarHeader =
    viewChild.required<TemplateRef<unknown>>('sidebarHeaderTpl');

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) this.store.loadWorkspace(id);
    });
  }
}
