import type { Workspace } from './workspace.model';

// Flat seed for the in-memory workspace store. Each workspace points back
// to its project via `projectId`. Atom 5+ will replace this with a real
// Tauri `list_workspaces` call joined to `repos`.
export const WORKSPACES_MOCK: Workspace[] = [
  {
    id: 'w1',
    projectId: 'p1',
    title: 'feat/shell-resizable',
    status: 'in_progress',
    pinned: false,
    unread: false,
    createdAt: new Date('2025-04-15T09:00:00'),
  },
  {
    id: 'w2',
    projectId: 'p1',
    title: 'fix/tooltip-default',
    status: 'done',
    pinned: false,
    unread: true,
    createdAt: new Date('2025-04-10T09:00:00'),
  },
  {
    id: 'w3',
    projectId: 'p2',
    title: 'feat/auth-middleware',
    status: 'in_review',
    pinned: true,
    unread: false,
    createdAt: new Date('2025-04-20T09:00:00'),
  },
];
