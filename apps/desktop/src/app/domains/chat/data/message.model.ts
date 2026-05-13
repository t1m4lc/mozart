import type { TimelineTurn } from '@mozart/ui/timeline';

export type MessageRole = 'user' | 'assistant' | 'system';

// Lifecycle phases. Step 4 emits `done` user messages ; Step 5
// adds `streaming` / `stopped` for assistant messages and `error`
// for agent failures.
export type MessageStatus =
  | 'pending'
  | 'queued'
  | 'streaming'
  | 'done'
  | 'error'
  | 'stopped';

export interface Message {
  readonly id: string;
  readonly chatId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly mode?: 'normal' | 'plan';
  readonly status: MessageStatus;
  readonly createdAt: number;
  // Assistant only — structured turn rendered via <hlm-timeline>.
  readonly timeline?: TimelineTurn;
}
