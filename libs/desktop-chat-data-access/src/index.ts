// WorkspaceChatPort lets ChatFacade observe / mutate workspace state
// without dragging in the workspaces lib.

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
export { AgentProviderPort } from './lib/agent-provider.port';
export {
  DEBUG_ENVELOPE_PORT,
  debugEnvelopeFromDto,
  type AgentRunEnvelopeDto,
  type DebugEnvelopePort,
  type DebugRunEnvelope,
  type DebugEnvelopeLayers,
} from './lib/debug-envelope.port';
export {
  chatFromDto,
  messageFromDto,
  setupProgressToJson,
  systemInfoToJson,
  turnStateToJson,
  type ChatDto,
  type MessageDto,
} from './lib/chat.dto-mapper';
