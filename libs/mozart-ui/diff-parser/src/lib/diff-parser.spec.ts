import {
  parseGroupedDiff,
  parseUnifiedDiff,
  type DiffHunk,
} from './diff-parser';

// Fixture A — two hunks, default 3 lines of context each.
// Mirrors `git diff base -- foo.ts` output shape.
const TWO_HUNK = `diff --git a/foo.ts b/foo.ts
index 1111111..2222222 100644
--- a/foo.ts
+++ b/foo.ts
@@ -10,7 +10,8 @@ fn foo()
 ctx10
 ctx11
 ctx12
-old13
+new13
+inserted13a
 ctx14
 ctx15
 ctx16
@@ -50,6 +51,5 @@ fn bar()
 ctx50
 ctx51
-old52
-old53
+new52
 ctx54
 ctx55
`;

// Fixture B — untracked file synthesized as "all added".
const ALL_ADDED = `diff --git a/new.txt b/new.txt
new file
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,3 @@
+line one
+line two
+line three
`;

// Fixture C — file ends without trailing newline; the trailing
// "\\ No newline at end of file" marker must not advance cursors.
const NO_NEWLINE_EOF = `--- a/x.txt
+++ b/x.txt
@@ -1,3 +1,3 @@
 a
-b
+B
 c
\\ No newline at end of file
`;

// Fixture D — pure deletion against an empty new side
// (header reports +N,0 — endLine collapses to startLine - 1).
const PURE_DELETE = `--- a/del.txt
+++ b/del.txt
@@ -10,2 +10,0 @@
-gone1
-gone2
`;

describe('parseGroupedDiff', () => {
  it('returns empty parse on empty input', () => {
    expect(parseGroupedDiff('')).toEqual({ preamble: [], hunks: [] });
  });

  it('splits two hunks with correct line-number metadata', () => {
    const { preamble, hunks } = parseGroupedDiff(TWO_HUNK);

    expect(preamble.map((l) => l.kind)).toEqual(['meta', 'meta', 'meta', 'meta']);
    expect(hunks).toHaveLength(2);

    const [h1, h2] = hunks;
    expect(h1.startLine).toBe(10);
    expect(h1.endLine).toBe(17); // 10 + 8 - 1
    expect(h1.newCount).toBe(8);
    expect(h1.oldStart).toBe(10);
    expect(h1.oldCount).toBe(7);
    expect(h1.addedLines).toBe(2);
    expect(h1.removedLines).toBe(1);
    // 3 context + 1 '-' + 2 '+' + 3 context = 9 body lines.
    expect(h1.lines).toHaveLength(9);

    // First context line of hunk 1 lives at new=10, old=10.
    expect(h1.lines[0]).toMatchObject({
      kind: 'context',
      oldLineNumber: 10,
      newLineNumber: 10,
    });
    // The '-old13' has no new-side number but old=13.
    const removed = h1.lines.find((l) => l.kind === 'remove');
    expect(removed).toMatchObject({ oldLineNumber: 13, newLineNumber: null });
    // Two adds share consecutive new-side numbers.
    const adds = h1.lines.filter((l) => l.kind === 'add');
    expect(adds.map((l) => l.newLineNumber)).toEqual([13, 14]);
    expect(adds.every((l) => l.oldLineNumber === null)).toBe(true);

    expect(h2.startLine).toBe(51);
    expect(h2.endLine).toBe(55); // 51 + 5 - 1
    expect(h2.oldStart).toBe(50);
    expect(h2.oldCount).toBe(6);
    expect(h2.addedLines).toBe(1);
    expect(h2.removedLines).toBe(2);
  });

  it('handles the synthesized all-added (untracked file) diff', () => {
    const { preamble, hunks } = parseGroupedDiff(ALL_ADDED);

    // preamble = diff --git, new file, --- /dev/null, +++ b/new.txt
    expect(preamble.map((l) => l.kind)).toEqual(['meta', 'meta', 'meta', 'meta']);

    expect(hunks).toHaveLength(1);
    const h = hunks[0];
    expect(h.startLine).toBe(1);
    expect(h.endLine).toBe(3);
    expect(h.oldStart).toBe(0);
    expect(h.oldCount).toBe(0);
    expect(h.addedLines).toBe(3);
    expect(h.removedLines).toBe(0);
    expect(h.lines.every((l) => l.kind === 'add')).toBe(true);
    expect(h.lines.map((l) => l.newLineNumber)).toEqual([1, 2, 3]);
  });

  it('does not advance cursors on the no-newline marker', () => {
    const { hunks } = parseGroupedDiff(NO_NEWLINE_EOF);
    const h = hunks[0];

    // Five body lines: context a, remove b, add B, context c, marker.
    expect(h.lines).toHaveLength(5);

    const marker = h.lines[4];
    expect(marker.kind).toBe('context');
    expect(marker.text.startsWith('\\')).toBe(true);
    expect(marker.oldLineNumber).toBeNull();
    expect(marker.newLineNumber).toBeNull();

    // Cursors after the body match the @@ header counts.
    const lastReal = h.lines[3];
    expect(lastReal).toMatchObject({
      kind: 'context',
      oldLineNumber: 3,
      newLineNumber: 3,
    });
  });

  it('collapses endLine to startLine - 1 for pure-delete hunks', () => {
    const { hunks } = parseGroupedDiff(PURE_DELETE);
    const h = hunks[0];

    expect(h.startLine).toBe(10);
    expect(h.endLine).toBe(9);
    expect(h.newCount).toBe(0);
    expect(h.addedLines).toBe(0);
    expect(h.removedLines).toBe(2);
    expect(h.lines.map((l) => l.oldLineNumber)).toEqual([10, 11]);
  });

  it('defaults missing @@ counts to 1', () => {
    const { hunks } = parseGroupedDiff(
      `--- a/x\n+++ b/x\n@@ -5 +6 @@\n-x\n+y\n`,
    );
    const h = hunks[0] as DiffHunk;
    expect(h.oldStart).toBe(5);
    expect(h.oldCount).toBe(1);
    expect(h.startLine).toBe(6);
    expect(h.newCount).toBe(1);
    expect(h.endLine).toBe(6);
  });

  it('preserves a malformed @@ line as meta and parses subsequent valid hunks', () => {
    const { preamble, hunks } = parseGroupedDiff(
      `@@ broken header @@\n@@ -1,1 +1,1 @@\n-a\n+A\n`,
    );
    expect(preamble.map((l) => l.text)).toContain('@@ broken header @@');
    expect(hunks).toHaveLength(1);
    expect(hunks[0].addedLines).toBe(1);
    expect(hunks[0].removedLines).toBe(1);
  });
});

describe('parseUnifiedDiff back-compat', () => {
  it('returns the flat sequence consumed by the existing renderer', () => {
    const flat = parseUnifiedDiff(TWO_HUNK);
    const kinds = flat.map((l) => l.kind);

    // 4 meta preamble, then for each hunk: 1 hunk header + body lines.
    expect(kinds.slice(0, 4)).toEqual(['meta', 'meta', 'meta', 'meta']);
    expect(kinds[4]).toBe('hunk');
    expect(kinds.filter((k) => k === 'hunk')).toHaveLength(2);
    expect(kinds.filter((k) => k === 'add')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'remove')).toHaveLength(3);
  });

  it('returns an empty array on empty input', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
});
