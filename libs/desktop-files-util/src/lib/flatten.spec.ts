import { flattenFilePaths, type TreeNode } from './flatten';

describe('flattenFilePaths', () => {
  it('collects file leaves depth-first and skips directories', () => {
    const tree: TreeNode[] = [
      {
        path: 'src',
        kind: 'directory',
        children: [
          { path: 'src/a.ts', kind: 'file' },
          {
            path: 'src/sub',
            kind: 'directory',
            children: [{ path: 'src/sub/b.ts', kind: 'file' }],
          },
        ],
      },
      { path: 'README.md', kind: 'file' },
    ];
    expect(flattenFilePaths(tree)).toEqual([
      'src/a.ts',
      'src/sub/b.ts',
      'README.md',
    ]);
  });

  it('handles empty / null children', () => {
    expect(flattenFilePaths([])).toEqual([]);
    expect(
      flattenFilePaths([{ path: 'empty', kind: 'directory', children: [] }]),
    ).toEqual([]);
    expect(
      flattenFilePaths([{ path: 'f.ts', kind: 'file', children: null }]),
    ).toEqual(['f.ts']);
  });
});
