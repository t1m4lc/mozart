// Real Tauri-backed adapter. Wraps `commands.startAgentRun(workspaceId,
// prompt, channel)` and `events.agentRunTerminated`. NOT provided in
// `app.config.ts` until workspaces + projects are wired against
// SQLite (Steps 2-3 sweep) — until then the `workspaceId` we have is
// a mock that the Rust SQLite lookup would 404 on.
//
// Code path when activated :
//   1. Build a Tauri `Channel<StreamEvent>` and a sink that pushes
//      into an internal queue.
//   2. Invoke `commands.startAgentRun(...)` ; capture the returned
//      `run_id`.
//   3. Listen to `events.agentRunTerminated` filtered by run_id to
//      know when the channel stream is safe to close.
//   4. Map each Tauri `StreamEvent` → `AgentEvent` :
//        - stream_token { text }        → { kind: 'text', delta: text }
//        - tool_call    { name, args }  → { kind: 'tool_call', ... }
//        - cli_output   { line }        → folded into a debug `text` (v0.1.0
//                                           opens a power-user toggle)
//        - status_update{ status }      → { kind: 'status', text }
//        - error        { message }     → { kind: 'error', message }
//      AgentRunTerminated (status='done') → { kind: 'done' }
//      AgentRunTerminated (status='stopped'|'crashed') → { kind: 'stopped' }

import { Injectable } from '@angular/core';
import type { LlmAdapter, LlmRunHandle, LlmStreamInput } from './llm.adapter';

@Injectable({ providedIn: 'root' })
export class TauriLlmAdapter implements LlmAdapter {
  stream(input: LlmStreamInput): LlmRunHandle {
    throw new Error(
      `TauriLlmAdapter is not wired in v0.0.1 — provide FakeLlmAdapter in app.config.ts (asked for workspace ${input.workspaceId}).`,
    );
  }
}
