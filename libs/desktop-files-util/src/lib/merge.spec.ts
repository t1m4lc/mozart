import { mergeFileEntries } from './merge';
import type { MergeFileInputs } from './file-entry.model';

function inputs(partial: Partial<MergeFileInputs>): MergeFileInputs {
  return {
    allPaths: [],
    tabPaths: [],
    changed: [],
    views: [],
    ...partial,
  };
}

describe('mergeFileEntries', () => {
  it('orders tiers: open tabs → changed → tail, deduped across tiers', () => {
    const result = mergeFileEntries(
      inputs({
        allPaths: ['a.ts', 'b.ts', 'c.ts', 'tab.ts', 'chg.ts'],
        tabPaths: ['tab.ts'],
        changed: [{ path: 'chg.ts', status: 'M' }],
      }),
    );
    expect(result.map((e) => e.path)).toEqual([
      'tab.ts',
      'chg.ts',
      'a.ts',
      'b.ts',
      'c.ts',
    ]);
    expect(result.map((e) => e.tier)).toEqual([
      'open',
      'changed',
      'other',
      'other',
      'other',
    ]);
  });

  it('puts a file that is BOTH open and changed in the open tier, once', () => {
    const result = mergeFileEntries(
      inputs({
        allPaths: ['x.ts'],
        tabPaths: ['x.ts'],
        changed: [{ path: 'x.ts', status: 'M' }],
      }),
    );
    expect(result).toEqual([{ path: 'x.ts', tier: 'open', badge: 'open' }]);
  });

  it('carries badges: open / status letter / none', () => {
    const result = mergeFileEntries(
      inputs({
        allPaths: ['tail.ts'],
        tabPaths: ['open.ts'],
        changed: [{ path: 'mod.ts', status: 'M' }],
      }),
    );
    expect(result).toEqual([
      { path: 'open.ts', tier: 'open', badge: 'open' },
      { path: 'mod.ts', tier: 'changed', badge: 'M' },
      { path: 'tail.ts', tier: 'other' },
    ]);
  });

  it('sorts the tail by viewed_at desc then path localeCompare', () => {
    const result = mergeFileEntries(
      inputs({
        allPaths: ['old.ts', 'new.ts', 'mid.ts', 'never.ts'],
        views: [
          { path: 'old.ts', viewedAt: 1 },
          { path: 'new.ts', viewedAt: 3 },
          { path: 'mid.ts', viewedAt: 2 },
        ],
      }),
    );
    // viewed (desc): new, mid, old — then never-viewed alphabetical.
    expect(result.map((e) => e.path)).toEqual([
      'new.ts',
      'mid.ts',
      'old.ts',
      'never.ts',
    ]);
  });

  it('falls back to pure alphabetical when there are no views', () => {
    const result = mergeFileEntries(
      inputs({ allPaths: ['c.ts', 'a.ts', 'b.ts'] }),
    );
    expect(result.map((e) => e.path)).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('de-duplicates repeated paths within allPaths', () => {
    const result = mergeFileEntries(
      inputs({ allPaths: ['a.ts', 'a.ts', 'b.ts'] }),
    );
    expect(result.map((e) => e.path)).toEqual(['a.ts', 'b.ts']);
  });

  it('returns [] for an empty repo', () => {
    expect(mergeFileEntries(inputs({}))).toEqual([]);
  });
});
