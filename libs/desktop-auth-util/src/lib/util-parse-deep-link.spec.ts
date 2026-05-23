import { describe, expect, it } from 'vitest';
import { parseDeepLink } from './util-parse-deep-link';

describe('parseDeepLink', () => {
  it('parses a well-formed mozart://auth URL', () => {
    expect(
      parseDeepLink('mozart://auth?token=demo-token&state=abc'),
    ).toEqual({ token: 'demo-token', state: 'abc' });
  });

  it('accepts URL-encoded values', () => {
    expect(
      parseDeepLink('mozart://auth?token=ey.J.payload&state=%E2%9C%93'),
    ).toEqual({ token: 'ey.J.payload', state: '✓' });
  });

  it('rejects missing token', () => {
    expect(parseDeepLink('mozart://auth?state=abc')).toBeNull();
  });

  it('rejects missing state', () => {
    expect(parseDeepLink('mozart://auth?token=demo')).toBeNull();
  });

  it('rejects empty token', () => {
    expect(parseDeepLink('mozart://auth?token=&state=abc')).toBeNull();
  });

  it('rejects empty state', () => {
    expect(parseDeepLink('mozart://auth?token=demo&state=')).toBeNull();
  });

  it('rejects a non-mozart scheme', () => {
    expect(parseDeepLink('https://auth?token=demo&state=abc')).toBeNull();
  });

  it('rejects a different endpoint', () => {
    expect(parseDeepLink('mozart://other?token=demo&state=abc')).toBeNull();
  });

  it('rejects a malformed URL', () => {
    expect(parseDeepLink('not a url')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(parseDeepLink('')).toBeNull();
  });
});
