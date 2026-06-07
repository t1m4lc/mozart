// Path-aware fuzzy subsequence matcher shared by the composer's `@`-file and
// `/`-skill menus. Dependency-free on purpose: the full candidate list already
// lives in renderer memory (the `@` list is the cached repo tree that powers
// the file-tree UI), so matching here avoids an IPC round-trip per keystroke,
// and a path-tuned scorer ranks better than a generic library (Fuse.js) while
// shipping zero extra bytes. Returns the matched character indices so the menu
// can highlight exactly what matched — substring highlight no longer holds once
// a query like `test6` matches `docs/archive/test/phase-6.md`.

export interface FuzzyMatch {
  /** Higher is a better match. Compare only within one query. */
  readonly score: number;
  /** Indices into the haystack that matched, ascending. */
  readonly indices: readonly number[];
}

const SEPARATORS = new Set(['/', '\\', '.', '-', '_', ' ']);

// A matched char scores higher when it starts a new "word": after a path
// separator, or at a camelCase hump (lower→Upper).
function isBoundary(text: string, i: number): boolean {
  if (i === 0) return true;
  const prev = text[i - 1];
  if (SEPARATORS.has(prev)) return true;
  return (
    prev.toLowerCase() === prev &&
    text[i].toUpperCase() === text[i] &&
    text[i].toLowerCase() !== text[i]
  );
}

/**
 * Case-insensitive fuzzy subsequence match. Returns `null` when `query` is not
 * a subsequence of `text`. Empty query matches everything with no highlight.
 *
 * Two passes (the fzf "v1" idea): a forward scan finds the earliest end that
 * consumes the whole query (membership), then a backward scan from that end
 * tightens the start — so the highlighted span is the most compact form of the
 * leftmost match. Cheap (O(n)) and good enough for path queries; it does not
 * search every alignment for a globally optimal span (that needs O(n·m) DP).
 */
export function fuzzyMatch(text: string, query: string): FuzzyMatch | null {
  if (!query) return { score: 0, indices: [] };
  const lt = text.toLowerCase();
  const lq = query.toLowerCase();

  let qi = 0;
  let end = -1;
  for (let i = 0; i < lt.length; i++) {
    if (lt[i] === lq[qi] && ++qi === lq.length) {
      end = i;
      break;
    }
  }
  if (qi < lq.length) return null;

  let start = 0;
  let qj = lq.length - 1;
  for (let i = end; i >= 0; i--) {
    if (lt[i] === lq[qj] && qj-- === 0) {
      start = i;
      break;
    }
  }

  const indices: number[] = [];
  const lastSlash = text.lastIndexOf('/');
  let score = -start; // an earlier match wins, mildly
  let prev = -2;
  let qk = 0;
  for (let i = start; i <= end && qk < lq.length; i++) {
    if (lt[i] !== lq[qk]) continue;
    indices.push(i);
    score += 16;
    if (i === prev + 1) score += 12; // consecutive run
    if (isBoundary(text, i)) score += 10; // word / segment boundary
    if (i > lastSlash) score += 6; // inside the basename, not a dir
    prev = i;
    qk++;
  }
  return { score, indices };
}

export interface HighlightPart {
  readonly text: string;
  readonly match: boolean;
}

/** Split `text` into matched / unmatched runs for templated highlighting. */
export function highlightFromIndices(
  text: string,
  indices: readonly number[],
): HighlightPart[] {
  if (indices.length === 0) return [{ text, match: false }];
  const set = new Set(indices);
  const parts: HighlightPart[] = [];
  let buf = '';
  let cur = set.has(0);
  for (let i = 0; i < text.length; i++) {
    const m = set.has(i);
    if (m !== cur) {
      if (buf) parts.push({ text: buf, match: cur });
      buf = '';
      cur = m;
    }
    buf += text[i];
  }
  if (buf) parts.push({ text: buf, match: cur });
  return parts;
}
