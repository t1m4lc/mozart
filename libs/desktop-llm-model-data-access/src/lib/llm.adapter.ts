import { InjectionToken } from '@angular/core';
import type {
  AgentEvent,
  AgentProviderId,
  ChatMode,
} from '@mozart/desktop-llm-model-util';

export interface LlmStreamInput {
  readonly workspaceId: string;
  readonly chatId: string;
  readonly currentUserMessageId: string;
  readonly mode: ChatMode;
  /** Which agent backend runs this turn (resolved from the connected
   *  provider). Passed through to the Tauri `start_agent_run` command. */
  readonly provider: AgentProviderId;
  /** CLI model name to run (`claude --model` / `codex -m`), or null to let
   *  the CLI use its configured default. Already resolved/validated upstream
   *  (matches the run provider). */
  readonly model: string | null;
}

export interface LlmRunHandle {
  readonly runId: string;
  /** Resolves with the backend run id once `start_agent_run` returns, or
   *  `null` if the run failed to start. The id is unknown synchronously, so
   *  callers that need it (e.g. to link a message to its run) await this. */
  readonly whenRunId: Promise<string | null>;
  readonly events$: AsyncIterable<AgentEvent>;
  cancel(): void;
}

// Adapter contract for any LLM provider. The Tauri-backed concrete
// impl lives in apps/desktop/src/app/core/tauri-claude.adapter.ts —
// the only file that may import `core/_bindings` for this port.
// `app.config.ts` wires the impl against `LLM_ADAPTER`. A
// type-contract test (`tauri-claude.adapter.spec.ts`) sits next to
// this file to guard the LlmStreamInput shape against regressions.
export interface LlmAdapter {
  stream(input: LlmStreamInput): LlmRunHandle;
}

export const LLM_ADAPTER = new InjectionToken<LlmAdapter>('LLM_ADAPTER');
