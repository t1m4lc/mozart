// Pure parser for unified-diff text. Maps each line to a tagged
// `DiffLine` so the renderer can assign the right Tailwind classes
// without inspecting strings in the template. `parseGroupedDiff`
// additionally groups the body lines into hunks so the diff view can
// render expand bars between them (P2.3) without re-scanning the text.

export type DiffLineKind = 'add' | 'remove' | 'context' | 'hunk' | 'meta';

export interface DiffLine {
  readonly kind: DiffLineKind;
  readonly text: string;
  /** 1-based line number on the old side. Null for added, hunk header,
   *  meta, or the "\\ No newline at end of file" marker. */
  readonly oldLineNumber: number | null;
  /** 1-based line number on the new side. Null for removed, hunk
   *  header, meta, or the no-newline marker. */
  readonly newLineNumber: number | null;
}

export interface DiffHunk {
  /** Raw header line, e.g. "@@ -10,7 +12,8 @@ fn foo()". */
  readonly header: string;
  /** Hunk body in file order; excludes the @@ header. */
  readonly lines: readonly DiffLine[];
  /** 1-based first new-side line covered by this hunk. */
  readonly startLine: number;
  /** 1-based last new-side line covered (inclusive). For a zero-count
   *  hunk (pure deletion against an empty new file) this collapses to
   *  `startLine - 1`; callers should treat the range as empty. */
  readonly endLine: number;
  /** Count parsed from the @@ header for the new side. */
  readonly newCount: number;
  /** 1-based first old-side line. */
  readonly oldStart: number;
  /** Count parsed from the @@ header for the old side. */
  readonly oldCount: number;
  /** Number of '+' lines in this hunk body. */
  readonly addedLines: number;
  /** Number of '-' lines in this hunk body. */
  readonly removedLines: number;
}

export interface ParsedDiff {
  /** Lines emitted before the first hunk header (diff --git, ---, +++,
   *  new file, etc.). Each is tagged `meta` or `context` per `classify`. */
  readonly preamble: readonly DiffLine[];
  /** Ordered hunks. Empty when the diff text contained no `@@` header. */
  readonly hunks: readonly DiffHunk[];
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parse a unified diff into preamble + hunks. */
export function parseGroupedDiff(text: string): ParsedDiff {
  if (!text) return { preamble: [], hunks: [] };

  const preamble: DiffLine[] = [];
  const hunks: DiffHunk[] = [];

  let header: string | null = null;
  let body: DiffLine[] = [];
  let newStart = 0;
  let newCount = 0;
  let oldStart = 0;
  let oldCount = 0;
  let oldCursor = 0;
  let newCursor = 0;
  let added = 0;
  let removed = 0;

  const flush = (): void => {
    if (header === null) return;
    // For a zero-count side (pure-delete hunk like `@@ -10,3 +10,0 @@`),
    // `endLine = startLine - 1` so the [start, end] range is empty.
    const endLine = newCount === 0 ? newStart - 1 : newStart + newCount - 1;
    hunks.push({
      header,
      lines: body,
      startLine: newStart,
      endLine,
      newCount,
      oldStart,
      oldCount,
      addedLines: added,
      removedLines: removed,
    });
    header = null;
    body = [];
    newStart = 0;
    newCount = 0;
    oldStart = 0;
    oldCount = 0;
    oldCursor = 0;
    newCursor = 0;
    added = 0;
    removed = 0;
  };

  // Preserve the existing behavior: trim a single trailing \n so files
  // ending with one newline don't produce a phantom blank context row.
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;

  for (const line of trimmed.split('\n')) {
    if (line.startsWith('@@')) {
      flush();
      const match = HUNK_HEADER_RE.exec(line);
      if (!match) {
        // Malformed hunk header — keep it visible as meta and stay in
        // preamble mode until a well-formed header arrives.
        preamble.push(makeLine('meta', line));
        continue;
      }
      header = line;
      oldStart = parseInt(match[1], 10);
      oldCount = match[2] === undefined ? 1 : parseInt(match[2], 10);
      newStart = parseInt(match[3], 10);
      newCount = match[4] === undefined ? 1 : parseInt(match[4], 10);
      oldCursor = oldStart;
      newCursor = newStart;
      continue;
    }

    if (header === null) {
      preamble.push(makeLine(classify(line), line));
      continue;
    }

    // "\ No newline at end of file" — kept as a context-styled marker
    // but doesn't advance cursors and counts as neither add nor remove.
    if (line.startsWith('\\')) {
      body.push(makeLine('context', line));
      continue;
    }

    if (line.startsWith('+')) {
      body.push({ kind: 'add', text: line, oldLineNumber: null, newLineNumber: newCursor });
      newCursor++;
      added++;
      continue;
    }

    if (line.startsWith('-')) {
      body.push({ kind: 'remove', text: line, oldLineNumber: oldCursor, newLineNumber: null });
      oldCursor++;
      removed++;
      continue;
    }

    // Context line (' ...' or empty). Both sides advance.
    body.push({
      kind: 'context',
      text: line,
      oldLineNumber: oldCursor,
      newLineNumber: newCursor,
    });
    oldCursor++;
    newCursor++;
  }

  flush();
  return { preamble, hunks };
}

/** Back-compatible flat view: preamble + (hunk header + body)* . */
export function parseUnifiedDiff(text: string): readonly DiffLine[] {
  const parsed = parseGroupedDiff(text);
  if (parsed.preamble.length === 0 && parsed.hunks.length === 0) return [];
  const out: DiffLine[] = [];
  for (const line of parsed.preamble) out.push(line);
  for (const hunk of parsed.hunks) {
    out.push(makeLine('hunk', hunk.header));
    for (const line of hunk.lines) out.push(line);
  }
  return out;
}

function makeLine(kind: DiffLineKind, text: string): DiffLine {
  return { kind, text, oldLineNumber: null, newLineNumber: null };
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
