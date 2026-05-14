import { InjectionToken } from '@angular/core';
import type { ChatMode } from '@mozart/ui/composer';
import type { Message } from '../../chat';
import type { AgentEvent } from './stream/event.types';

export interface LlmStreamInput {
  readonly workspaceId: string;
  readonly history: readonly Message[];
  readonly mode: ChatMode;
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
