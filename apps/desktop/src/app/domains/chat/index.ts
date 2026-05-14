// Public API of the `chat` domain. Store + adapters stay internal.

export type { Chat, ChatMode, EffortLevel } from './data/chat.model';
export type {
  Message,
  MessageRole,
  MessageStatus,
} from './data/message.model';
export { ChatFacade } from './data/chat.facade';
export {
  CHATS_ADAPTER,
  MESSAGES_ADAPTER,
  type ChatsAdapter,
  type MessagesAdapter,
} from './data/chats.adapter';
export { chatFromDto, messageFromDto, turnStateToJson } from './data/chat.dto-mapper';
export { FeatureChatPanel } from './feature-chat-panel/feature-chat-panel';
export { FeatureChatList } from './feature-chat-list/feature-chat-list';
