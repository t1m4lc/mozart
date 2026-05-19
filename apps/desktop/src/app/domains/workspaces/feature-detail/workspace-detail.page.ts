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
import { HlmDialogService } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft } from '@ng-icons/lucide';
import { LayoutService } from '../../../core/layout.service';
import { OsService } from '@mozart/shared-util-os';
import { MacWindowControls } from '../../../core/window-controls/mac-window-controls';
import { ChatFacade, FeatureChatPanel } from '../../chat';
import { ProjectsFacade } from '../../projects';
import { ProfileFacade } from '../../profile';
import {
  FeatureFileDiff,
  type CommitDialogContext,
  type CreatePrDialogContext,
} from '../../repositories';
import { RunRegistry } from '../../runs';
import { FileTabsService } from '../data/file-tabs.service';
import { IdeDetectionService } from '../data/ide-detection.service';
import { OPEN_IN_TOOLS, type OpenInTool } from '../data/open-in-tools';
import { WorkspacesFacade } from '../data/workspace.facade';
import { FeatureChatTabBar } from '../feature-chat-tab-bar/feature-chat-tab-bar';
import { ChatEmptyState } from '../ui/chat-empty-state/chat-empty-state';
import { WorkspaceToolbar } from '../ui/workspace-toolbar/workspace-toolbar';
import { WorkspaceDetailStore } from './workspace-detail.store';

