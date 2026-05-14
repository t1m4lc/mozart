import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ChatFacade } from '../domains/chat';
import { DIALOG_ADAPTER, ProjectsFacade } from '../domains/projects';
import { WorkspacesFacade } from '../domains/workspaces';

// Unified add-project flow used by Phase 1's three dashboard cards and
// the sidebar "+ Add a project" affordance. All entry points converge
// here so the resulting state is identical: project row inserted, first
// workspace + chat created eagerly, route advanced to /workspaces/:id.
//
// Idempotency: if the picked folder is already a registered project and
// already has a workspace, navigates to the existing workspace instead
// of creating a duplicate. Surfaces the same user-visible end state.
@Injectable({ providedIn: 'root' })
export class AddProjectFlow {
  private readonly dialog = inject(DIALOG_ADAPTER);
  private readonly projects = inject(ProjectsFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly chat = inject(ChatFacade);
  private readonly router = inject(Router);

  async openPickerAndOpen(): Promise<void> {
    const path = await this.dialog.pickFolder();
    if (!path) return;
    await this.addAndOpen(path);
  }

  async addAndOpen(path: string): Promise<void> {
    const project = await this.projects.add(path);

    const existing = this.workspaces.byProject(project.id)();
    if (existing.length > 0) {
      await this.router.navigate(['/workspaces', existing[0].id]);
      return;
    }

    const workspaceId = await this.workspaces.createForPrompt({
      projectId: project.id,
    });
    // Eagerly hydrate so the first "Start" chat lands before navigation.
    // hydrate() is idempotent and creates the chat lazily when none
    // exists, persisting the title server-side.
    await this.chat.hydrate(workspaceId);
    await this.router.navigate(['/workspaces', workspaceId]);
  }
}
