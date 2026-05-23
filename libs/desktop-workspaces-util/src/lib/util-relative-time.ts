import dayjs from 'dayjs';
import relativeTimePlugin from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTimePlugin);

// Thin wrapper around dayjs(...).fromNow() so call sites don't have
// to remember to extend the plugin themselves. Used by the workspace
// row hover popover ("2 min ago", "just now", "in 3 hours", …).
export function relativeTime(ms: number, now: number = Date.now()): string {
  return dayjs(ms).from(dayjs(now));
}
