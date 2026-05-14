// Translates the Rust-side `StreamEvent` DTO (emitted over the Tauri
// channel for `commands.startAgentRun`) into the Mozart-canonical
// `AgentEvent`. Pure functions only — no Angular, no Tauri, no DOM.
//
// SSE-style parsing of Claude's stream-json output already happens in
// Rust (`src-tauri/src/claude_cli/parser.rs`). This module operates on
// the typed Rust DTO, NOT on raw bytes — the name "parser" matches the
// spec convention; the heavy lifting is split across the wire.

import type { AgentEvent } from './event.types';

export type ClaudeStreamEvent =
  | { readonly kind: 'stream_token'; readonly text: string }
  | {
      readonly kind: 'tool_call';
      readonly name: string;
      readonly args_json: string;
    }
  | { readonly kind: 'cli_output'; readonly line: string }
  | { readonly kind: 'status_update'; readonly status: string }
  | { readonly kind: 'error'; readonly message: string };

export function translate(
  ev: ClaudeStreamEvent,
  nextToolId: () => string,
): AgentEvent {
  switch (ev.kind) {
    case 'stream_token':
      return { kind: 'text', delta: ev.text };
    case 'tool_call': {
      let parsed: unknown = undefined;
      try {
        parsed = JSON.parse(ev.args_json);
      } catch {
        parsed = ev.args_json;
      }
      return {
        kind: 'tool_call',
        id: nextToolId(),
        toolName: ev.name,
        input: parsed,
        title: ev.name,
      };
    }
    case 'cli_output':
      // v0.0.1 fold: surface CLI lines as debug text deltas. v0.1.0
      // may expose a power-user toggle to render these distinctly.
      return { kind: 'text', delta: ev.line + '\n' };
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
