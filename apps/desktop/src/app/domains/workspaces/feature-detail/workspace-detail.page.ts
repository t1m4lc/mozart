import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft } from '@ng-icons/lucide';
import { LayoutService } from '../../../core/layout.service';
import { OsService } from '../../../core/os.service';
import { MacWindowControls } from '../../../core/window-controls/mac-window-controls';
import { ChatFacade, FeatureChatPanel } from '../../chat';
import { ProjectsFacade } from '../../projects';
import { OPEN_IN_TOOLS } from '../data/open-in-tools';
import { WorkspacesFacade } from '../data/workspace.facade';
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
    FeatureChatPanel,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePanelLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col h-full' },
  template: `
    <app-workspace-toolbar
      [projectIcon]="projectIcon()"
      [projectName]="projectName()"
      [workspaceTitle]="workspaceName()"
      [targetBranch]="store.targetBranch()"
      [selectableBranches]="store.selectableBranches()"
      [tools]="tools"
      [lastUsedTool]="store.lastUsedTool()"
      [isStreaming]="isStreaming()"
      [leadingSlot]="layout.leftPanelOpen() ? null : sidebarHeader()"
      (targetBranchChange)="store.setTargetBranch($event)"
      (openIn)="store.openIn($event)"
      (toggleRightPanel)="layout.toggleRightPanel()"
      (workspaceTitleChange)="onRename($event)"
    />

    <app-workspace-tab-bar />

    <app-feature-chat-panel
      class="flex-1 min-h-0"
      [workspaceId]="store.workspaceId()"
    >
      <app-chat-empty-state
        chat-empty-state
        [projectName]="store.projectName()"
        [workspaceName]="store.workspaceTitle()"
        [sourceBranch]="store.workspaceTitle()"
        [targetBranch]="store.targetBranch()"
        [numberOfFiles]="0"
      />
    </app-feature-chat-panel>

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
        (click)="layout.toggleLeftPanel(); $any($event.currentTarget).blur()"
      >
        <ng-icon hlm name="lucidePanelLeft" size="xs" />
      </button>
    </ng-template>
  `,
})
export class WorkspaceDetailPage {
  readonly id = input<string | undefined>();

  protected readonly store = inject(WorkspaceDetailStore);
  protected readonly layout = inject(LayoutService);
  protected readonly isMac = inject(OsService).isMac();
  protected readonly tools = OPEN_IN_TOOLS;
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);

  // Live workspace + project derived from the route id. The detail store
  // still owns local UI state (target branch, last-used tool, etc.); the
  // identity (which workspace, which project) is read fresh from the
  // facades so the toolbar reacts to hydration and rename in real time.
  protected readonly workspace = computed(() => {
    const id = this.id();
    return id ? this.workspaces.workspaceById(id)() : null;
  });

  protected readonly project = computed(() => {
    const ws = this.workspace();
    return ws ? this.projects.byId(ws.projectId)() : null;
  });

  protected readonly projectName = computed(() => this.project()?.name ?? '');
  protected readonly projectIcon = computed(() => this.project()?.icon ?? null);
  protected readonly workspaceName = computed(
    () => this.workspace()?.name ?? '',
  );

  protected readonly isStreaming = inject(ChatFacade).isStreaming(
    this.store.workspaceId,
  );

  protected readonly sidebarHeader =
    viewChild.required<TemplateRef<unknown>>('sidebarHeaderTpl');

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) {
        this.store.loadWorkspace(id);
        this.workspaces.setActive(id);
      }
    });

    // Fetch real git branches whenever the resolved workspace (with
    // its project) is available. Reruns when the workspace list
    // hydrates so a freshly-added project's branches appear without
    // navigating away and back.
    effect(() => {
      const ws = this.workspace();
      if (!ws) return;
      this.workspaces
        .listBranchesForWorkspace(ws.id)
        .then((branches) => this.store.setBranches(branches))
        .catch((err) => console.warn('list branches failed', err));
    });
  }

  protected async onRename(name: string): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      await this.workspaces.rename(id, name);
    } catch (err) {
      console.warn('rename workspace failed', err);
    }
  }
}
