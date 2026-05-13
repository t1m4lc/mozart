import type { Workspace } from './workspace.model';

export interface Project {
  id: string;
  title: string;
  path: string;
  icon: string | null;
  hidden: boolean;
  addedAt: Date;
  workspaces: Workspace[];
}
