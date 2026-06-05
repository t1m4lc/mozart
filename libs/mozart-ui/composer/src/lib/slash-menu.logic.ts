// Rebuilds atomic skill tokens from a serialized draft string. Query
// filtering, keyboard nav and active-item scrolling now live in cmdk
// (`mz-composer-slash-menu`); the trigger / caret / overlay / pill mechanics
// live in the generic `@mozart-ui/trigger-menu` directive — this file is only
// the draft-rebuild glue.

function isWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

export interface PromptSegment {
  readonly text: string;
  /** True for a `/<id>` token whose id is a real, known skill → rendered as
   *  an atomic chip. Plain text otherwise. */
  readonly skill: boolean;
}

/**
 * Split a serialized prompt string into chip / plain-text segments. Used to
 * rebuild the contenteditable's atomic chips from a stored draft string: a
 * `/<id>` becomes a chip only when `id` is a known skill at a word boundary,
 * so lookalike text (`/whatever`, `foo/commit`, `/committed`) stays plain.
 */
export function splitSkillTokens(
  text: string,
  skillIds: ReadonlySet<string>,
): readonly PromptSegment[] {
  const segments: PromptSegment[] = [];
  const boundaryBefore = (idx: number): boolean =>
    idx === 0 || isWhitespace(text[idx - 1]);
  let plainStart = 0;
  let i = 0;
  while (i < text.length) {
    if (text[i] === '/' && boundaryBefore(i)) {
      let j = i + 1;
      while (j < text.length && !isWhitespace(text[j])) j++;
      if (skillIds.has(text.slice(i + 1, j))) {
        if (i > plainStart) {
          segments.push({ text: text.slice(plainStart, i), skill: false });
        }
        segments.push({ text: text.slice(i, j), skill: true });
        plainStart = j;
        i = j;
        continue;
      }
    }
    i++;
  }
  if (plainStart < text.length) {
    segments.push({ text: text.slice(plainStart), skill: false });
  }
  return segments;
}