@Component({
  selector: 'app-workspace-detail-page',
  imports: [
    NgIcon,
    MacWindowControls,
    WorkspaceToolbar,
    FeatureChatTabBar,
    ChatEmptyState,
    FeatureChatPanel,
    FeatureFileDiff,
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
      #tabBar
      [workspaceId]="store.workspaceId()"
    />

    @if (activeFileTabPath(); as path) {
      <!-- File tab active — diff view replaces the chat panel.
           @defer was removed because on-viewport sometimes didn't
           re-trigger when the user came back to a file tab after a
           chat detour. The diff chunk is light; markdown.js is still
           deferred inside ui-markdown-view. -->
      <app-feature-file-diff
        class="flex-1 min-h-0"
        [workspaceId]="id()!"
        [path]="path"
      />
    } @else {
      <app-feature-chat-panel
        #chatPanel
        class="flex-1 min-h-0"
        [workspaceId]="store.workspaceId()"
        [frozen]="frozen()"
      >
        <app-chat-empty-state
          chat-empty-state
          [variant]="activeTabIsFirst() ? 'start' : 'untitled'"
          [projectName]="projectName()"
          [workspaceName]="workspaceName()"
          [sourceBranch]="store.currentBranch()"
          [targetBranch]="store.targetBranch() || 'main'"
          [numberOfFiles]="0"
          [installState]="install().state"
          [installManager]="install().manager"
        />
      </app-feature-chat-panel>
    }

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
  protected readonly profile = inject(ProfileFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly ides = inject(IdeDetectionService);
  private readonly dialog = inject(HlmDialogService);
  private readonly fileTabs = inject(FileTabsService);
  private readonly runs = inject(RunRegistry);

  // Null when the active workspace tab is a chat (the chat panel
  // renders). A path when the active tab is a file tab opened from
  // the Files slot's Changes list (the diff view renders instead).
  protected readonly activeFileTabPath = computed(() => {
    const id = this.id();
    if (!id) return null;
    return this.fileTabs.activeByWorkspace().get(id) ?? null;
  });

  // IMP-004 — the 3 action buttons (Open in IDE / Commit / Create PR)
  // moved from the right-aside header to the workspace toolbar. The
  // dialog-opening logic + IDE selection live on this page; the aside
  // no longer needs to know.
  protected readonly availableTools = this.ides.availableTools;

  protected readonly effectiveLastUsedTool = computed<OpenInTool>(() => {
    const tools = this.availableTools();
    const last = this.store.lastUsedTool();
    if (tools.find((t) => t.id === last.id)) return last;
    return tools[0] ?? OPEN_IN_TOOLS[0];
  });

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

  private readonly chatFacade = inject(ChatFacade);
  protected readonly isStreaming = this.chatFacade.isStreaming(
    this.store.workspaceId,
  );

  protected readonly runStatus = computed(() => {
    const id = this.id();
    if (!id) return 'idle' as const;
    return this.runs.ensureEntry(id).status();
  });

  protected readonly hasRunCommand = computed(
    () => !!this.project()?.runCommand,
  );

  // Plan P0.2 freeze gate — true when the active workspace's UI status
  // is `done`. Drives the chat-panel banner + composer disabled, and
  // (indirectly via the aside) the Run/terminal gates.
  protected readonly frozen = computed(() => {
    const id = this.id();
    if (!id) return false;
    return this.workspaces.isFrozen(id)();
  });

  // True when the active chat is the first (oldest) chat in the
  // workspace — drives the empty-state copy ('Start' vs 'Untitled').
  protected readonly activeTabIsFirst = computed(() => {
    const ws = this.store.workspaceId();
    if (!ws) return true;
    const list = this.chatFacade.chatsByWorkspace().get(ws) ?? [];
    if (list.length === 0) return true;
    const activeId = this.chatFacade.activeChatIdFor(ws) ?? list[0].id;
    return list[0].id === activeId;
  });

  // Current package-install lifecycle for this workspace. Tracks the
  // running -> success/failed/no_package transitions so the empty-state
  // step 4 renders the live status without needing a toast.
  protected readonly install = computed(() => {
    const id = this.id();
    return id
      ? this.workspaces.installFor(id)
      : ({ state: 'idle' as const, manager: '' });
  });

  protected readonly sidebarHeader =
    viewChild.required<TemplateRef<unknown>>('sidebarHeaderTpl');
  // Optional because the chat panel only mounts in the `@else` branch
  // (when no file tab is active). `viewChild.required` would throw
  // NG0951 every time a file diff replaced the chat panel.
  private readonly chatPanel = viewChild(FeatureChatPanel);

  constructor() {
    // Active chat changed -> refocus the composer. Mirrors the previous
    // tab-bar-driven refocus, now sourced from the facade's per-workspace
    // active-chat map.
    effect(() => {
      const ws = this.store.workspaceId();
      if (ws) {
        // touch to subscribe; value not used
        this.chatFacade.activeChatIdFor(ws);
      }
      this.chatPanel()?.focusComposer();
    });

    effect(() => {
      const id = this.id();
      if (id) {
        this.store.loadWorkspace(id);
        this.workspaces.setActive(id);
        // Navigating to a workspace counts as "viewing" — clear its
        // unread flag so the sidebar row drops the bold style.
        void this.workspaces.markRead(id).catch(() => undefined);
      }
    });

    // Push the workspace's own branch into the store so the picker can
    // mark it as current and filter it from the selectable list. Also
    // seed the target branch from `baseBranch` (the branch the
    // workspace was forked from) on first resolution.
    effect(() => {
      const ws = this.workspace();
      if (!ws) return;
      this.store.setCurrentBranch(ws.branch);
      this.store.seedTargetBranch(ws.baseBranch);
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

  protected async onOpenIn(tool: OpenInTool): Promise<void> {
    this.store.openIn(tool);
    const id = this.id();
    if (!id) return;
    try {
      await this.workspaces.openInIde(id, tool.id);
    } catch (err) {
      console.warn('[detail] open-in-ide failed:', err);
    }
  }

  protected async onCommit(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const context: CommitDialogContext = {
      workspaceId: id,
    };
    const { FeatureCommitDialog } = await import(
      '../../repositories/feature-commit-dialog/feature-commit-dialog'
    );
    this.dialog.open(FeatureCommitDialog, { context });
  }

  protected async onRun(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      await this.runs.start(id);
    } catch (err) {
      console.warn('[detail] run start failed:', err);
    }
  }

  protected async onStopRun(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      await this.runs.stop(id);
    } catch (err) {
      console.warn('[detail] run stop failed:', err);
    }
  }

  protected async onCreatePr(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const ws = this.workspaces.workspaceById(id)();
    const context: CreatePrDialogContext = {
      workspaceId: id,
      defaultTitle: ws?.name ?? '',
    };
    const { FeatureCreatePrDialog } = await import(
      '../../repositories/feature-create-pr-dialog/feature-create-pr-dialog'
    );
    this.dialog.open(FeatureCreatePrDialog, { context });
  }
}
