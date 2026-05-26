import type { Project } from '@mozart/desktop-projects-util';

// Test/Storybook fixture. Production hydrates from Tauri at boot.
export const PROJECTS_MOCK: Project[] = [
  {
    id: 'p1',
    name: 'mozart',
    icon: '🧑‍🎤',
    path: '~/dev/mozart',
    hidden: false,
    sortIndex: 0,
    addedAt: new Date('2025-04-01T10:00:00'),
    runCommand: null,
    setupCommand: null,
  },
  {
    id: 'p2',
    name: 'api_server',
    icon: null,
    path: '~/dev/api_server',
    hidden: false,
    sortIndex: 1,
    addedAt: new Date('2025-04-05T10:00:00'),
    runCommand: null,
    setupCommand: null,
  },
  {
    id: 'p3',
    name: 'design_system',
    icon: null,
    path: '~/dev/design_system',
    hidden: false,
    sortIndex: 2,
    addedAt: new Date('2025-04-07T10:00:00'),
    runCommand: null,
    setupCommand: null,
  },
];
