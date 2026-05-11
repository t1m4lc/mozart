import { describe, expect, it } from 'vitest';
import type { AppErrorDto } from '../shared/schemas/bindings.schemas';
import { MozartError } from './mozart-error';

describe('MozartError', () => {
  it('is a real Error subclass', () => {
    const e = new MozartError('Db', 'boom');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(MozartError);
    expect(e.name).toBe('MozartError');
    expect(e.message).toBe('boom');
    expect(e.kind).toBe('Db');
    expect(e.recovery).toBeUndefined();
  });

  it('accepts an optional recovery hint', () => {
    const e = new MozartError('Validation', 'oops', 'Try again');
    expect(e.recovery).toBe('Try again');
  });

  it('fromAppError sets recovery = "Open Settings → Claude CLI" when kind is AgentSpawn', () => {
    const dto: AppErrorDto = { kind: 'AgentSpawn', message: 'no claude' };
    const e = MozartError.fromAppError(dto);
    expect(e.kind).toBe('AgentSpawn');
    expect(e.message).toBe('no claude');
    expect(e.recovery).toBe('Open Settings → Claude CLI');
  });

  it('fromAppError leaves recovery undefined for other kinds', () => {
    for (const kind of ['Db', 'Io', 'NotFound', 'Validation', 'GitCmd'] as const) {
      const e = MozartError.fromAppError({ kind, message: 'x' });
      expect(e.recovery).toBeUndefined();
    }
  });

  it('preserves the prototype chain for instanceof', () => {
    const e = MozartError.fromAppError({ kind: 'NotFound', message: 'gone' });
    expect(e instanceof MozartError).toBe(true);
    expect(e instanceof Error).toBe(true);
  });

  it('forwards Validation kind for schema parse failures', () => {
    const e = new MozartError('Validation', 'bad payload');
    expect(e.kind).toBe('Validation');
  });
});
