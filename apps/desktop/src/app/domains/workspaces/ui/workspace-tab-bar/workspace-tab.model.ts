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

/** Maximum chat tabs per workspace. The `+ New chat` button disables
 *  at this count. File tabs do not consume this budget. */
export const CHAT_TAB_CAP = 4;

/** Maximum file tabs per workspace. v0.1.0-beta.1 ships with cap = 1 :
 *  opening a file replaces the previous file tab. Less DOM, less
 *  memory, and a clearer mental model — the workspace shows ONE
 *  diff at a time alongside the chats. Raise the cap when a future
 *  iteration warrants multi-file tabs ; FileTabsService.openFor
 *  already does FIFO eviction over the cap. */
export const FILE_TAB_CAP = 1;

/** @deprecated kept for back-compat callers; chats cap is the
 *  effective `+` button gate. Prefer CHAT_TAB_CAP. */
export const MAX_TABS = CHAT_TAB_CAP;
// First chat tab title. Carries the workspace-initialization empty-state
// (branched from, files ready, setup complete, compose first prompt).
export const DEFAULT_CHAT_TITLE = 'Start';
// Title for tabs created via the `+ New chat` affordance. No init copy
// — just a lightweight "waiting for your instructions" empty state.
export const NEW_CHAT_TITLE = 'Untitled';
