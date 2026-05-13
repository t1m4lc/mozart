import type { Workspace } from './workspace.model';

// Test/Storybook seed. v0.0.1 hydrates from Tauri at boot, so this
// fixture is no longer wired into the store's initial state — it stays
// around so component tests can opt in without a Tauri runtime.
export const WORKSPACES_MOCK: Workspace[] = [
  {
    id: 'w1',
    projectId: 'p1',
    name: 'pavarotti',
    status: 'in_progress',
    pinned: false,
    unread: false,
    pending: false,
    createdAt: new Date('2025-04-15T09:00:00'),
  },
  {
    id: 'w2',
    projectId: 'p1',
    name: 'callas',
    status: 'done',
    pinned: false,
    unread: true,
    pending: false,
    createdAt: new Date('2025-04-10T09:00:00'),
  },
  {
    id: 'w3',
    projectId: 'p2',
    name: 'sinatra',
    status: 'in_review',
    pinned: true,
    unread: false,
    pending: false,
    createdAt: new Date('2025-04-20T09:00:00'),
  },
];
