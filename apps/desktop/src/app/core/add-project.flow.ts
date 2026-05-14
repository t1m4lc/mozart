import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HlmDialogService } from '@mozart/ui/dialog';
import { ChatFacade } from '../domains/chat';
import {
  CloneRepoDialog,
  type CloneRepoContext,
  DIALOG_ADAPTER,
  InitProjectDialog,
  type InitProjectContext,
  ProjectsFacade,
} from '../domains/projects';
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
  private readonly dialogService = inject(HlmDialogService);
  private readonly projects = inject(ProjectsFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly chat = inject(ChatFacade);
  private readonly router = inject(Router);

  async openPickerAndOpen(): Promise<void> {
    const path = await this.dialog.pickFolder();
    if (!path) return;
    await this.addAndOpen(path);
  }

  // Dashboard card 2 entry point. Computes the default location
  // (`<home>/mozart/repos`) and opens the Clone dialog. On clone
  // success, hands the cloned path to the shared add-project path so
  // the user lands in a freshly-created workspace just like card 1.
  async openCloneDialog(): Promise<void> {
    const home = await this.dialog.homeDir();
    const sep = home.includes('\\') ? '\\' : '/';
    const defaultLocation = `${home}${sep}mozart${sep}repos`;

    const context: CloneRepoContext = {
      defaultLocation,
      doClone: (url, destDir) => this.projects.cloneRepo(url, destDir),
      onCloned: async (path) => {
        await this.addAndOpen(path);
      },
    };
    this.dialogService.open(CloneRepoDialog, { context });
  }

  async addAndOpen(path: string): Promise<void> {
    try {
      await this._addAndContinue(path);
    } catch (err) {
      if (this._isNotARepo(err)) {
        this._openInitDialog(path);
        return;
      }
      console.error('add project flow failed', err);
    }
  }

  // Runs the full happy-path: register the project, locate or create
  // a workspace, hydrate its first "Start" chat, navigate. Throws on
  // the first Tauri failure; the caller decides whether to react.
  private async _addAndContinue(path: string): Promise<void> {
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

  // `add_repo` returns the sentinel `Validation("NotARepo")` when the
  // folder isn't a git repo. The unwrap helper rethrows just the
  // message, so we match on that.
  private _isNotARepo(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return err.message === 'NotARepo';
  }

  private _openInitDialog(path: string): void {
    const context: InitProjectContext = {
      path,
      onConfirm: async () => {
        try {
          await this.projects.initRepo(path);
          await this._addAndContinue(path);
        } catch (err) {
          console.error('init + add project flow failed', err);
        }
      },
    };
    this.dialogService.open(InitProjectDialog, { context });
  }
}
