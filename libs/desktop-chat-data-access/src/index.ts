// Public surface of `desktop-chat-data-access`. Facade, store, Tauri
// ports + DTO mapper for the chat domain. Tauri-bound concrete adapter
// lives in `apps/desktop/src/app/core/`. WorkspaceChatPort lets ChatFacade
// observe / mutate workspace state without dragging in the workspaces lib.

export { ChatFacade } from './lib/chat.facade';
export { ChatStore } from './lib/chat.store';
export {
  CHATS_ADAPTER,
  MESSAGES_ADAPTER,
  type ChatsAdapter,
  type MessagesAdapter,
} from './lib/chats.adapter';
export {
  WorkspaceChatPort,
  type WorkspaceChatSummary,
} from './lib/workspace-chat.port';
export {
  chatFromDto,
  messageFromDto,
  setupProgressToJson,
  systemInfoToJson,
  turnStateToJson,
  type ChatDto,
  type MessageDto,
} from './lib/chat.dto-mapper';
