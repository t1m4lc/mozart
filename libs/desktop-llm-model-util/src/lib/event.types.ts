// Mozart-canonical stream-event model. Wire format from any provider
// (Claude CLI, Anthropic API, Codex, …) must be normalized into this
// shape by its adapter. The reducer + UI only know about AgentEvent
// and TurnState — never the raw provider wire format.

export type AgentEvent =
  | { readonly kind: 'text'; readonly delta: string }
  | { readonly kind: 'thinking'; readonly id: string; readonly delta: string }
  | {
      readonly kind: 'tool_call';
      readonly id: string;
      readonly toolName: string;
      readonly input?: unknown;
      readonly title?: string;
      readonly fileChip?: TurnFileChip;
    }
  | {
      readonly kind: 'tool_result';
      readonly id: string;
      readonly ok: boolean;
      readonly summary?: string;
    }
  | { readonly kind: 'status'; readonly text: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'usage'; readonly usage: TurnUsage }
  | { readonly kind: 'done' }
  | { readonly kind: 'stopped' };

export type TurnItemState = 'pending' | 'active' | 'done' | 'error';

export type TurnItemKind =
  | 'thinking'
  | 'file-read'
  | 'file-edit'
  | 'file-create'
  | 'shell'
  | 'search'
  | 'generic';

export interface TurnFileChip {
  readonly label: string;
  readonly added?: number;
  readonly removed?: number;
}

export interface TurnItem {
  readonly id: string;
  readonly kind: TurnItemKind;
  readonly state: TurnItemState;
  readonly title: string;
  readonly fileChip?: TurnFileChip;
  readonly body?: string;
  readonly defaultExpanded?: boolean;
}

export type TurnOutcome = 'done' | 'stopped' | 'error';

// Token usage reported by the provider during a turn. Each provider
// emission carries a subset (Claude sends input+cache early, output as it
// streams; Codex sends all at turn end), so fields accumulate latest-known.
export interface TurnUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheCreationTokens?: number;
}

// Reducer state — the accumulated representation of an agent turn.
// Phase 3a only reads `text` (rendered via <message-body>). Phase 3b
// will surface `items`, `summary`, `outcome`, and `elapsedMs` in the
// Claude-style timeline UI.
export interface TurnState {
  readonly text: string;
  readonly summary: string;
  readonly isStreaming: boolean;
  readonly items: readonly TurnItem[];
  readonly showDoneMarker: boolean;
  readonly startedAt: number;
  readonly outcome?: TurnOutcome;
  readonly elapsedMs?: number;
  readonly usage?: TurnUsage;
}
