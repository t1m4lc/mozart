import { splitSkillTokens } from './slash-menu.logic';

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
