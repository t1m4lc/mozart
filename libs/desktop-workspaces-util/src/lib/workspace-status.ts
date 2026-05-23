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
}

export const UI_WORKSPACE_STATUSES: readonly UiWorkspaceStatusMeta[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
  { id: 'canceled', label: 'Canceled' },
] as const;

const STATUS_BY_ID: Record<UiWorkspaceStatus, UiWorkspaceStatusMeta> =
  UI_WORKSPACE_STATUSES.reduce(
    (acc, s) => ({ ...acc, [s.id]: s }),
    {} as Record<UiWorkspaceStatus, UiWorkspaceStatusMeta>,
  );

export function getUiStatusMeta(id: UiWorkspaceStatus): UiWorkspaceStatusMeta {
  return STATUS_BY_ID[id];
}
