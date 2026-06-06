// Flatten a nested file tree to the paths of its file leaves. Generic over a
// minimal node shape so this util stays dependency-free (the repositories
// `FileNode` is structurally compatible and passes straight in).

export interface TreeNode {
  readonly path: string;
  /** `'file'` for leaves; anything else (e.g. `'directory'`) is recursed into. */
  readonly kind: string;
  readonly children?: readonly TreeNode[] | null;
}

/** Depth-first list of every file path in the tree (directories excluded). */
export function flattenFilePaths(nodes: readonly TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly TreeNode[]): void => {
    for (const node of list) {
      if (node.kind === 'file') out.push(node.path);
      if (node.children) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}
