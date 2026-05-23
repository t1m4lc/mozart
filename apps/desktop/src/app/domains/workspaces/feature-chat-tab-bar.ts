import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { Router } from '@angular/router';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import {
  FileTabsService,
  WorkspaceTabRegistry,
} from '@mozart/desktop-workspaces-data-access';
import {
  WorkspaceTabBar,
  type TabRenameEvent,
} from '@mozart/desktop-workspaces-ui';
import {
  CHAT_TAB_CAP,
  NEW_CHAT_TITLE,
  workspaceRouteCommands,
  workspaceTabRouteCommands,
  type ChatTab,
  type FileTab,
  type WorkspaceTab,
} from '@mozart/desktop-workspaces-util';

@Component({
  selector: 'app-feature-chat-tab-bar',
  imports: [WorkspaceTabBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <app-workspace-tab-bar
      [tabs]="tabs()"
      [activeTabId]="activeTabId()"
      (tabActivate)="onActivate($event)"
      (tabClose)="onClose($event)"
      (tabRename)="onRename($event)"
      (tabCreate)="onCreate()"
    />
  `,
})
export class FeatureChatTabBar {
  readonly projectId = input.required<string | null>();
  readonly workspaceId = input.required<string | null>();
  readonly activeTabId = input<string>('');

  private readonly facade = inject(ChatFacade);
  private readonly fileTabs = inject(FileTabsService);
  private readonly tabsRegistry = inject(WorkspaceTabRegistry);
  private readonly router = inject(Router);

  protected readonly tabs = computed<readonly WorkspaceTab[]>(() => {
    const ws = this.workspaceId();
    if (!ws) return [];

    const chats = this.facade.chatsByWorkspace().get(ws) ?? [];
    const streaming = this.facade.streamingChatIds();
    const messagesByChat = this.facade.messagesByChat();

    const chatTabs = chats.slice(0, CHAT_TAB_CAP).map<ChatTab>((c) => ({
      id: this.tabsRegistry.chatTabId(c.id),
      kind: 'chat',
      title: c.title || NEW_CHAT_TITLE,
      llmId: c.modelId ?? null,
      isStreaming: streaming.has(c.id),
      hasMessages: (messagesByChat.get(c.id)?.length ?? 0) > 0,
    }));

    const fileTabs = (this.fileTabs.openByWorkspace().get(ws) ?? [])
      .map((path): FileTab | null => {
        const tabId = this.tabsRegistry.fileTabId(path);
        if (!tabId) return null;
        return {
          id: tabId,
          kind: 'file',
          title: basename(path),
          filePath: path,
        };
      })
      .filter((tab): tab is FileTab => tab !== null);

    return [...chatTabs, ...fileTabs];
  });

  protected onActivate(tabId: string): void {
    void this.navigateToTab(tabId);
  }

  protected async onClose(tabId: string): Promise<void> {
    const ws = this.workspaceId();
    if (!ws) return;

    const parsed = this.tabsRegistry.parse(tabId);
    if (!parsed) return;

    const closingActive = this.activeTabId() === tabId;
    const fallback = this.fallbackTabIdAfterClose(tabId);

    if (parsed.kind === 'file') {
      if (closingActive) {
        const navigated = fallback
          ? await this.navigateToTab(fallback)
          : await this.navigateToWorkspace();
        if (!navigated) return;
      }
      this.fileTabs.closeFor(ws, parsed.path);
      return;
    }

    if (parsed.kind !== 'chat') return;

    if (!closingActive) {
      await this.facade.closeChat(parsed.chatId);
      return;
    }

    if (fallback) {
      const navigated = await this.navigateToTab(fallback);
      if (!navigated) return;
      await this.facade.closeChat(parsed.chatId);
      return;
    }

    await this.facade.closeChat(parsed.chatId);

    const nextActiveChatId = this.facade.activeChatIdFor(ws);
    if (nextActiveChatId) {
      await this.navigateToTab(this.tabsRegistry.chatTabId(nextActiveChatId));
      return;
    }

    await this.navigateToWorkspace();
  }

  protected onRename(event: TabRenameEvent): void {
    const parsed = this.tabsRegistry.parse(event.tabId);
    if (!parsed || parsed.kind !== 'chat') return;
    void this.facade.renameChat(parsed.chatId, event.title);
  }

  protected onCreate(): void {
    const ws = this.workspaceId();
    if (!ws) return;
    void this.facade.createChat(ws, NEW_CHAT_TITLE).then((chat) => {
      if (!chat) return;
      void this.navigateToTab(this.tabsRegistry.chatTabId(chat.id));
    });
  }

  private navigateToTab(tabId: string): Promise<boolean> {
    const ws = this.workspaceId();
    const project = this.projectId();
    if (!project || !ws) return Promise.resolve(false);
    return this.router.navigate(workspaceTabRouteCommands(project, ws, tabId));
  }

  private navigateToWorkspace(): Promise<boolean> {
    const ws = this.workspaceId();
    const project = this.projectId();
    if (!project || !ws) return Promise.resolve(false);
    return this.router.navigate(workspaceRouteCommands(project, ws));
  }

  private fallbackTabIdAfterClose(closingId: string): string | null {
    const list = this.tabs();
    const idx = list.findIndex((tab) => tab.id === closingId);
    if (idx === -1) return null;
    return list[idx - 1]?.id ?? list[idx + 1]?.id ?? null;
  }
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}
