// Menu-presentation helpers for the composer slash menu: filtering the
// grouped skills by the live query, flattening them for keyboard nav, and
// rebuilding atomic tokens from a serialized draft string. The trigger
// detection / caret / overlay / pill mechanics live in the generic
// `@mozart-ui/trigger-menu` directive — this file is only domain-blind glue.

import type { SlashMenuGroup, SlashMenuItem } from './mz-composer-slash-menu';

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

function matchesQuery(item: SlashMenuItem, q: string): boolean {
  return (
    item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)
  );
}

/** Drop items not matching the query; drop groups left empty. */
export function filterGroupsByQuery(
  groups: readonly SlashMenuGroup[],
  query: string,
): readonly SlashMenuGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  const out: SlashMenuGroup[] = [];
  for (const g of groups) {
    const items = g.items.filter((it) => matchesQuery(it, q));
    if (items.length > 0) out.push({ ...g, items });
  }
  return out;
}

