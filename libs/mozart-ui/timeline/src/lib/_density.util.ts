// Pure predicate consumed by both `<mz-timeline>` (filters its rows)
// and `<mz-turn-container>` (decides whether to mount the timeline
// component at all). Keeping a single source of truth avoids
// "container renders an empty timeline because it counted unfiltered
// items" drift.
//
// Rules (docs/tmp/2026-05-25 §C):
//   - errors AND `result`-role items: always visible
//   - `compact` : nothing else
//   - `normal`  : `detail` items whose kind is in PROMOTE_TO_NORMAL
//   - `detailed`: every item

import { PROMOTE_TO_NORMAL, TOOL_ROLES } from './renderers/tool-renderers.registry';
import type { TimelineDensity, TurnItem } from './turn-state.types';

export function isItemVisibleAt(
  item: TurnItem,
  level: TimelineDensity,
): boolean {
  if (level === 'detailed') return true;
  if (item.state === 'error') return true;
  if (TOOL_ROLES[item.kind] === 'result') return true;
  if (level === 'normal') return PROMOTE_TO_NORMAL.has(item.kind);
  return false; // 'compact' + non-result + non-error
}

export function anyVisibleAt(
  items: readonly TurnItem[],
  level: TimelineDensity,
): boolean {
  for (const item of items) {
    if (isItemVisibleAt(item, level)) return true;
  }
  return false;
}
