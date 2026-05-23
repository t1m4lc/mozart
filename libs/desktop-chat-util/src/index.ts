// Public surface of `desktop-chat-util`. Pure types + constants for
// the chat domain — no Tauri, no Angular DI, no runtime side effects.

export type { Chat, ChatMode, EffortLevel } from './lib/chat.model';
export type {
  Message,
  MessageRole,
  MessageStatus,
  SetupProgress,
  SetupProgressStatus,
  SystemInfo,
} from './lib/message.model';
export { CHAT_TAB_CAP } from './lib/chat-tab-cap';
