import { Injectable, inject } from '@angular/core';
import type { FileNode } from './file-node.model';
import { REPOSITORIES_ADAPTER } from './repositories.adapter';

/**
 * Public API of the `repositories` domain. Thin wrapper over the
 * adapter port — domain-internal state will land here when Atom D adds
 * caching / per-workspace memoization.
 */
@Injectable({ providedIn: 'root' })
export class RepositoriesFacade {
  private readonly adapter = inject(REPOSITORIES_ADAPTER);

  /** Single-shot fetch of the workspace's file tree. */
  async loadTree(
    workspaceId: string,
    showIgnored: boolean,
  ): Promise<FileNode[]> {
    return this.adapter.listTree(workspaceId, showIgnored);
  }

  /**
   * Subscribe to FS-change pings for the workspace. The caller must
   * invoke the returned unsubscribe on teardown.
   */
  async watch(
    workspaceId: string,
    onChange: () => void,
  ): Promise<() => void> {
    return this.adapter.watchTree(workspaceId, onChange);
  }

  /** Diff the file vs. the workspace's base branch (working tree). */
  async loadFileDiff(workspaceId: string, path: string): Promise<string> {
    return this.adapter.getFileDiff(workspaceId, path);
  }
}
