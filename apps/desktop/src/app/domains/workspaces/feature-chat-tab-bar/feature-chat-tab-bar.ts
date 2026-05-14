import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ChatFacade } from '../../chat';
import {
  WorkspaceTabBar,
  type TabRenameEvent,
} from '../ui/workspace-tab-bar/workspace-tab-bar';
import {
  NEW_CHAT_TITLE,
  type ChatTab,
  type WorkspaceTab,
} from '../ui/workspace-tab-bar/workspace-tab.model';

/**
 * Smart wrapper around the dumb `WorkspaceTabBar`. Builds the tab list
 * from the chat facade's per-workspace chats + streaming state, and
 * routes user intent (create / activate / close / rename) back through
 * the facade.
 */
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
  readonly workspaceId = input.required<string | null>();

  private readonly facade = inject(ChatFacade);

  protected readonly tabs = computed<readonly WorkspaceTab[]>(() => {
    const ws = this.workspaceId();
    if (!ws) return [];
    const chats = this.facade.chatsByWorkspace().get(ws) ?? [];
    const streaming = this.facade.streamingChatIds();
    const messagesByChat = this.facade.messagesByChat();
    return chats.slice(0, 4).map<ChatTab>((c) => ({
      id: c.id,
      kind: 'chat',
      title: c.title || NEW_CHAT_TITLE,
      llmId: c.modelId ?? null,
      isStreaming: streaming.has(c.id),
      hasMessages: (messagesByChat.get(c.id)?.length ?? 0) > 0,
    }));
  });

  protected readonly activeTabId = computed(() => {
    const ws = this.workspaceId();
    if (!ws) return '';
    const persisted = this.facade.activeChatIdFor(ws);
    if (persisted) return persisted;
    const list = this.tabs();
    return list[0]?.id ?? '';
  });

  protected onActivate(tabId: string): void {
    const ws = this.workspaceId();
    if (!ws) return;
    void this.facade.setActiveChat(ws, tabId);
  }

  protected onClose(tabId: string): void {
    void this.facade.closeChat(tabId);
  }

  protected onRename(event: TabRenameEvent): void {
    void this.facade.renameChat(event.tabId, event.title);
  }

  protected onCreate(): void {
    const ws = this.workspaceId();
    if (!ws) return;
    void this.facade.createChat(ws, NEW_CHAT_TITLE);
  }
}
