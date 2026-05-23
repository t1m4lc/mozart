import { Injectable } from '@angular/core';
import type { AgentEvent } from '@mozart/desktop-llm-model-util';
import type { LlmAdapter, LlmRunHandle, LlmStreamInput } from './llm.adapter';

interface ScriptStep {
  readonly delay: number;
  readonly event: AgentEvent;
}

const NORMAL_SCRIPT: readonly ScriptStep[] = [
  { delay: 0, event: { kind: 'status', text: 'Thinking…' } },
  {
    delay: 250,
    event: { kind: 'thinking', id: 'th-1', delta: 'Analyzing the request…' },
  },
  {
    delay: 400,
    event: {
      kind: 'thinking',
      id: 'th-1',
      delta: ' I need to look at the existing code.',
    },
  },
  { delay: 350, event: { kind: 'status', text: 'Reading files' } },
  {
    delay: 400,
    event: {
      kind: 'tool_call',
      id: 't1',
      toolName: 'read_file',
      title: 'Read source file',
      fileChip: { label: 'apps/desktop/src/app/foo.ts' },
    },
  },
  { delay: 600, event: { kind: 'tool_result', id: 't1', ok: true } },
  { delay: 400, event: { kind: 'status', text: 'Editing files' } },
  {
    delay: 400,
    event: {
      kind: 'tool_call',
      id: 't2',
      toolName: 'edit_file',
      title: 'Edit source file',
      fileChip: {
        label: 'apps/desktop/src/app/foo.ts',
        added: 5,
        removed: 2,
      },
    },
  },
  { delay: 700, event: { kind: 'tool_result', id: 't2', ok: true } },
  { delay: 400, event: { kind: 'status', text: 'Wrapping up' } },
  { delay: 200, event: { kind: 'text', delta: 'I added ' } },
  { delay: 100, event: { kind: 'text', delta: 'a new feature ' } },
  { delay: 100, event: { kind: 'text', delta: 'in foo.ts. ' } },
  { delay: 200, event: { kind: 'text', delta: 'It should work now.' } },
  { delay: 250, event: { kind: 'done' } },
];

const PLAN_SCRIPT: readonly ScriptStep[] = [
  { delay: 0, event: { kind: 'status', text: 'Planning…' } },
  {
    delay: 300,
    event: { kind: 'thinking', id: 'th-1', delta: 'Let me plan this carefully.' },
  },
  {
    delay: 400,
    event: {
      kind: 'thinking',
      id: 'th-1',
      delta: ' I want to read foo.ts first to understand the surface.',
    },
  },
  { delay: 350, event: { kind: 'status', text: 'Drafting plan' } },
  {
    delay: 400,
    event: {
      kind: 'tool_call',
      id: 't1',
      toolName: 'read_file',
      title: 'Inspect target file',
      fileChip: { label: 'apps/desktop/src/app/foo.ts' },
    },
  },
  { delay: 600, event: { kind: 'tool_result', id: 't1', ok: true } },
  { delay: 350, event: { kind: 'text', delta: 'Here is the plan:\n' } },
  {
    delay: 200,
    event: { kind: 'text', delta: '1. Read foo.ts (done)\n' },
  },
  {
    delay: 200,
    event: { kind: 'text', delta: '2. Identify the function to modify\n' },
  },
  {
    delay: 200,
    event: {
      kind: 'text',
      delta: '3. Add the new logic with tests',
    },
  },
  { delay: 250, event: { kind: 'done' } },
];

@Injectable({ providedIn: 'root' })
export class FakeLlmAdapter implements LlmAdapter {
  stream(input: LlmStreamInput): LlmRunHandle {
    const runId = crypto.randomUUID();
    let aborted = false;
    const script = input.mode === 'plan' ? PLAN_SCRIPT : NORMAL_SCRIPT;

    const events$ = (async function* () {
      for (const step of script) {
        await new Promise((resolve) => setTimeout(resolve, step.delay));
        if (aborted) {
          yield { kind: 'stopped' } as AgentEvent;
          return;
        }
        yield step.event;
      }
    })();

    return {
      runId,
      events$,
      cancel: () => {
        aborted = true;
      },
    };
  }
}
