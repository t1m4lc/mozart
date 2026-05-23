// Public surface of `desktop-llm-model-util`. Stream event shapes,
// reducer, Anthropic stream parser, providers config, and ChatMode.
// Pure TypeScript — no Angular DI, no Tauri side effects.

export type {
  AgentEvent,
  TurnFileChip,
  TurnItem,
  TurnItemKind,
  TurnItemState,
  TurnOutcome,
  TurnState,
} from './lib/event.types';
export { EMPTY_TURN_STATE, applyAgentEvent } from './lib/reducer';
export {
  type ClaudeStreamEvent,
  terminalEvent,
  translate,
} from './lib/anthropic.parser';
export {
  DEFAULT_MODEL_ID,
  LLM_MODEL_CATALOG,
  PROVIDERS,
  resolveModel,
  type ModelOption,
  type ProviderId,
  type ProviderInfo,
} from './lib/providers.config';
export type { ChatMode } from './lib/chat-mode';
