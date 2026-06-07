import { fuzzyMatch, highlightFromIndices } from './fuzzy';

const matched = (text: string, indices: readonly number[]) =>
  indices.map((i) => text[i]).join('');

describe('fuzzyMatch', () => {
  it('matches a contiguous substring', () => {
    const m = fuzzyMatch('src/app/main.ts', 'main');
    expect(m).not.toBeNull();
    expect(matched('src/app/main.ts', m!.indices)).toBe('main');
  });

  it('matches a scattered subsequence across path segments', () => {
    const m = fuzzyMatch('docs/archive/test/phase-6.md', 'test6');
    expect(m).not.toBeNull();
    expect(matched('docs/archive/test/phase-6.md', m!.indices)).toBe('test6');
  });

  it('returns null when the query is not a subsequence', () => {
    expect(fuzzyMatch('src/app.ts', 'xyz')).toBeNull();
  });

  it('is case-insensitive', () => {
    expect(fuzzyMatch('Src/App.TS', 'apts')).not.toBeNull();
  });

  it('treats an empty query as a no-highlight match', () => {
    expect(fuzzyMatch('anything', '')).toEqual({ score: 0, indices: [] });
  });

  it('tightens the leftmost match window', () => {
    // Forward finds the earliest end that consumes the query; backward then
    // tightens the start. The matched chars always spell the query back.
    const m = fuzzyMatch('the/best/test', 'test');
    expect(matched('the/best/test', m!.indices)).toBe('test');
  });

  it('ranks a boundary/basename match above a buried one', () => {
    const basename = fuzzyMatch('src/components/button.ts', 'button')!;
    const buried = fuzzyMatch('src/abuttonx/other.ts', 'button')!;
    expect(basename.score).toBeGreaterThan(buried.score);
  });
});

describe('highlightFromIndices', () => {
  it('splits into matched and unmatched runs', () => {
    expect(highlightFromIndices('main.ts', [0, 1, 2, 3])).toEqual([
      { text: 'main', match: true },
      { text: '.ts', match: false },
    ]);
  });

  it('returns a single unmatched part when there are no indices', () => {
    expect(highlightFromIndices('main.ts', [])).toEqual([
      { text: 'main.ts', match: false },
    ]);
  });

  it('handles non-adjacent matched indices', () => {
    expect(highlightFromIndices('abcd', [0, 2])).toEqual([
      { text: 'a', match: true },
      { text: 'b', match: false },
      { text: 'c', match: true },
      { text: 'd', match: false },
    ]);
  });
});
