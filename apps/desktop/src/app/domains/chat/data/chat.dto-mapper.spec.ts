import { describe, expect, it } from 'vitest';
import { messageFromDto, systemInfoToJson } from './chat.dto-mapper';

describe('messageFromDto — system_info parsing (R0.3.F)', () => {
  it('parses a system_info entry from timeline_json', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'system',
      content: '',
      mode: null,
      status: 'done',
      timeline_json: JSON.stringify({
        kind: 'system_info',
        title: 'Project ready',
        bullets: ['Repository: mozart-go', 'Sandbox: project access (default)'],
      }),
      created_at: 1,
    });
    expect(msg.role).toBe('system');
    expect(msg.systemInfo).toEqual({
      kind: 'system_info',
      title: 'Project ready',
      bullets: ['Repository: mozart-go', 'Sandbox: project access (default)'],
    });
    expect(msg.turnState).toBeUndefined();
  });

  it('returns undefined systemInfo when payload kind is wrong', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'system',
      content: '',
      mode: null,
      status: 'done',
      timeline_json: JSON.stringify({ kind: 'other', title: 'x', bullets: [] }),
      created_at: 1,
    });
    expect(msg.systemInfo).toBeUndefined();
  });

  it('does not parse system_info for assistant messages', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'assistant',
      content: 'hi',
      mode: null,
      status: 'done',
      // An assistant row should never carry system_info; even if it did,
      // the mapper must not surface it.
      timeline_json: JSON.stringify({
        kind: 'system_info',
        title: 'x',
        bullets: [],
      }),
      created_at: 1,
    });
    expect(msg.systemInfo).toBeUndefined();
  });

  it('drops non-string bullets', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'system',
      content: '',
      mode: null,
      status: 'done',
      timeline_json: JSON.stringify({
        kind: 'system_info',
        title: 't',
        bullets: ['ok', 42, null, 'also ok'],
      }),
      created_at: 1,
    });
    expect(msg.systemInfo?.bullets).toEqual(['ok', 'also ok']);
  });

  it('survives malformed JSON', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'system',
      content: '',
      mode: null,
      status: 'done',
      timeline_json: 'not json',
      created_at: 1,
    });
    expect(msg.systemInfo).toBeUndefined();
  });

  it('systemInfoToJson round-trips through messageFromDto', () => {
    const original = {
      kind: 'system_info' as const,
      title: 'Project ready',
      bullets: ['a', 'b'],
    };
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'system',
      content: '',
      mode: null,
      status: 'done',
      timeline_json: systemInfoToJson(original),
      created_at: 1,
    });
    expect(msg.systemInfo).toEqual(original);
  });
});
