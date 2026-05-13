// Public API of the `chat` domain. Store + adapters stay internal.

export type { Chat } from './data/chat.model';
export type {
  Message,
  MessageRole,
  MessageStatus,
} from './data/message.model';
export { ChatFacade } from './data/chat.facade';
export { FeatureChatPanel } from './feature-chat-panel/feature-chat-panel';
