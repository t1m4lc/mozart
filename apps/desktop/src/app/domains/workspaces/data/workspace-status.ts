// UI workspace status — a kanban concept, distinct from the DB runtime status
// (initializing | ready | running | done | error | conflict | stopped | crashed).
// The two are tracked in parallel: runtime status lives in db.workspaces.status,
// the UI status will live in a separate column (see migration plan).

export type UiWorkspaceStatus =
  | 'backlog'
  | 'in_progress'
  | 'in_review'
  | 'done'
  | 'canceled';

export interface UiWorkspaceStatusMeta {
  readonly id: UiWorkspaceStatus;
  readonly label: string;
  readonly icon: string;
  readonly colorClass: string;
}

export const UI_WORKSPACE_STATUSES: readonly UiWorkspaceStatusMeta[] = [
  { id: 'backlog', label: 'Backlog', icon: 'lucideCircleDashed', colorClass: '' },
  { id: 'in_progress', label: 'In Progress', icon: 'lucideTimer', colorClass: 'text-amber-500' },
  { id: 'in_review', label: 'In Review', icon: 'lucideEye', colorClass: 'text-blue-500' },
  { id: 'done', label: 'Done', icon: 'lucideCircleCheck', colorClass: 'text-green-500' },
  { id: 'canceled', label: 'Canceled', icon: 'lucideCircleX', colorClass: 'text-red-500' },
] as const;

const STATUS_BY_ID: Record<UiWorkspaceStatus, UiWorkspaceStatusMeta> =
  UI_WORKSPACE_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s.id]: s }),
    {} as Record<UiWorkspaceStatus, UiWorkspaceStatusMeta>,
  );

export function getUiStatusMeta(id: UiWorkspaceStatus): UiWorkspaceStatusMeta {
  return STATUS_BY_ID[id];
}
