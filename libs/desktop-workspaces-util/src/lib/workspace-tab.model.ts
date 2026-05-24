// Provisional tab model — local to the WorkspaceTabBar component.
// Will move to /data and a real store once tabs are persisted server-side.

import { CHAT_TAB_CAP } from '@mozart/desktop-chat-util';
export { CHAT_TAB_CAP };

export type TabKind = 'chat' | 'file';

export interface ChatTab {
  // Opaque typed route id: `chat:<chatId>`.
  id: string;
  kind: 'chat';
  title: string;
  llmId: string | null;
  isStreaming: boolean;
  hasMessages: boolean;
}

export interface FileTab {
  // Opaque typed route id: `file:<base64urlPath>`.
  id: string;
  kind: 'file';
  title: string;
  filePath: string;
  // VS Code-style preview tab: single-click in the tree opens a
  // preview (italic title) that replaces on the next single-click.
  // Double-click in the tree, click in Changes, or the first edit
  // promotes it to a pinned tab (isPreview = false).
  isPreview: boolean;
}

export type WorkspaceTab = ChatTab | FileTab;

// First chat tab title. Carries the workspace-initialization empty-state
// (branched from, files ready, setup complete, compose first prompt).
export const DEFAULT_CHAT_TITLE = 'Start';
// Title for tabs created via the `+ New chat` affordance. No init copy
// — just a lightweight "waiting for your instructions" empty state.
export const NEW_CHAT_TITLE = 'Untitled';
