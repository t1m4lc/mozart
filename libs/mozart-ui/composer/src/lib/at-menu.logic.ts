// Rebuilds atomic `@`-file tokens from a serialized draft string — the file
// analogue of `splitSkillTokens`. Lives in the UI lib (not a domain lib)
// because, like the skill splitter, it rebuilds the contenteditable's chips and
// `mozart-ui` must not depend on `desktop-*`. The known paths are passed in by
// the host feature (same way `splitSkillTokens` receives the known skill ids).
//
// The difference that matters vs. the skill splitter: file paths are NOT a
// single word — they contain `/`, `.`, and may contain spaces
// (`@src/my notes.ts`), so a whitespace tokenizer would silently truncate them
// and corrupt the load-bearing `@path` reference. Instead we match each `@`
// against the known paths and take the LONGEST match. Pills are only ever
// serialized from real, selected files, so on restore the exact path is in the
// known set and longest-prefix match reconstructs it faithfully, spaces and all.

function isWhitespace(ch: string): boolean {
  // `\s` (not a fixed set) so the nbsp the trigger-menu inserts between
  // committed pills counts as a boundary — same rule as `findActiveTrigger`,
  // otherwise the second of two adjacent `@`-pills wouldn't be recognized.
  return /\s/.test(ch);
}

export interface FilePromptSegment {
  readonly text: string;
  /** True for an `@<path>` token whose path is a known project file →
   *  rendered as an atomic chip. Plain text otherwise. */
  readonly file: boolean;
}

/**
 * Split a serialized prompt string into chip / plain-text segments for the
 * `@`-file picker. After each `@` at a word boundary, the LONGEST known path
 * that prefixes the following text becomes a chip; everything else stays plain.
 *
 * Safety: when `knownPaths` is empty (the file list hasn't loaded yet), the raw
 * text is returned untouched — never corrupt a draft we can't yet resolve. The
 * caller should keep the raw text and re-run once paths are available.
 */
export function splitFileTokens(
  text: string,
  knownPaths: ReadonlySet<string>,
): readonly FilePromptSegment[] {
  if (knownPaths.size === 0) {
    return text.length > 0 ? [{ text, file: false }] : [];
  }
  // Longest-first so `src/foo.tsx` wins over `src/foo.ts` at the same `@`.
  const byLengthDesc = [...knownPaths].sort((a, b) => b.length - a.length);

  const segments: FilePromptSegment[] = [];
  const boundaryBefore = (idx: number): boolean =>
    idx === 0 || isWhitespace(text[idx - 1]);
  let plainStart = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '@' && boundaryBefore(i)) {
      const rest = text.slice(i + 1);
      const match = byLengthDesc.find(
        (p) => p.length > 0 && rest.startsWith(p),
      );
      if (match) {
        if (i > plainStart) {
          segments.push({ text: text.slice(plainStart, i), file: false });
        }
        segments.push({ text: '@' + match, file: true });
        const end = i + 1 + match.length;
        plainStart = end;
        i = end;
        continue;
      }
    }
    i++;
  }
  if (plainStart < text.length) {
    segments.push({ text: text.slice(plainStart), file: false });
  }
  return segments;
}
