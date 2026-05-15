// Pure parser for unified-diff text. Maps each line to a tagged
// `DiffLine` so the renderer can assign the right Tailwind classes
// without inspecting strings in the template.

export type DiffLineKind = 'add' | 'remove' | 'context' | 'hunk' | 'meta';

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
}

export function parseUnifiedDiff(text: string): readonly DiffLine[] {
  if (!text) return [];
  const out: DiffLine[] = [];
  // Split on \n; preserve empty trailing line by trimming a single trailing \n
  // (so files ending with one newline don't generate a blank context row).
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  for (const line of trimmed.split('\n')) {
    out.push({ kind: classify(line), text: line });
  }
  return out;
}

function classify(line: string): DiffLineKind {
  if (line.startsWith('@@')) return 'hunk';
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('--- ') ||
    line.startsWith('+++ ') ||
    line.startsWith('new file') ||
    line.startsWith('deleted file') ||
    line.startsWith('similarity index') ||
    line.startsWith('rename from') ||
    line.startsWith('rename to')
  ) {
    return 'meta';
  }
  if (line.startsWith('+')) return 'add';
  if (line.startsWith('-')) return 'remove';
  return 'context';
}
