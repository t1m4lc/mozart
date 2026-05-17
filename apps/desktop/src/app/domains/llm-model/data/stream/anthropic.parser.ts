// Translates the Rust-side `StreamEvent` DTO (emitted over the Tauri
// channel for `commands.startAgentRun`) into the Mozart-canonical
// `AgentEvent`. Pure functions only — no Angular, no Tauri, no DOM.
//
// Real claude CLI wire-format parsing happens in Rust
// (`src-tauri/src/claude_cli/parser.rs`). Rust unwraps the
// `{type:"stream_event",event:…}` envelope, assembles multi-line
// `tool_use` blocks into a single typed event, and extracts
// `tool_result` from echoed user messages. This module receives the
// already-normalized DTO and just maps the wire `kind` discriminant to
// our `AgentEvent` union — no field-level reshaping needed apart from
// parsing `args_json`.
//
// `cli_output` is the lossless fallback for envelope shapes we don't
// recognize (debug / metrics / future Anthropic events). It carries
// raw JSON, which is useless to render in the assistant prose, so this
// adapter drops it. The original bytes still land in `agent_events`
// for post-hoc debugging via the DB.

import type { AgentEvent } from './event.types';

export type ClaudeStreamEvent =
  | { readonly kind: 'stream_token'; readonly text: string }
  | {
      readonly kind: 'tool_call';
      readonly id: string;
      readonly name: string;
      readonly args_json: string;
    }
  | {
      readonly kind: 'tool_result';
      readonly id: string;
      readonly ok: boolean;
      readonly summary?: string | null;
    }
  | { readonly kind: 'thinking'; readonly id: string; readonly text: string }
  | { readonly kind: 'cli_output'; readonly line: string }
  | { readonly kind: 'status_update'; readonly status: string }
  | { readonly kind: 'error'; readonly message: string };

/**
 * Map a Rust-side `ClaudeStreamEvent` to an `AgentEvent` the reducer
 * understands. Returns `null` for events that have no UI representation
 * (e.g. `cli_output` debug envelopes) — the caller is expected to skip
 * them rather than push to the reducer.
 */
export function translate(ev: ClaudeStreamEvent): AgentEvent | null {
  switch (ev.kind) {
    case 'stream_token':
      return { kind: 'text', delta: ev.text };

    case 'tool_call': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(ev.args_json);
      } catch {
        parsed = ev.args_json;
      }
      return {
        kind: 'tool_call',
        id: ev.id,
        toolName: ev.name,
        input: parsed,
        title: ev.name,
      };
    }

    case 'tool_result':
      return {
        kind: 'tool_result',
        id: ev.id,
        ok: ev.ok,
        summary: ev.summary ?? undefined,
      };

    case 'thinking':
      return { kind: 'thinking', id: ev.id, delta: ev.text };

    case 'cli_output':
      // Debug / unknown-shape envelope. Dropping it keeps the assistant
      // prose clean; the raw bytes still survive in `agent_events`.
      return null;

    case 'status_update':
      return { kind: 'status', text: ev.status };

    case 'error':
      return { kind: 'error', message: ev.message };
  }
}

export function terminalEvent(status: string): AgentEvent {
  if (status === 'done') return { kind: 'done' };
  if (status === 'error') return { kind: 'error', message: 'agent run error' };
  // stopped | crashed | anything else
  return { kind: 'stopped' };
}
