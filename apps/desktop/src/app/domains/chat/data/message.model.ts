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

// Subtle muted card emitted by the backend at project bootstrap time.
// One per "Start" chat; read-only — not editable, not deletable. Carried
// on `Message` only when `role === 'system'` and `kind === 'system_info'`.
export interface SystemInfo {
  readonly kind: 'system_info';
  readonly title: string;
  readonly bullets: readonly string[];
}

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
  // System only — present when this row is the bootstrap "Project ready"
  // entry. See P0.3 (R0.3.F).
  readonly systemInfo?: SystemInfo;
}
