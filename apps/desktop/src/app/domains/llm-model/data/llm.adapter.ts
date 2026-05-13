import { InjectionToken } from '@angular/core';
import type { Message } from '../../chat';
import type { AgentEvent } from './agent-event.model';

export interface LlmStreamInput {
  readonly workspaceId: string;
  readonly history: readonly Message[];
  readonly mode: 'normal' | 'plan';
}

export interface LlmRunHandle {
  readonly runId: string;
  readonly events$: AsyncIterable<AgentEvent>;
  cancel(): void;
}

// Adapter contract for any LLM provider. Implementations live in
// `llm-model/data/*.adapter.ts` ; the concrete one is wired in
// `app.config.ts` against `LLM_ADAPTER`.
export interface LlmAdapter {
  stream(input: LlmStreamInput): LlmRunHandle;
}

export const LLM_ADAPTER = new InjectionToken<LlmAdapter>('LLM_ADAPTER');
