import type { SlashMenuGroup } from './mz-composer-slash-menu';
import { filterGroupsByQuery, splitSkillTokens } from './slash-menu.logic';

describe('splitSkillTokens', () => {
  const ids = new Set(['commit', 'summarize-changes']);

  it('splits a known skill into a chip segment, rest plain', () => {
    expect(splitSkillTokens('Hello /commit now', ids)).toEqual([
      { text: 'Hello ', skill: false },
      { text: '/commit', skill: true },
      { text: ' now', skill: false },
    ]);
  });
  it('chip at the very start', () => {
    expect(splitSkillTokens('/commit', ids)).toEqual([
      { text: '/commit', skill: true },
    ]);
  });
  it('unknown /token stays plain', () => {
    expect(splitSkillTokens('/whatever x', ids)).toEqual([
      { text: '/whatever x', skill: false },
    ]);
  });
  it('slash glued to text stays plain', () => {
    expect(splitSkillTokens('foo/commit', ids)).toEqual([
      { text: 'foo/commit', skill: false },
    ]);
  });
  it('known prefix of a longer token stays plain', () => {
    expect(splitSkillTokens('/committed', ids)).toEqual([
      { text: '/committed', skill: false },
    ]);
  });
  it('hyphenated id is recognized', () => {
    expect(splitSkillTokens('/summarize-changes', ids)).toEqual([
      { text: '/summarize-changes', skill: true },
    ]);
  });
  it('empty text yields no segments', () => {
    expect(splitSkillTokens('', ids)).toEqual([]);
  });
});

const groups: readonly SlashMenuGroup[] = [
  {
    key: 'mozart',
    label: 'Mozart',
    items: [
      { id: 'commit', label: 'Commit', description: 'Conventional commit', disabled: false },
      { id: 'summarize', label: 'Summarize', description: 'Summarize changes', disabled: false },
    ],
  },
  {
    key: 'gstack',
    label: 'Gstack',
    items: [{ id: 'ship', label: 'Ship', description: 'Open a PR', disabled: true }],
  },
];

describe('filterGroupsByQuery', () => {
  it('empty query returns all groups', () => {
    expect(filterGroupsByQuery(groups, '')).toEqual(groups);
  });
  it('keeps matching items and drops empty groups', () => {
    const out = filterGroupsByQuery(groups, 'comm');
    expect(out).toHaveLength(1);
    expect(out[0].items.map((i) => i.id)).toEqual(['commit']);
  });
  it('matches case-insensitively on id and label', () => {
    expect(filterGroupsByQuery(groups, 'SHIP')[0].key).toBe('gstack');
  });
});
