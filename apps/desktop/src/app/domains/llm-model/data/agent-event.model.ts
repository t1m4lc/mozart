import type { TimelineFileChip } from '@mozart/ui/timeline';

// Mozart-canonical agent event. Wire format from any provider
// (Claude CLI, Anthropic API, Codex, …) must be normalized into this
// shape by its adapter — HlmTimeline + the stream parser only know
// about AgentEvent.
export type AgentEvent =
  | { readonly kind: 'text'; readonly delta: string }
  | { readonly kind: 'thinking'; readonly id: string; readonly delta: string }
  | {
      readonly kind: 'tool_call';
      readonly id: string;
      readonly toolName: string;
      readonly input?: unknown;
      readonly title?: string;
      readonly fileChip?: TimelineFileChip;
    }
  | {
      readonly kind: 'tool_result';
      readonly id: string;
      readonly ok: boolean;
      readonly summary?: string;
    }
  | { readonly kind: 'status'; readonly text: string }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'done' }
  | { readonly kind: 'stopped' };
