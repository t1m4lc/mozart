import { InjectionToken } from '@angular/core';
import type {
  AgentEvent,
  ChatMode,
} from '@mozart/desktop-llm-model-util';

export interface LlmStreamInput {
  readonly workspaceId: string;
  readonly chatId: string;
  readonly currentUserMessageId: string;
  readonly mode: ChatMode;
}

export interface LlmRunHandle {
  readonly runId: string;
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
