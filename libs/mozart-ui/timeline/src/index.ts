// Public API of @mozart-ui/timeline.
//
// MessageBody renders the agent's streamed prose as a clean paragraph
// (used both standalone for legacy messages and inside TurnContainer's
// body slot).
//
// TurnContainer is the Phase 3b Claude-style turn UI: shimmering
// header summary + chevron + collapsible body. Later atoms add the
// vertical timeline of tool/thinking items + done/error markers.

export { MessageBody } from './lib/message-body';
export { TurnContainer } from './lib/turn-container';
export type {
  TurnFileChip,
  TurnFileChipEvent,
  TurnItem,
  TurnItemKind,
  TurnItemState,
  TurnOutcome,
  TurnState,
} from './lib/turn-state.types';
