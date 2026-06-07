import { splitFileTokens } from './at-menu.logic';

const known = (...paths: string[]) => new Set(paths);

describe('splitFileTokens', () => {
  it('rebuilds a known path with slashes and dots as a single chip', () => {
    expect(splitFileTokens('@a/b.ts', known('a/b.ts'))).toEqual([
      { text: '@a/b.ts', file: true },
    ]);
  });

  it('round-trips a path containing spaces', () => {
    expect(
      splitFileTokens('@src/my notes.ts', known('src/my notes.ts')),
    ).toEqual([{ text: '@src/my notes.ts', file: true }]);
  });

  it('takes the longest match when paths share a prefix', () => {
    expect(
      splitFileTokens('@src/foo.tsx', known('src/foo.ts', 'src/foo.tsx')),
    ).toEqual([{ text: '@src/foo.tsx', file: true }]);
  });

  it('keeps surrounding text plain', () => {
    expect(splitFileTokens('see @a.ts here', known('a.ts'))).toEqual([
      { text: 'see ', file: false },
      { text: '@a.ts', file: true },
      { text: ' here', file: false },
    ]);
  });

  it('leaves lookalike / unknown @text as plain text', () => {
    expect(splitFileTokens('@nope and a@b', known('a.ts'))).toEqual([
      { text: '@nope and a@b', file: false },
    ]);
  });

  it('only matches at a word boundary (not mid-word)', () => {
    expect(splitFileTokens('foo@a.ts', known('a.ts'))).toEqual([
      { text: 'foo@a.ts', file: false },
    ]);
  });

  it('keeps the raw text untouched when no paths are loaded yet', () => {
    expect(splitFileTokens('@a/b.ts', known())).toEqual([
      { text: '@a/b.ts', file: false },
    ]);
  });

  it('returns [] for empty text', () => {
    expect(splitFileTokens('', known('a.ts'))).toEqual([]);
  });

  it('handles multiple file tokens in one string', () => {
    expect(
      splitFileTokens('@a.ts and @b/c.ts', known('a.ts', 'b/c.ts')),
    ).toEqual([
      { text: '@a.ts', file: true },
      { text: ' and ', file: false },
      { text: '@b/c.ts', file: true },
    ]);
  });

  it('recognizes adjacent pills separated by the nbsp spacer', () => {
    const nbsp = ' ';
    expect(
      splitFileTokens(`@a.ts${nbsp}@b/c.ts${nbsp}`, known('a.ts', 'b/c.ts')),
    ).toEqual([
      { text: '@a.ts', file: true },
      { text: nbsp, file: false },
      { text: '@b/c.ts', file: true },
      { text: nbsp, file: false },
    ]);
  });
});
