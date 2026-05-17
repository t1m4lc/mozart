// Real Tauri-backed Claude adapter. Bridges the canonical Rust
// `StreamEvent` shape from `commands.startAgentRun` (over a typed
// Channel) and the lifecycle event `events.agentRunTerminated` into
// Mozart's UI-facing `AgentEvent` shape.
//
// Mapping + terminal coercion live in `./stream/anthropic.parser.ts`
// as pure functions. This file owns the Tauri IO concern only —
// channel setup, listener registration, the cancellation pathway,
// and the async iterator the chat facade consumes.
//
// Cancel: stop_agent_run(runId). The supervisor task on the Rust side
// will emit agentRunTerminated with status='stopped' which closes the
// iterator naturally.

import { Injectable } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';
import { commands, events } from '../../../core/_bindings';
import type { LlmAdapter, LlmRunHandle, LlmStreamInput } from './llm.adapter';
import {
  type ClaudeStreamEvent,
  terminalEvent,
  translate,
} from './stream/anthropic.parser';
import type { AgentEvent } from './stream/event.types';

// Synthetic terminator pushed into the queue when agentRunTerminated
// fires for this run. Drives the iterator to completion.
const TERMINATE: unique symbol = Symbol('terminate');

@Injectable({ providedIn: 'root' })
export class TauriClaudeAdapter implements LlmAdapter {
  stream(input: LlmStreamInput): LlmRunHandle {
    const queue = new AsyncQueue<AgentEvent | typeof TERMINATE>();
    const channel = new Channel<ClaudeStreamEvent>();
    let runId: string | null = null;
    let unlistenTerminated: (() => void) | null = null as
      | (() => void)
      | null;

    channel.onmessage = (ev) => {
      const mapped = translate(ev);
      if (mapped !== null) queue.push(mapped);
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
