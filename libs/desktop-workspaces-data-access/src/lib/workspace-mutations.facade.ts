import { Injectable, inject } from '@angular/core';
import {
  FileViewsFacade,
  RepositoriesFacade,
} from '@mozart/desktop-repositories-data-access';
import { WorkspacesFacade } from './workspace.facade';

// Cross-domain post-mutation choreography for a workspace. Centralises
// the four refreshes that have to run after any state-touching git
// operation (stage / unstage / discard / save / commit) so the
// callers don't each have to remember the recipe — and so adding a
// fifth refresh later is a one-line change instead of a grep.
//
// Lives in `workspaces-data-access` because the fan-out touches both
// `repositories-data-access` (tree + changed files) and the workspaces
// facade itself (diff stats). A free helper inside `workspaces-feature`
// was the cheaper option (plan §9.3) but the facade is the right
// long-term home — future mutation flows (post-merge, post-PR-create,
// post-branch-switch) can slot in here without re-touching the consumer
// sites.
@Injectable({ providedIn: 'root' })
export class WorkspaceMutationsFacade {
  private readonly repos = inject(RepositoriesFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly fileViews = inject(FileViewsFacade);

  /** Refresh tree + changed files + diff stats + file views in
   *  parallel after any mutation that may have changed the working
   *  tree. Each underlying refresh is fire-and-forget (cache-and-swap
   *  on success, leaves previous data on failure); errors are
   *  swallowed at the call site so a single failed refresh doesn't
   *  poison the others. */
  softRefreshAfterMutation(workspaceId: string): void {
    void this.repos.refreshTreeInBackground(workspaceId);
    void this.repos.refreshChangedFilesInBackground(workspaceId);
    void this.workspaces.refreshDiffStats();
    void this.fileViews.refresh(workspaceId).catch((err) => {
      console.warn(
        '[workspace-mutations] refresh file views failed:',
        err,
      );
    });
  }
}
