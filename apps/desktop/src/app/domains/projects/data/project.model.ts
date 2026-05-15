// UI ViewModel. The workspace list for a project is NOT denormalized here
// — query the workspaces domain (`workspacesFacade.byProject(id)`) instead.
export interface Project {
  id: string;
  name: string;
  path: string;
  icon: string | null;
  hidden: boolean;
  sortIndex: number;
  addedAt: Date;
  /** Optional dev/run command (e.g. `pnpm dev`). Set via the Run tab.
   *  `null` until the user configures it. */
  runCommand: string | null;
}
