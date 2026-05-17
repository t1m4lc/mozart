// Phase 3b — UI-side view of the agent turn. This mirrors the
// canonical shape produced by the reducer in
// apps/desktop/src/app/domains/llm-model/data/stream/event.types.ts —
// kept as a structural copy here so libs/ui/timeline stays
// self-contained (libs/ui/* never imports from apps/desktop/*).
//
// The desktop's canonical type is structurally assignable to this
// one ; any drift is caught at the call site (AgentMessage).

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

export interface TurnState {
  readonly text: string;
  readonly summary: string;
  readonly isStreaming: boolean;
  readonly items: readonly TurnItem[];
  readonly showDoneMarker: boolean;
  readonly startedAt: number;
  readonly outcome?: TurnOutcome;
  readonly elapsedMs?: number;
}

// Emitted when the user clicks a file chip inside the timeline. The
// host (AgentMessage) decides what to do — open a diff aside, copy
// the path, etc.
export interface TurnFileChipEvent {
  readonly path: string;
}
