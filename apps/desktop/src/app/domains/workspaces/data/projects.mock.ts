import type { Project } from './project.model';

// TODO: remplacer par appel HTTP/Tauri réel (list_projects_with_workspaces)
//       once the backend command + ui_status/pinned/unread columns ship.
export const PROJECTS_MOCK: Project[] = [
  {
    id: 'p1',
    title: 'mozart',
    icon: '🧑‍🎤',
    path: '~/dev/mozart',
    hidden: false,
    addedAt: new Date('2025-04-01T10:00:00'),
    workspaces: [
      {
        id: 'w1',
        title: 'feat/shell-resizable',
        status: 'in_progress',
        pinned: false,
        unread: false,
        createdAt: new Date('2025-04-15T09:00:00'),
      },
      {
        id: 'w2',
        title: 'fix/tooltip-default',
        status: 'done',
        pinned: false,
        unread: true,
        createdAt: new Date('2025-04-10T09:00:00'),
      },
    ],
  },
  {
    id: 'p2',
    title: 'api_server',
    icon: null,
    path: '~/dev/api_server',
    hidden: false,
    addedAt: new Date('2025-04-05T10:00:00'),
    workspaces: [
      {
        id: 'w3',
        title: 'feat/auth-middleware',
        status: 'in_review',
        pinned: true,
        unread: false,
        createdAt: new Date('2025-04-20T09:00:00'),
      },
    ],
  },
  {
    id: 'p3',
    title: 'design_system',
    icon: null,
    path: '~/dev/design_system',
    hidden: false,
    addedAt: new Date('2025-04-07T10:00:00'),
    workspaces: [],
  },
];
