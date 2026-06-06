import {
  terminalEvent,
  translate,
  type ClaudeStreamEvent,
} from './anthropic.parser';

describe('translate — Rust StreamEvent → AgentEvent', () => {
  it('maps stream_token to text delta', () => {
    const ev: ClaudeStreamEvent = { kind: 'stream_token', text: 'hello' };
    expect(translate(ev)).toEqual({ kind: 'text', delta: 'hello' });
  });

  it('maps tool_call with valid JSON args and passes through the toolu_ id', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'tool_call',
      id: 'toolu_abc',
      name: 'read_file',
      args_json: '{"path":"src/foo.ts"}',
    };
    expect(translate(ev)).toEqual({
      kind: 'tool_call',
      id: 'toolu_abc',
      toolName: 'read_file',
      input: { path: 'src/foo.ts' },
      title: 'read_file',
    });
  });

  it('maps tool_call with invalid JSON args by passing the raw string', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'tool_call',
      id: 'toolu_x',
      name: 'shell',
      args_json: 'not-json{',
    };
    const out = translate(ev);
    expect(out?.kind).toBe('tool_call');
    if (out?.kind === 'tool_call') {
      expect(out.input).toBe('not-json{');
    }
  });

  it('maps tool_result with summary', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'tool_result',
      id: 'toolu_abc',
      ok: true,
      summary: 'file1\nfile2',
    };
    expect(translate(ev)).toEqual({
      kind: 'tool_result',
      id: 'toolu_abc',
      ok: true,
      summary: 'file1\nfile2',
    });
  });

  it('maps tool_result with no summary to undefined', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'tool_result',
      id: 'toolu_x',
      ok: false,
    };
    expect(translate(ev)).toEqual({
      kind: 'tool_result',
      id: 'toolu_x',
      ok: false,
      summary: undefined,
    });
  });

  it('maps thinking to a thinking delta', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'thinking',
      id: 'thinking-0',
      text: 'Let me think',
    };
    expect(translate(ev)).toEqual({
      kind: 'thinking',
      id: 'thinking-0',
      delta: 'Let me think',
    });
  });

  it('drops cli_output entirely (returns null)', () => {
    const ev: ClaudeStreamEvent = { kind: 'cli_output', line: '{"debug":1}' };
    expect(translate(ev)).toBeNull();
  });

  it('maps status_update to status', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'status_update',
      status: 'Thinking…',
    };
    expect(translate(ev)).toEqual({ kind: 'status', text: 'Thinking…' });
  });

  it('maps usage, coercing null token fields to undefined', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'usage',
      input_tokens: 1200,
      output_tokens: null,
      cache_read_tokens: 800,
      cache_creation_tokens: null,
    };
    expect(translate(ev)).toEqual({
      kind: 'usage',
      usage: {
        inputTokens: 1200,
        outputTokens: undefined,
        cacheReadTokens: 800,
        cacheCreationTokens: undefined,
      },
    });
  });

  it('maps error to error', () => {
    const ev: ClaudeStreamEvent = { kind: 'error', message: 'boom' };
    expect(translate(ev)).toEqual({ kind: 'error', message: 'boom' });
  });
});

describe('terminalEvent — supervisor status → AgentEvent', () => {
  it('done → { kind: "done" }', () => {
    expect(terminalEvent('done')).toEqual({ kind: 'done' });
  });

  it('error → error with generic message', () => {
    expect(terminalEvent('error')).toEqual({
      kind: 'error',
      message: 'agent run error',
    });
  });

  it('stopped → { kind: "stopped" }', () => {
    expect(terminalEvent('stopped')).toEqual({ kind: 'stopped' });
  });

  it('crashed → { kind: "stopped" } (folded into the stop bucket)', () => {
    expect(terminalEvent('crashed')).toEqual({ kind: 'stopped' });
  });

  it('unknown status → { kind: "stopped" } (defensive)', () => {
    expect(terminalEvent('something-else')).toEqual({ kind: 'stopped' });
  });
});
