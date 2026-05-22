import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { HlmSkeletonImports } from '@mozart/ui/skeleton';
import { ChatFacade, FeatureChatContent } from '../../chat';
import { ProjectsFacade } from '../../projects';
import { WorkspaceTabRegistry } from '../data/workspace-tab-registry';
import { WorkspacesFacade } from '../data/workspace.facade';
import { FeatureFileContent } from '../feature-file-content';
import { FeatureWorkspaceMiddle } from '../feature-workspace-middle';
import { ChatEmptyState } from '../ui/chat-empty-state';
import { WorkspaceDetailStore } from './workspace-detail.store';

@Component({
  selector: 'app-workspace-tab-content',
  imports: [
    ...HlmSkeletonImports,
    FeatureWorkspaceMiddle,
    FeatureChatContent,
    FeatureFileContent,
    ChatEmptyState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    @if (chatTab(); as chat) {
      <app-feature-workspace-middle
        class="flex flex-1 flex-col"
        [workspaceId]="workspaceIdOrNull()"
        [frozen]="frozen()"
      >
        <app-feature-chat-content [workspaceId]="workspaceIdOrNull()">
          <app-chat-empty-state
            [variant]="activeTabIsFirst() ? 'start' : 'untitled'"
            [projectName]="projectName()"
            [workspaceName]="workspaceName()"
            [sourceBranch]="store.currentBranch()"
            [targetBranch]="store.targetBranch() || 'main'"
            [numberOfFiles]="0"
            [installState]="install().state"
            [installManager]="install().manager"
          />
        </app-feature-chat-content>
      </app-feature-workspace-middle>
    } @else if (filePath(); as path) {
      <app-feature-file-content
        class="min-h-0 flex-1"
        [workspaceId]="workspaceIdOrNull()"
        [filePath]="path"
      />
    } @else {
      <div
        class="flex flex-1 flex-col gap-3 p-4"
        role="status"
        aria-busy="true"
        aria-label="Loading tab"
      >
        <hlm-skeleton class="h-6 w-1/3" />
        <hlm-skeleton class="h-32 w-full" />
        <hlm-skeleton class="h-4 w-2/3" />
      </div>
    }
  `,
})
export class WorkspaceTabContent {
  readonly workspaceId = input<string | undefined>();
  readonly tabId = input<string | undefined>();

  protected readonly store = inject(WorkspaceDetailStore);

  private readonly tabs = inject(WorkspaceTabRegistry);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly chat = inject(ChatFacade);

  protected readonly workspaceIdOrNull = computed(
    () => this.workspaceId() ?? null,
  );

  private readonly tab = computed(() => {
    const raw = this.tabId();
    return raw ? this.tabs.parse(raw) : null;
  });

  protected readonly chatTab = computed(() => {
    const t = this.tab();
    return t?.kind === 'chat' ? t : null;
  });

  protected readonly filePath = computed(() => {
    const t = this.tab();
    return t?.kind === 'file' ? t.path : null;
  });

  private readonly workspace = computed(() => {
    const id = this.workspaceId();
    return id ? this.workspaces.workspaceById(id)() : null;
  });

  private readonly project = computed(() => {
    const ws = this.workspace();
    return ws ? this.projects.byId(ws.projectId)() : null;
  });

  protected readonly projectName = computed(() => this.project()?.name ?? '');
  protected readonly workspaceName = computed(
    () => this.workspace()?.name ?? '',
  );

  protected readonly install = computed(() => {
    const id = this.workspaceId();
    return id
      ? this.workspaces.installFor(id)
      : { state: 'idle' as const, manager: '' };
  });

  protected readonly frozen = computed(() => {
    const id = this.workspaceId();
    return id ? this.workspaces.isFrozen(id)() : false;
  });

  protected readonly activeTabIsFirst = computed(() => {
    const ws = this.workspaceId();
    const chatId = this.chatTab()?.chatId;
    if (!ws || !chatId) return true;
    const chats = this.chat.chatsByWorkspace().get(ws) ?? [];
    if (chats.length === 0) return true;
    return chats[0].id === chatId;
  });
}
