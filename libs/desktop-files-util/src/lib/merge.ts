// Pure ranking/merge for the composer `@`-file picker. Three sources collapse
// into ONE flat list (no section headers): open-tab files first, then changed
// files, then everything else. Each entry carries its `tier` (what the sort
// keys on) and a display `badge` (what the row renders) — same field, so the
// flat list stays legible without re-introducing section grouping.
//
//   tabPaths   ─┐
//   changed    ─┼─►  mergeFileEntries()  ─►  [open…, changed…, tail…]
//   allPaths   ─┤        (this file)         deduped across tiers
//   views      ─┘
//
// Dedup rule: a path present in a higher tier is removed from lower ones. A
// file that is BOTH open and changed lands in `open` (tier 0) — the tab is the
// stronger signal of intent.

import type { FileEntry, MergeFileInputs } from './file-entry.model';

/**
 * Flatten + rank the four file sources into a single ordered list.
 *
 * Tail ordering (tier `other`): files with a last-viewed record sort before
 * those without; among viewed files, most-recent first; ties (and the
 * never-viewed remainder) break on `localeCompare`. No views anywhere ⇒ pure
 * alphabetical.
 */
export function mergeFileEntries(input: MergeFileInputs): readonly FileEntry[] {
  const seen = new Set<string>();
  const entries: FileEntry[] = [];

  for (const path of input.tabPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, tier: 'open', badge: 'open' });
  }

  for (const { path, status } of input.changed) {
    if (seen.has(path)) continue;
    seen.add(path);
    entries.push({ path, tier: 'changed', badge: status });
  }

  const viewedAt = new Map(input.views.map((v) => [v.path, v.viewedAt]));
  const tail: string[] = [];
  for (const path of input.allPaths) {
    if (seen.has(path)) continue;
    seen.add(path);
    tail.push(path);
  }
  tail.sort((a, b) => {
    const va = viewedAt.get(a);
    const vb = viewedAt.get(b);
    if (va !== undefined && vb !== undefined && va !== vb) return vb - va;
    if (va !== undefined && vb === undefined) return -1;
    if (va === undefined && vb !== undefined) return 1;
    return a.localeCompare(b);
  });
  for (const path of tail) entries.push({ path, tier: 'other' });

  return entries;
}
