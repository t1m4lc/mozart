// Real Tauri-backed LLM adapter. Bridges the canonical Rust
// `StreamEvent` shape from `commands.startAgentRun` (over a typed
// Channel) and the lifecycle event `events.agentRunTerminated` into
// Mozart's UI-facing `AgentEvent` shape.
//
// Mapping (StreamEvent → AgentEvent):
//   stream_token { text }    → { kind: 'text', delta: text }
//   tool_call { name, args } → { kind: 'tool_call', id: <hash>, toolName, input }
//   cli_output { line }      → folded into a debug `text` (one line == one delta)
//   status_update { status } → { kind: 'status', text }
//   error { message }        → { kind: 'error', message }
// agentRunTerminated:
//   status='done'                  → { kind: 'done' }
//   status='stopped' | 'crashed'   → { kind: 'stopped' }
//   status='error'                 → { kind: 'error', message: 'agent run error' }
//
// Cancel: stop_agent_run(runId). The supervisor task on the Rust side
// will emit agentRunTerminated with status='stopped' which closes the
// iterator naturally.

import { Injectable } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';
import { commands, events } from '../../../core/_bindings';
import type { AgentEvent } from './agent-event.model';
import type { LlmAdapter, LlmRunHandle, LlmStreamInput } from './llm.adapter';

type StreamEvent =
  | { readonly kind: 'stream_token'; readonly text: string }
  | { readonly kind: 'tool_call'; readonly name: string; readonly args_json: string }
  | { readonly kind: 'cli_output'; readonly line: string }
  | { readonly kind: 'status_update'; readonly status: string }
  | { readonly kind: 'error'; readonly message: string };

// Synthetic terminator pushed into the queue when agentRunTerminated
// fires for this run. Drives the iterator to completion.
const TERMINATE: unique symbol = Symbol('terminate');

@Injectable({ providedIn: 'root' })
export class TauriLlmAdapter implements LlmAdapter {
  stream(input: LlmStreamInput): LlmRunHandle {
    const queue = new AsyncQueue<AgentEvent | typeof TERMINATE>();
    const channel = new Channel<StreamEvent>();
    let runId: string | null = null;
    let toolCallCounter = 0;
    let unlistenTerminated: (() => void) | null = null as
      | (() => void)
      | null;

    channel.onmessage = (ev) => {
      queue.push(translate(ev, () => `tool-${++toolCallCounter}`));
    };

    const lastPrompt = lastUserPrompt(input.history) ?? '';

    // Register the terminated listener BEFORE startAgentRun, so we
    // can't lose a fast terminal. We filter by run_id once it
    // resolves; events received before runId is set are kept in a
    // tiny pending buffer.
    const pending: Array<{ run_id: string; status: string }> = [];
    void events.agentRunTerminated
      .listen((e) => {
        const payload = e.payload;
        if (runId == null) {
          pending.push(payload);
          return;
        }
        if (payload.run_id !== runId) return;
        queue.push(terminalEvent(payload.status));
        queue.push(TERMINATE);
      })
      .then((unlisten) => {
        unlistenTerminated = unlisten;
      });

    const startPromise = commands
      .startAgentRun(input.workspaceId, lastPrompt, channel)
      .then((r) => {
        if (r.status === 'error') {
          throw new Error(r.error.message);
        }
        runId = r.data.run_id;
        // Drain any terminated events that arrived during startup.
        for (const p of pending) {
          if (p.run_id === runId) {
            queue.push(terminalEvent(p.status));
            queue.push(TERMINATE);
          }
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        queue.push({ kind: 'error', message });
        queue.push(TERMINATE);
      });

    return {
      runId: 'pending',
      events$: (async function* () {
        try {
          while (true) {
            const next = await queue.shift();
            if (next === TERMINATE) return;
            yield next;
          }
        } finally {
          if (unlistenTerminated) unlistenTerminated();
        }
      })(),
      cancel: () => {
        // Wait for the start to resolve so we have a runId to cancel.
        void startPromise.then(async () => {
          if (runId == null) {
            // Start never returned a run id (likely already errored).
            queue.push({ kind: 'stopped' });
            queue.push(TERMINATE);
            return;
          }
          const r = await commands.stopAgentRun(runId);
          if (r.status === 'error') {
            queue.push({ kind: 'error', message: r.error.message });
            queue.push(TERMINATE);
          }
          // Otherwise the supervisor emits agentRunTerminated and the
          // listener pushes the stopped + TERMINATE pair.
        });
      },
    };
  }
}

function translate(
  ev: StreamEvent,
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
      // can expose a power-user toggle to render these distinctly.
      return { kind: 'text', delta: ev.line + '\n' };
    case 'status_update':
      return { kind: 'status', text: ev.status };
    case 'error':
      return { kind: 'error', message: ev.message };
  }
}

function terminalEvent(status: string): AgentEvent {
  if (status === 'done') return { kind: 'done' };
  if (status === 'error')
    return { kind: 'error', message: 'agent run error' };
  // stopped | crashed | anything else
  return { kind: 'stopped' };
}

function lastUserPrompt(
  history: LlmStreamInput['history'],
): string | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m?.role === 'user') return m.content;
  }
  return undefined;
}

// Single-producer / single-consumer async queue. Resolves shift()
// promises FIFO as values arrive.
class AsyncQueue<T> {
  private readonly buffer: T[] = [];
  private readonly waiters: Array<(v: T) => void> = [];

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(value);
    else this.buffer.push(value);
  }

  shift(): Promise<T> {
    const next = this.buffer.shift();
    if (next !== undefined) return Promise.resolve(next);
    return new Promise<T>((resolve) => this.waiters.push(resolve));
  }
}
