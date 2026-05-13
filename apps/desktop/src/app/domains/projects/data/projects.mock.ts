import type { Project } from './project.model';

// Seed for the in-memory store until Atom 5 wires the Tauri `list_repos`
// command.
export const PROJECTS_MOCK: Project[] = [
  {
    id: 'p1',
    name: 'mozart',
    icon: '🧑‍🎤',
    path: '~/dev/mozart',
    hidden: false,
    addedAt: new Date('2025-04-01T10:00:00'),
  },
  {
    id: 'p2',
    name: 'api_server',
    icon: null,
    path: '~/dev/api_server',
    hidden: false,
    addedAt: new Date('2025-04-05T10:00:00'),
  },
  {
    id: 'p3',
    name: 'design_system',
    icon: null,
    path: '~/dev/design_system',
    hidden: false,
    addedAt: new Date('2025-04-07T10:00:00'),
  },
];
