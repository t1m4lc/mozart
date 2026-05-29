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
import {
  OPEN_IN_TOOLS,
  type OpenInTool,
  type UiWorkspaceStatus,
} from '@mozart/desktop-workspaces-util';
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
      [baseBranch]="workspace()?.baseBranch ?? 'main'"
      [isStreaming]="isStreaming()"
      [leadingSlot]="layout.leftPanelOpen() ? null : sidebarHeader()"
      [availableTools]="availableTools()"
      [lastUsedTool]="effectiveLastUsedTool()"
      [githubConnected]="profile.githubConnected()"
      [runStatus]="runStatus()"
      [hasRunCommand]="hasRunCommand()"
      [workspaceStatus]="workspaceStatus()"
      [frozen]="frozen()"
      data-tour="aside-header-buttons"
      (toggleRightPanel)="layout.toggleRightPanel()"
      (workspaceTitleChange)="onRename($event)"
      (openIn)="onOpenIn($event)"
      (commit)="onCommit()"
      (createPr)="onCreatePr()"
      (run)="onRun()"
      (stopRun)="onStopRun()"
      (workspaceStatusChange)="onWorkspaceStatusChange($event)"
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
        <ng-icon hlm name="lucidePanelLeft" size="sm" />
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

  // Effective run command (DB column OR `.mozart/run.json`). Mirrors
  // `FeatureWorkspaceProcesses.hasRunCommand` so the page-level
  // toolbar agrees with the right-aside toolbar.
  protected readonly hasRunCommand = computed(() => {
    const pid = this.project()?.id;
    if (!pid) return false;
    return !!this.projects.effectiveCommandsFor(pid)().runCommand;
  });

  protected readonly frozen = computed(() => {
    const id = this.workspaceId();
    if (!id) return false;
    return this.workspaces.isFrozen(id)();
  });

  // Linear-style status of the active workspace. Surfaces in the
  // toolbar's Status dropdown (between Commit and Open-in IDE). Null
  // means no workspace resolved yet — the toolbar hides the trigger.
  protected readonly workspaceStatus = computed<UiWorkspaceStatus | null>(
    () => this.workspace()?.status ?? null,
  );

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

    // Probe `.mozart/run.json` so the page-toolbar Run/Stop button
    // reflects script presence even when the DB column is null.
    // Idempotent on second visit (facade dedupes).
    effect(() => {
      const pid = this.project()?.id;
      if (!pid) return;
      void this.projects.ensureDetectedScripts(pid);
    });

    // Mirror the workspace's own branch into the detail store so the
    // toolbar crumb tooltip can show it. Base branch is read from the
    // workspace entity directly in the template.
    effect(() => {
      const ws = this.workspace();
      if (!ws) return;
      this.store.setCurrentBranch(ws.branch);
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
    // Mirror the toolbar's disabled-when-no-command rule at the
    // handler level too: the toolbar's Run/Stop split-button already
    // disables itself when `hasRunCommand` is false, but a stale
    // toolbar binding or a keyboard shortcut could still fire this
    // path. Guarding here keeps the backend from rejecting the call.
    if (!this.hasRunCommand()) return;
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

  protected onWorkspaceStatusChange(next: UiWorkspaceStatus): void {
    const id = this.workspaceId();
    if (!id) return;
    void this.workspaces.setStatus(id, next).catch((err) => {
      console.warn('[detail] setStatus failed:', err);
    });
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
