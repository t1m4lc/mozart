import type { Signal } from '@angular/core';

// Minimal workspace surface that the chat domain needs to observe and
// mutate. Lets the chat lib stay independent from the workspaces
// domain — the desktop app binds `WorkspacesFacade` to this token via
// `useExisting` in app.config.

export interface WorkspaceChatSummary {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly unread: boolean;
}

export abstract class WorkspaceChatPort {
  abstract readonly activeId: Signal<string | null>;
  abstract workspaceById(id: string): Signal<WorkspaceChatSummary | null>;
  abstract markRead(workspaceId: string): Promise<void>;
  abstract toggleUnread(workspaceId: string): Promise<void>;
}
