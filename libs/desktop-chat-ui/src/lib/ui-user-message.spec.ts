import { describe, expect, it } from 'vitest';
import { withBoldSkillTokens } from './ui-user-message';

describe('withBoldSkillTokens', () => {
  it('bolds a standalone /skill token', () => {
    expect(withBoldSkillTokens('run /commit now')).toBe(
      'run <b>/commit</b> now',
    );
  });

  it('bolds a token at the very start', () => {
    expect(withBoldSkillTokens('/commit')).toBe('<b>/commit</b>');
  });

  it('bolds a hyphenated id', () => {
    expect(withBoldSkillTokens('/summarize-changes')).toBe(
      '<b>/summarize-changes</b>',
    );
  });

  it('leaves an absolute path alone (internal slash)', () => {
    expect(withBoldSkillTokens('see /usr/bin/foo')).toBe('see /usr/bin/foo');
  });

  it('leaves a mid-word slash alone', () => {
    expect(withBoldSkillTokens('foo/commit')).toBe('foo/commit');
  });

  it('escapes user HTML so only our <b> reaches innerHTML', () => {
    expect(withBoldSkillTokens('a < b & <i>x</i> /commit')).toBe(
      'a &lt; b &amp; &lt;i&gt;x&lt;/i&gt; <b>/commit</b>',
    );
  });

  it('handles multiple tokens', () => {
    expect(withBoldSkillTokens('/review then /commit')).toBe(
      '<b>/review</b> then <b>/commit</b>',
    );
  });
});
