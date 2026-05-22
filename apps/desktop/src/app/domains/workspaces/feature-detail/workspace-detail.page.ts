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
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { OsService } from '@mozart/shared-util-os';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft } from '@ng-icons/lucide';
import { filter, map, startWith } from 'rxjs/operators';
import { LayoutService } from '../../../core/layout.service';
import { MacWindowControls } from '../../../core/window-controls/mac-window-controls';
import { ChatFacade } from '../../chat';
import { ProfileFacade } from '../../profile';
import { ProjectsFacade } from '../../projects';
import {
  type CommitDialogContext,
  type CreatePrDialogContext,
} from '../../repositories';
import { RunRegistry } from '../../runs';
import { FileTabsService } from '../data/file-tabs.service';
import { IdeDetectionService } from '../data/ide-detection.service';
import { OPEN_IN_TOOLS, type OpenInTool } from '../data/open-in-tools';
import { WorkspaceTabRegistry } from '../data/workspace-tab-registry';
import { WorkspacesFacade } from '../data/workspace.facade';
import { FeatureChatTabBar } from '../feature-chat-tab-bar';
import { WorkspaceToolbar } from '../ui/workspace-toolbar';
import { WorkspaceDetailStore } from './workspace-detail.store';

@Component({
  selector: 'app-workspace-detail-page',
  imports: [
    RouterOutlet,
    NgIcon,
    MacWindowControls,
    WorkspaceToolbar,
    FeatureChatTabBar,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePanelLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-full flex-col' },
  template: `
    <app-workspace-toolbar
      class="sticky top-0 z-30"
      [projectIcon]="projectIcon()"
      [projectName]="projectName()"
      [workspaceTitle]="workspaceName()"
      [currentBranch]="store.currentBranch()"
      [targetBranch]="store.targetBranch()"
      [selectableBranches]="store.selectableBranches()"
      [isStreaming]="isStreaming()"
      [leadingSlot]="layout.leftPanelOpen() ? null : sidebarHeader()"
      [availableTools]="availableTools()"
      [lastUsedTool]="effectiveLastUsedTool()"
      [githubConnected]="profile.githubConnected()"
      [runStatus]="runStatus()"
      [hasRunCommand]="hasRunCommand()"
      [frozen]="frozen()"
      data-tour="aside-header-buttons"
      (targetBranchChange)="store.setTargetBranch($event)"
      (toggleRightPanel)="layout.toggleRightPanel()"
      (workspaceTitleChange)="onRename($event)"
      (openIn)="onOpenIn($event)"
      (commit)="onCommit()"
      (createPr)="onCreatePr()"
      (run)="onRun()"
      (stopRun)="onStopRun()"
    />

    <app-feature-chat-tab-bar
      class="sticky top-10 z-20"
      [projectId]="projectId() ?? null"
      [workspaceId]="store.workspaceId()"
      [activeTabId]="activeTabId()"
    />

    <section class="flex min-h-0 flex-1 flex-col">
      <router-outlet />
    </section>

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
        (click)="layout.toggleLeftPanel(); $any($event.currentTarget).blur()"
      >
        <ng-icon hlm name="lucidePanelLeft" size="xs" />
      </button>
    </ng-template>
  `,
})
export class WorkspaceDetailPage {
  readonly projectId = input<string | undefined>();
  readonly workspaceId = input<string | undefined>();

  protected readonly store = inject(WorkspaceDetailStore);
  protected readonly layout = inject(LayoutService);
  protected readonly isMac = inject(OsService).isMac();
  protected readonly profile = inject(ProfileFacade);

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly ides = inject(IdeDetectionService);
  private readonly dialog = inject(HlmDialogService);
  private readonly fileTabs = inject(FileTabsService);
  private readonly runs = inject(RunRegistry);
  private readonly chatFacade = inject(ChatFacade);
  private readonly tabRegistry = inject(WorkspaceTabRegistry);

  protected readonly activeTabId = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(() => this.readTabId()),
      startWith(this.readTabId()),
    ),
    { initialValue: this.readTabId() },
  );

  private readonly workspaceSignal = computed(() => this.workspaceId() ?? null);

  protected readonly availableTools = this.ides.availableTools;

  protected readonly effectiveLastUsedTool = computed<OpenInTool>(() => {
    const tools = this.availableTools();
    const last = this.store.lastUsedTool();
    if (tools.find((t) => t.id === last.id)) return last;
    return tools[0] ?? OPEN_IN_TOOLS[0];
  });

  protected readonly workspace = computed(() => {
    const id = this.workspaceId();
    return id ? this.workspaces.workspaceById(id)() : null;
  });

  protected readonly project = computed(() => {
    const ws = this.workspace();
    return ws ? this.projects.byId(ws.projectId)() : null;
  });

  protected readonly projectName = computed(() => this.project()?.name ?? '');
  protected readonly projectIcon = computed(() => this.project()?.icon ?? null);
  protected readonly workspaceName = computed(() => this.workspace()?.name ?? '');

  protected readonly isStreaming = this.chatFacade.isStreaming(
    this.workspaceSignal,
  );

  protected readonly runStatus = computed(() => {
    const id = this.workspaceId();
    if (!id) return 'idle' as const;
    return this.runs.ensureEntry(id).status();
  });

  protected readonly hasRunCommand = computed(() => !!this.project()?.runCommand);

  protected readonly frozen = computed(() => {
    const id = this.workspaceId();
    if (!id) return false;
    return this.workspaces.isFrozen(id)();
  });

  protected readonly sidebarHeader =
    viewChild.required<TemplateRef<unknown>>('sidebarHeaderTpl');

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      if (id) {
        this.store.loadWorkspace(id);
        this.workspaces.setActive(id);
        void this.workspaces.markRead(id).catch(() => undefined);
      }
    });

    effect(() => {
      const ws = this.workspace();
      if (!ws) return;
      this.store.setCurrentBranch(ws.branch);
      this.store.seedTargetBranch(ws.baseBranch);
    });

    effect(() => {
      const ws = this.workspace();
      if (!ws) return;
      this.workspaces
        .listBranchesForWorkspace(ws.id)
        .then((branches) => this.store.setBranches(branches))
        .catch((err) => {
          console.warn('list branches failed', err);
        });
    });

    effect(() => {
      const workspaceId = this.workspaceId();
      const tabId = this.activeTabId();
      if (!workspaceId || !tabId) return;
      const tab = this.tabRegistry.parse(tabId);
      if (!tab) return;

      if (tab.kind === 'chat') {
        this.fileTabs.setActiveFor(workspaceId, null);
        void this.chatFacade.setActiveChat(workspaceId, tab.chatId);
      } else if (tab.kind === 'file') {
        this.fileTabs.openFor(workspaceId, tab.path);
      }
    });
  }

  protected async onRename(name: string): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.workspaces.rename(id, name);
    } catch (err) {
      console.warn('rename workspace failed', err);
    }
  }

  protected async onOpenIn(tool: OpenInTool): Promise<void> {
    this.store.openIn(tool);
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.workspaces.openInIde(id, tool.id);
    } catch (err) {
      console.warn('[detail] open-in-ide failed:', err);
    }
  }

  protected async onCommit(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    const context: CommitDialogContext = {
      workspaceId: id,
    };
    const { FeatureCommitDialog } = await import(
      '../../repositories/feature-commit-dialog'
    );
    this.dialog.open(FeatureCommitDialog, { context });
  }

  protected async onRun(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.runs.start(id);
    } catch (err) {
      console.warn('[detail] run start failed:', err);
    }
  }

  protected async onStopRun(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    try {
      await this.runs.stop(id);
    } catch (err) {
      console.warn('[detail] run stop failed:', err);
    }
  }

  protected async onCreatePr(): Promise<void> {
    const id = this.workspaceId();
    if (!id) return;
    const ws = this.workspaces.workspaceById(id)();
    const context: CreatePrDialogContext = {
      workspaceId: id,
      defaultTitle: ws?.name ?? '',
    };
    const { FeatureCreatePrDialog } = await import(
      '../../repositories/feature-create-pr-dialog'
    );
    this.dialog.open(FeatureCreatePrDialog, { context });
  }

  private readTabId(): string {
    const child = this.route.firstChild;
    return child?.snapshot.paramMap.get('tabId') ?? '';
  }
}
