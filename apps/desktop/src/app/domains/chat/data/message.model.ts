export type MessageRole = 'user' | 'assistant';

// Lifecycle phases. Step 4 only emits `done` user messages. Step 5
// adds `pending` / `streaming` for assistant messages and `error` for
// agent failures.
export type MessageStatus = 'pending' | 'streaming' | 'done' | 'error';

export interface Message {
  readonly id: string;
  readonly chatId: string;
  readonly role: MessageRole;
  readonly content: string;
  readonly mode?: 'normal' | 'plan';
  readonly status: MessageStatus;
  readonly createdAt: number;
}
