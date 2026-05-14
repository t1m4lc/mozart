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
// First chat tab title. Carries the workspace-initialization empty-state
// (branched from, files ready, setup complete, compose first prompt).
export const DEFAULT_CHAT_TITLE = 'Start';
// Title for tabs created via the `+ New chat` affordance. No init copy
// — just a lightweight "waiting for your instructions" empty state.
export const NEW_CHAT_TITLE = 'Untitled';
