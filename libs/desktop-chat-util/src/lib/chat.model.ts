import type { ChatMode } from '@mozart/desktop-llm-model-util';

// Effort-level discriminant for the LLM run. Defined locally so the
// chat util lib stays at `type:util` (no scope:mozart-ui dep) — the
// composer's enum mirrors this string union.
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

// One or more chats per workspace. The tab bar shows up to CHAT_TAB_CAP;
// the sidebar Chats group lists every open chat across every workspace
// grouped by created_at bucket. `title` is what both surfaces render —
// "Start" for first-of-workspace, "Untitled" for `+ New chat`.
export interface Chat {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly modelId: string | null;
  readonly mode: ChatMode;
  readonly effort: EffortLevel;
  readonly lastReadMessageId: string | null;
  readonly createdAt: number;
}

export type { ChatMode };
