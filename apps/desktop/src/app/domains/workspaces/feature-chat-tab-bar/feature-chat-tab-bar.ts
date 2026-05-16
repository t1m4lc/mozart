import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ChatFacade } from '../../chat';
import { FileTabsService } from '../data/file-tabs.service';
import {
  WorkspaceTabBar,
  type TabRenameEvent,
} from '../ui/workspace-tab-bar/workspace-tab-bar';
import {
  NEW_CHAT_TITLE,
  type ChatTab,
  type FileTab,
  type WorkspaceTab,
} from '../ui/workspace-tab-bar/workspace-tab.model';

// File-tab IDs are derived from the path with this prefix so they
// never collide with chat ids (UUIDs).
const FILE_TAB_ID_PREFIX = 'file:';

/**
 * Smart wrapper around the dumb `WorkspaceTabBar`. The strip mixes
 * chat tabs (from the chat facade) and file tabs (from the
 * FileTabsService — opened by the Files slot's Changes list). Chats
 * are renderable, file tabs are not ; activating a file tab causes
 * the workspace detail page to swap the chat panel for a diff view.
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
  private readonly fileTabs = inject(FileTabsService);

  protected readonly tabs = computed<readonly WorkspaceTab[]>(() => {
    const ws = this.workspaceId();
    if (!ws) return [];
    const chats = this.facade.chatsByWorkspace().get(ws) ?? [];
    const streaming = this.facade.streamingChatIds();
    const messagesByChat = this.facade.messagesByChat();
    const chatTabs = chats.slice(0, 4).map<ChatTab>((c) => ({
      id: c.id,
      kind: 'chat',
      title: c.title || NEW_CHAT_TITLE,
      llmId: c.modelId ?? null,
      isStreaming: streaming.has(c.id),
      hasMessages: (messagesByChat.get(c.id)?.length ?? 0) > 0,
    }));
    const fileTabs = (this.fileTabs.openByWorkspace().get(ws) ?? []).map<FileTab>(
      (path) => ({
        id: FILE_TAB_ID_PREFIX + path,
        kind: 'file',
        title: basename(path),
        filePath: path,
      }),
    );
    return [...chatTabs, ...fileTabs];
  });

  protected readonly activeTabId = computed(() => {
    const ws = this.workspaceId();
    if (!ws) return '';
    // File active wins over chat active — the workspace detail page
    // hides the chat panel whenever a file path is the active tab.
    const activeFile = this.fileTabs.activeByWorkspace().get(ws);
    if (activeFile) return FILE_TAB_ID_PREFIX + activeFile;
    const persistedChat = this.facade.activeChatIdFor(ws);
    if (persistedChat) return persistedChat;
    const list = this.tabs();
    return list[0]?.id ?? '';
  });

  protected onActivate(tabId: string): void {
    const ws = this.workspaceId();
    if (!ws) return;
    if (tabId.startsWith(FILE_TAB_ID_PREFIX)) {
      this.fileTabs.setActiveFor(ws, tabId.slice(FILE_TAB_ID_PREFIX.length));
      return;
    }
    // Activating a chat tab clears any active file so the chat panel
    // takes over the central content area.
    this.fileTabs.setActiveFor(ws, null);
    void this.facade.setActiveChat(ws, tabId);
  }

  protected onClose(tabId: string): void {
    const ws = this.workspaceId();
    if (!ws) return;
    if (tabId.startsWith(FILE_TAB_ID_PREFIX)) {
      this.fileTabs.closeFor(ws, tabId.slice(FILE_TAB_ID_PREFIX.length));
      return;
    }
    void this.facade.closeChat(tabId);
  }

  protected onRename(event: TabRenameEvent): void {
    // File tabs are not renamable — the underlying TabItem only
    // surfaces the rename affordance for chat tabs.
    if (event.tabId.startsWith(FILE_TAB_ID_PREFIX)) return;
    void this.facade.renameChat(event.tabId, event.title);
  }

  protected onCreate(): void {
    const ws = this.workspaceId();
    if (!ws) return;
    void this.facade.createChat(ws, NEW_CHAT_TITLE);
  }
}

function basename(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx >= 0 ? path.slice(idx + 1) : path;
}
