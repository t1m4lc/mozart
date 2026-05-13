import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import {
  HlmComposer,
  type ComposerMode,
  type ComposerSendEvent,
} from '@mozart/ui/composer';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePanelLeft } from '@ng-icons/lucide';
import { LayoutService } from '../../../core/layout.service';
import { OsService } from '../../../core/os.service';
import { MacWindowControls } from '../../../core/window-controls/mac-window-controls';
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
    HlmComposer,
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
      [leadingSlot]="layout.leftPanelOpen() ? null : sidebarHeader()"
      (targetBranchChange)="store.setTargetBranch($event)"
      (openIn)="store.openIn($event)"
      (toggleRightPanel)="layout.toggleRightPanel()"
      (workspaceTitleChange)="onRename($event)"
    />

    <app-workspace-tab-bar />

    <div class="flex-1 min-h-0 overflow-auto">
      <app-chat-empty-state
        [projectName]="store.projectName()"
        [workspaceName]="store.workspaceTitle()"
        [sourceBranch]="store.workspaceTitle()"
        [targetBranch]="store.targetBranch()"
        [numberOfFiles]="0"
      />
    </div>

    <div class="px-4 pb-4 pt-2">
      <hlm-composer
        [(value)]="composerValue"
        [(mode)]="composerMode"
        (send)="onComposerSend($event)"
        (stop)="onComposerStop()"
      />
    </div>

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
  // Route param — Angular's `withComponentInputBinding()` would normally
  // hand us the `id` here. The current router setup binds via `input()`.
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

  protected readonly sidebarHeader =
    viewChild.required<TemplateRef<unknown>>('sidebarHeaderTpl');

  // Composer-preview state. Step 4 (Persistent chat) will move this to
  // the chat facade ; for now we surface the new HlmComposer in the
  // workspace view and log emissions so the visual stack matches the
  // intended product layout.
  protected readonly composerValue = signal('');
  protected readonly composerMode = signal<ComposerMode>('normal');

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) {
        this.store.loadWorkspace(id);
        this.workspaces.setActive(id);
      }
    });
  }

  protected onRename(name: string): void {
    const id = this.id();
    if (id) this.workspaces.rename(id, name);
  }

  protected onComposerSend(event: ComposerSendEvent): void {
    // eslint-disable-next-line no-console
    console.info('[workspace-detail] composer send', event);
    this.composerValue.set('');
  }

  protected onComposerStop(): void {
    // eslint-disable-next-line no-console
    console.info('[workspace-detail] composer stop');
  }
}
