import { describe, expect, it } from 'vitest';
import { messageFromDto, systemInfoToJson } from './chat.dto-mapper';

describe('messageFromDto — runId linkage', () => {
  it('maps an assistant run_id onto Message.runId', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: 'run-abc',
      role: 'assistant',
      content: 'hi',
      mode: null,
      status: 'done',
      timeline_json: null,
      created_at: 1,
    });
    expect(msg.runId).toBe('run-abc');
  });

  it('leaves runId undefined when run_id is null', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'assistant',
      content: 'hi',
      mode: null,
      status: 'done',
      timeline_json: null,
      created_at: 1,
    });
    expect(msg.runId).toBeUndefined();
  });
});

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
        lines: [
          'Branched mozart/bjork from main in mozart-go.',
          'You can start to chat.',
        ],
      }),
      created_at: 1,
    });
    expect(msg.role).toBe('system');
    expect(msg.systemInfo).toEqual({
      kind: 'system_info',
      lines: [
        'Branched mozart/bjork from main in mozart-go.',
        'You can start to chat.',
      ],
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
      timeline_json: JSON.stringify({ kind: 'other', lines: [] }),
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
      timeline_json: JSON.stringify({ kind: 'system_info', lines: [] }),
      created_at: 1,
    });
    expect(msg.systemInfo).toBeUndefined();
  });

  it('drops non-string lines', () => {
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
        lines: ['ok', 42, null, 'also ok'],
      }),
      created_at: 1,
    });
    expect(msg.systemInfo?.lines).toEqual(['ok', 'also ok']);
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
      lines: ['Branched mozart/bjork from main in mozart-go.', 'tagline'],
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

describe('messageFromDto — setup_progress parsing (R0.3.E)', () => {
  it('parses running state with manager + command', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'system',
      content: '',
      mode: null,
      status: 'done',
      timeline_json: JSON.stringify({
        kind: 'setup_progress',
        status: 'running',
        command: 'pnpm install',
        manager: 'pnpm',
      }),
      created_at: 1,
    });
    expect(msg.setupProgress).toEqual({
      kind: 'setup_progress',
      status: 'running',
      command: 'pnpm install',
      manager: 'pnpm',
      errorMessage: undefined,
    });
    expect(msg.systemInfo).toBeUndefined();
  });

  it('coerces unknown status to running', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'system',
      content: '',
      mode: null,
      status: 'done',
      timeline_json: JSON.stringify({
        kind: 'setup_progress',
        status: 'wat',
        command: 'pnpm install',
      }),
      created_at: 1,
    });
    expect(msg.setupProgress?.status).toBe('running');
  });

  it('passes errorMessage through on failed status', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'system',
      content: '',
      mode: null,
      status: 'done',
      timeline_json: JSON.stringify({
        kind: 'setup_progress',
        status: 'failed',
        command: 'pnpm install',
        manager: 'pnpm',
        errorMessage: 'ENOSPC',
      }),
      created_at: 1,
    });
    expect(msg.setupProgress?.status).toBe('failed');
    expect(msg.setupProgress?.errorMessage).toBe('ENOSPC');
  });

  it('drops empty manager string', () => {
    const msg = messageFromDto({
      message_id: 'm1',
      chat_id: 'c1',
      run_id: null,
      role: 'system',
      content: '',
      mode: null,
      status: 'done',
      timeline_json: JSON.stringify({
        kind: 'setup_progress',
        status: 'running',
        command: 'make setup',
        manager: '',
      }),
      created_at: 1,
    });
    expect(msg.setupProgress?.manager).toBeUndefined();
  });
});
