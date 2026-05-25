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
import { RouterOutlet } from '@angular/router';
import { OsService } from '@mozart/shared-util-os';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogService } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft } from '@ng-icons/lucide';
import { LayoutService } from '@mozart/desktop-ui-state-data-access';
import { MacWindowControls } from '@mozart/desktop-core-ui';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import {
  FeatureCommitDialog,
  type CommitDialogContext,
} from '@mozart/desktop-repositories-feature';
import {
  FeatureCreatePrDialog,
  type CreatePrDialogContext,
} from '@mozart/desktop-repositories-feature';
import { RunRegistry } from '@mozart/desktop-runs-data-access';
import { IdeDetectionService } from '@mozart/desktop-workspaces-data-access';
import { OPEN_IN_TOOLS, type OpenInTool } from '@mozart/desktop-workspaces-util';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import { WorkspaceToolbar } from '../workspace-toolbar';
import { WorkspaceDetailStore } from '@mozart/desktop-workspaces-data-access';

@Component({
  selector: 'app-workspace-detail-page',
  imports: [
    RouterOutlet,
    NgIcon,
    MacWindowControls,
    WorkspaceToolbar,
    HlmButtonImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [provideIcons({ lucidePanelLeft })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // h-full (exact, not min-h-full) so the page is locked to the viewport.
  // overflow-hidden so any inner overflow is scoped to scroll containers
  // inside the page (chat-scroll-surface, CodeMirror) instead of leaking
  // up to <main>. Without this, long content can scroll the whole page
  // and the composer (absolutely positioned inside WorkspaceTabContent)
  // scrolls with it instead of staying pinned at viewport bottom.
  host: { class: 'flex h-full flex-col overflow-hidden' },
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

  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly ides = inject(IdeDetectionService);
  private readonly dialog = inject(HlmDialogService);
  private readonly runs = inject(RunRegistry);
  private readonly chatFacade = inject(ChatFacade);

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
    computed(() => this.workspaceId() ?? null),
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
        void this.workspaces.markRead(id).catch(() => undefined);
        // Page-level safety net: the workspace must have at least one
        // chat before any tab renders, because the composer (mounted
        // above the @switch) may send before the user ever visits a
        // chat tab. Idempotent; facade is the single source of truth.
        this.chatFacade.ensureChatForWorkspace(id);
      }
    });

    // Mirror workspace branch fields into the detail store on workspace
    // change. Effect form is used because the store's setters are also
    // called imperatively (e.g., the branch picker writes targetBranch
    // directly). See TODO.md (signals cleanup) for the deferred store
    // refactor that would let this become a reactive binding.
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
    this.dialog.open(FeatureCreatePrDialog, { context });
  }
}
