import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { HlmSkeletonImports } from '@spartan-ui/skeleton';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { FeatureChatContent } from '@mozart/desktop-chat-feature';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { FileTabsService } from '@mozart/desktop-workspaces-data-access';
import { WorkspaceTabRegistry } from '@mozart/desktop-workspaces-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import { FeatureChatTabBar } from '../feature-chat-tab-bar';
import { FeatureChatScrollSurface } from '../feature-chat-scroll-surface';
import { FeatureFileContent } from '../feature-file-content';
import { FeatureWorkspaceComposer } from '../feature-workspace-composer';
import { ChatEmptyState } from '@mozart/desktop-workspaces-ui';
import { WorkspaceDetailStore } from '@mozart/desktop-workspaces-data-access';

@Component({
  selector: 'app-workspace-tab-content',
  imports: [
    ...HlmSkeletonImports,
    FeatureChatTabBar,
    FeatureChatScrollSurface,
    FeatureChatContent,
    FeatureFileContent,
    FeatureWorkspaceComposer,
    ChatEmptyState,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `overflow-hidden` clips any child overflow at this boundary so the
  // composer's `absolute inset-x-0 bottom-0` anchor cannot drift below
  // the viewport even if a descendant tries to push past its flex
  // allocation. CodeMirror, chat-scroll-surface, and the file editor
  // each own their own internal scroll — overflow is intentional inside
  // them, never outside.
  host: { class: 'relative flex min-h-0 flex-1 flex-col overflow-hidden' },
  template: `
    <app-feature-chat-tab-bar
      [projectId]="projectId() ?? null"
      [workspaceId]="workspaceIdOrNull()"
      [activeTabId]="tabId() ?? ''"
    />

    @switch (tab()?.kind) {
      @case ('chat') {
        @if (chatTab(); as chat) {
          <app-feature-chat-scroll-surface
            class="flex flex-1 flex-col"
            [workspaceId]="workspaceIdOrNull()"
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
          </app-feature-chat-scroll-surface>
        }
      }
      @case ('file') {
        @if (filePath(); as path) {
          <app-feature-file-content
            class="min-h-0 flex-1"
            [workspaceId]="workspaceIdOrNull()"
            [filePath]="path"
          />
        }
      }
      @default {
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
    }

    <!-- Always-mounted composer host: visible on chat AND file tabs
         (P2.2). Absolutely positioned at WorkspaceTabContent's bottom
         so it overlays whatever content is in the @switch — chat
         scrolls behind it inside chat-scroll-surface, and the file
         editor extends full-height with the composer floating over
         the bottom region. -->
    @if (workspaceIdOrNull(); as ws) {
      <app-feature-workspace-composer
        class="absolute inset-x-0 bottom-0 z-30"
        [workspaceId]="ws"
        [frozen]="frozen()"
        [activeTabKind]="composerTabKind()"
      />
    }
  `,
})
export class WorkspaceTabContent {
  // Bound from route params via `withComponentInputBinding()` — Angular
  // wires `projectId`/`workspaceId` from the parent path segments and
  // `tabId` from the `tabMatcher`'s posParams. The parent
  // (`WorkspaceDetailPage`) never has to read the child route.
  readonly projectId = input<string | undefined>();
  readonly workspaceId = input<string | undefined>();
  readonly tabId = input<string | undefined>();

  protected readonly store = inject(WorkspaceDetailStore);

  private readonly tabs = inject(WorkspaceTabRegistry);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly chat = inject(ChatFacade);
  private readonly fileTabs = inject(FileTabsService);

  protected readonly workspaceIdOrNull = computed(
    () => this.workspaceId() ?? null,
  );

  protected readonly tab = computed(() => {
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

  // Narrow the parsed tab kind to the one the composer cares about
  // (chat vs file). Other kinds (review/run/terminal) collapse to
  // null — composer treats null the same as "no special tab gate".
  protected readonly composerTabKind = computed<'chat' | 'file' | null>(
    () => {
      const k = this.tab()?.kind;
      return k === 'chat' || k === 'file' ? k : null;
    },
  );

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

  constructor() {
    // URL is the source of truth for which chat/file is active. Mirror
    // the parsed tab into the chat facade and file-tabs service so the
    // rest of the UI (sidebar unread state, scroll persistence, etc.)
    // keeps working without subscribing to the router itself.
    effect(() => {
      const ws = this.workspaceId();
      const parsed = this.tab();
      if (!ws || !parsed) return;
      if (parsed.kind === 'chat') {
        this.fileTabs.setActiveFor(ws, null);
        void this.chat.setActiveChat(ws, parsed.chatId);
      } else if (parsed.kind === 'file') {
        this.fileTabs.openFor(ws, parsed.path);
      }
    });
  }
}
