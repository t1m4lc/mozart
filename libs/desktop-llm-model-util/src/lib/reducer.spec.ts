import errorMidStream from './__fixtures__/error-mid-stream.json';
import multiTool from './__fixtures__/multi-tool-with-thinking.json';
import textOnly from './__fixtures__/text-only.json';
import type { AgentEvent, TurnState } from './event.types';
import { EMPTY_TURN_STATE, applyAgentEvent } from './reducer';

interface Fixture {
  readonly name: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly events: readonly AgentEvent[];
}

function runFixture(fixture: Fixture): TurnState {
  let state = EMPTY_TURN_STATE(fixture.startedAt);
  const now = () => fixture.endedAt;
  for (const event of fixture.events) {
    state = applyAgentEvent(state, event, now);
  }
  return state;
}

describe('applyAgentEvent — text-only fixture', () => {
  const final = runFixture(textOnly as Fixture);

  it('accumulates streamed text in state.text', () => {
    expect(final.text).toBe('Hello, Phase 3a!');
  });

  it('keeps the last status as summary', () => {
    expect(final.summary).toBe('Thinking…');
  });

  it('flips outcome to "done" + records elapsedMs + shows the done marker', () => {
    expect(final.outcome).toBe('done');
    expect(final.isStreaming).toBe(false);
    expect(final.showDoneMarker).toBe(true);
    expect(final.elapsedMs).toBe(2500);
  });

  it('records no items when only text + status arrive', () => {
    expect(final.items).toHaveLength(0);
  });
});

describe('applyAgentEvent — multi-tool-with-thinking fixture', () => {
  const final = runFixture(multiTool as Fixture);

  it('concatenates incremental thinking deltas onto the same item', () => {
    const thinkingItem = final.items.find((i) => i.kind === 'thinking');
    expect(thinkingItem?.body).toBe(
      "Let me check the file. I'll read it first.",
    );
  });

  it('demotes prior active items as new ones arrive', () => {
    // Final state: every prior item should be 'done' (no 'active' left).
    expect(final.items.every((i) => i.state === 'done')).toBe(true);
  });

  it('maps tool names to renderer kinds', () => {
    const read = final.items.find((i) => i.id === 't-1');
    const edit = final.items.find((i) => i.id === 't-2');
    expect(read?.kind).toBe('file-read');
    expect(edit?.kind).toBe('file-edit');
  });

  it('preserves file-chip diff stats on the tool item', () => {
    const edit = final.items.find((i) => i.id === 't-2');
    expect(edit?.fileChip).toEqual({
      label: 'src/foo.ts',
      added: 5,
      removed: 2,
    });
  });

  it('records the closing text in state.text', () => {
    expect(final.text).toBe('Done updating foo.ts.');
  });

  it('terminates with outcome=done', () => {
    expect(final.outcome).toBe('done');
    expect(final.isStreaming).toBe(false);
  });
});

describe('applyAgentEvent — error-mid-stream fixture', () => {
  const final = runFixture(errorMidStream as Fixture);

  it('preserves the partial text accumulated before the error', () => {
    expect(final.text).toBe('Working on it');
  });

  it('appends a generic error item with the message body', () => {
    expect(final.items).toHaveLength(1);
    const errorItem = final.items[0];
    expect(errorItem?.state).toBe('error');
    expect(errorItem?.kind).toBe('generic');
    expect(errorItem?.body).toBe('Network refused');
    expect(errorItem?.defaultExpanded).toBe(true);
  });

  it('flips outcome to error + stops streaming + records elapsedMs', () => {
    expect(final.outcome).toBe('error');
    expect(final.isStreaming).toBe(false);
    expect(final.elapsedMs).toBe(1000);
    expect(final.showDoneMarker).toBe(false);
  });
});

describe('applyAgentEvent — summary derivation from tool kind', () => {
  it('derives summary from tool_call kind when no status_delta arrived', () => {
    let s = EMPTY_TURN_STATE(0);
    s = applyAgentEvent(s, {
      kind: 'tool_call',
      id: 't',
      toolName: 'read_file',
    });
    expect(s.summary).toBe('Reading files…');
  });

  it('derives summary from thinking events', () => {
    let s = EMPTY_TURN_STATE(0);
    s = applyAgentEvent(s, {
      kind: 'thinking',
      id: 'th',
      delta: 'considering',
    });
    expect(s.summary).toBe('Thinking…');
  });

  it('later tool_call overrides earlier explicit status (latest-activity wins)', () => {
    let s = EMPTY_TURN_STATE(0);
    s = applyAgentEvent(s, { kind: 'status', text: 'Custom phase' });
    expect(s.summary).toBe('Custom phase');
    s = applyAgentEvent(s, {
      kind: 'tool_call',
      id: 't',
      toolName: 'Bash',
    });
    expect(s.summary).toBe('Running command…');
  });

  it('maps each TurnItemKind to its own phrase', () => {
    const pairs: Array<[string, string]> = [
      ['read_file', 'Reading files…'],
      ['edit_file', 'Editing files…'],
      ['write_file', 'Creating files…'],
      ['Bash', 'Running command…'],
      ['glob', 'Searching…'],
      ['some_other_tool', 'Using tool…'],
    ];
    for (const [toolName, expected] of pairs) {
      let s = EMPTY_TURN_STATE(0);
      s = applyAgentEvent(s, { kind: 'tool_call', id: 't', toolName });
      expect(s.summary).toBe(expected);
    }
  });
});

describe('applyAgentEvent — invariants', () => {
  it('is referentially transparent for the same inputs (pure)', () => {
    const seed = EMPTY_TURN_STATE(0);
    const a = applyAgentEvent(seed, { kind: 'text', delta: 'hi' }, () => 1);
    const b = applyAgentEvent(seed, { kind: 'text', delta: 'hi' }, () => 1);
    expect(a).toEqual(b);
  });

  it('does not mutate the input state', () => {
    const seed = EMPTY_TURN_STATE(0);
    const before = JSON.stringify(seed);
    applyAgentEvent(seed, {
      kind: 'tool_call',
      id: 't',
      toolName: 'read_file',
    });
    expect(JSON.stringify(seed)).toBe(before);
  });

  it('tolerates a tool_result for an unknown id (no crash)', () => {
    const seed = EMPTY_TURN_STATE(0);
    const next = applyAgentEvent(seed, {
      kind: 'tool_result',
      id: 'unknown',
      ok: true,
    });
    expect(next).toEqual(seed);
  });

  it('stopped flips outcome=stopped without showDoneMarker', () => {
    const seed = EMPTY_TURN_STATE(0);
    const next = applyAgentEvent(seed, { kind: 'stopped' }, () => 100);
    expect(next.outcome).toBe('stopped');
    expect(next.showDoneMarker).toBe(false);
    expect(next.isStreaming).toBe(false);
    expect(next.elapsedMs).toBe(100);
  });
});
