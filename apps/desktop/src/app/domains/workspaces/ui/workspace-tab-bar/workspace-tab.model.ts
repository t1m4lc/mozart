// Provisional tab model — local to the WorkspaceTabBar component.
// Will move to /data and a real store once tabs are persisted server-side.

export type TabKind = 'chat' | 'file';

export interface ChatTab {
  id: string;
  kind: 'chat';
  title: string;
  llmId: string | null;
  isStreaming: boolean;
  hasMessages: boolean;
}

export interface FileTab {
  id: string;
  kind: 'file';
  title: string;
  filePath: string;
}

export type WorkspaceTab = ChatTab | FileTab;

export const MAX_TABS = 4;
export const DEFAULT_CHAT_TITLE = 'Untitled';
