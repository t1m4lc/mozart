// IRON RULE regression contract (ContextCompiler v1 architecture).
//
// Before the fix, the adapter collapsed `input.history` into a single
// prompt via `lastUserPrompt(...)` and shipped only that to the Rust
// IPC — that was the agent-amnesia bug. The fix removed `history` from
// `LlmStreamInput` and added `chatId` + `currentUserMessageId` so the
// Rust ContextCompiler can reconstruct the full 7-layer envelope from
// SQLite.
//
// These checks are enforced at typecheck time via `@ts-expect-error`.
// A regression that re-adds `history` (or removes the new IDs) will
// flip the directives and fail TS compilation, which surfaces in the
// test build before vitest even runs.

import type { LlmStreamInput } from './llm.adapter';

describe('LlmStreamInput shape — agent context contract', () => {
  it('requires chatId and currentUserMessageId; rejects history', () => {
    const ok: LlmStreamInput = {
      workspaceId: 'ws',
      chatId: 'chat',
      currentUserMessageId: 'msg',
      mode: 'agent',
      provider: 'claude_cli',
      model: null,
    };
    expect(ok.chatId).toBe('chat');
    expect(ok.currentUserMessageId).toBe('msg');

    const withHistory: LlmStreamInput = {
      workspaceId: 'ws',
      chatId: 'chat',
      currentUserMessageId: 'msg',
      mode: 'agent',
      provider: 'claude_cli',
      model: null,
      // @ts-expect-error history must not be part of the input — the
      // Rust ContextCompiler reconstructs it from SQLite.
      history: [],
    };
    expect(withHistory).toBeDefined();
  });
});
