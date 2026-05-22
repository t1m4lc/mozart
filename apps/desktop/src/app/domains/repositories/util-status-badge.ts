import type { BadgeVariants } from '@mozart/ui/badge';
import type { FileChangeStatus } from './data/file-node.model';

export interface StatusBadge {
  readonly letter: 'A' | 'M' | 'D';
  readonly variant: NonNullable<BadgeVariants['variant']>;
  readonly label: string;
}

const BADGE_BY_STATUS: Record<
  Exclude<FileChangeStatus, 'unchanged'>,
  StatusBadge
> = {
  added: { letter: 'A', variant: 'secondary', label: 'Added' },
  modified: { letter: 'M', variant: 'secondary', label: 'Modified' },
  deleted: { letter: 'D', variant: 'destructive', label: 'Deleted' },
};

/** Pure mapper. Returns `null` for `unchanged` so the template can skip
 *  the badge entirely. */
export function statusBadge(status: FileChangeStatus): StatusBadge | null {
  if (status === 'unchanged') return null;
  return BADGE_BY_STATUS[status];
}
