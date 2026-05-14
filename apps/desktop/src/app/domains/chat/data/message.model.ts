import type { TurnState } from '../../llm-model';
import type { ChatMode } from './chat.model';

export type MessageRole = 'user' | 'assistant' | 'system';

// Lifecycle phases. User messages emit `done` (or `queued` if a turn
// is already in flight); assistant messages cycle through `streaming`
// → `done` / `stopped` / `error`.
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
  readonly mode?: ChatMode;
  readonly status: MessageStatus;
  readonly createdAt: number;
  // Assistant only — accumulated state of the agent's turn. Phase 3a
  // reads `.text` via <message-body>; Phase 3b will render the full
  // Claude-style timeline from `.items` + `.summary` + `.outcome`.
  readonly turnState?: TurnState;
}
