import { terminalEvent, translate, type ClaudeStreamEvent } from './anthropic.parser';

let toolCounter = 0;
const nextToolId = () => `tool-${++toolCounter}`;

beforeEach(() => {
  toolCounter = 0;
});

describe('translate — Rust StreamEvent → AgentEvent', () => {
  it('maps stream_token to text delta', () => {
    const ev: ClaudeStreamEvent = { kind: 'stream_token', text: 'hello' };
    expect(translate(ev, nextToolId)).toEqual({ kind: 'text', delta: 'hello' });
  });

  it('maps tool_call with valid JSON args', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'tool_call',
      name: 'read_file',
      args_json: '{"path":"src/foo.ts"}',
    };
    expect(translate(ev, nextToolId)).toEqual({
      kind: 'tool_call',
      id: 'tool-1',
      toolName: 'read_file',
      input: { path: 'src/foo.ts' },
      title: 'read_file',
    });
  });

  it('maps tool_call with invalid JSON args by passing the raw string', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'tool_call',
      name: 'shell',
      args_json: 'not-json{',
    };
    const out = translate(ev, nextToolId);
    expect(out.kind).toBe('tool_call');
    if (out.kind === 'tool_call') {
      expect(out.input).toBe('not-json{');
    }
  });

  it('maps cli_output to a text delta with a trailing newline', () => {
    const ev: ClaudeStreamEvent = { kind: 'cli_output', line: 'log line' };
    expect(translate(ev, nextToolId)).toEqual({
      kind: 'text',
      delta: 'log line\n',
    });
  });

  it('maps status_update to status', () => {
    const ev: ClaudeStreamEvent = {
      kind: 'status_update',
      status: 'Thinking…',
    };
    expect(translate(ev, nextToolId)).toEqual({
      kind: 'status',
      text: 'Thinking…',
    });
  });

  it('maps error to error', () => {
    const ev: ClaudeStreamEvent = { kind: 'error', message: 'boom' };
    expect(translate(ev, nextToolId)).toEqual({
      kind: 'error',
      message: 'boom',
    });
  });

  it('emits unique tool ids on successive tool_call events', () => {
    const a = translate(
      { kind: 'tool_call', name: 'a', args_json: '{}' },
      nextToolId,
    );
    const b = translate(
      { kind: 'tool_call', name: 'b', args_json: '{}' },
      nextToolId,
    );
    expect(a.kind === 'tool_call' && b.kind === 'tool_call' && a.id !== b.id).toBe(
      true,
    );
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
