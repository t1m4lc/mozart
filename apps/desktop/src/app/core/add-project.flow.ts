import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HlmDialogService } from '@mozart/ui/dialog';
import { ChatFacade } from '../domains/chat';
import {
  type CloneRepoContext,
  type CreateProjectContext,
  DIALOG_ADAPTER,
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
    const defaultLocation = await this._defaultReposDir();
    const context: CloneRepoContext = {
      defaultLocation,
      doClone: (url, destDir) => this.projects.cloneRepo(url, destDir),
      onCloned: async (path) => {
        await this.addAndOpen(path);
      },
    };
    const { CloneRepoDialog } = await import(
      '../domains/projects/ui-clone-repo-dialog'
    );
    this.dialogService.open(CloneRepoDialog, { context });
  }

  // Dashboard card 3 entry point. Opens the Create project dialog,
  // creates a fresh `<parent>/<name>` folder, then runs init + add
  // without bouncing through the Init confirmation dialog — Quick
  // start implies init.
  async openCreateDialog(): Promise<void> {
    const defaultParent = await this._defaultReposDir();
    const context: CreateProjectContext = {
      defaultParent,
      doCreate: (parent, name) => this.projects.createProjectFolder(parent, name),
      onCreated: async (path) => {
        await this._initAndContinue(path);
      },
    };
    const { CreateProjectDialog } = await import(
      '../domains/projects/ui-create-project-dialog'
    );
    this.dialogService.open(CreateProjectDialog, { context });
  }

  async addAndOpen(path: string): Promise<void> {
    try {
      await this._addAndContinue(path);
    } catch (err) {
      if (this._isNotARepo(err)) {
        void this._openInitDialog(path);
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
    // Fire-and-forget package install. The chat Start tab's empty-state
    // step 4 reflects the running -> success/failed lifecycle. No toast.
    void this.workspaces.runInstall(workspaceId);
  }

  // `add_repo` returns the sentinel `Validation("NotARepo")` when the
  // folder isn't a git repo. The unwrap helper rethrows just the
  // message, so we match on that.
  private _isNotARepo(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    return err.message === 'NotARepo';
  }

  private async _openInitDialog(path: string): Promise<void> {
    const context: InitProjectContext = {
      path,
      onConfirm: async () => {
        await this._initAndContinue(path);
      },
    };
    const { InitProjectDialog } = await import(
      '../domains/projects/ui-init-project-dialog'
    );
    this.dialogService.open(InitProjectDialog, { context });
  }

  // Run `git init` + initial commit at `path`, then re-enter the
  // happy add-project path. Used both by the Init confirmation dialog
  // (after the user agrees) and by Quick start (init is implicit).
  private async _initAndContinue(path: string): Promise<void> {
    try {
      await this.projects.initRepo(path);
      await this._addAndContinue(path);
    } catch (err) {
      console.error('init + add project flow failed', err);
    }
  }

  // Default `<home>/mozart/repos` used as the seed for Clone (Location)
  // and Create (Parent folder) dialogs. Honors the host OS separator so
  // Windows users get a backslash path.
  private async _defaultReposDir(): Promise<string> {
    const home = await this.dialog.homeDir();
    const sep = home.includes('\\') ? '\\' : '/';
    return `${home}${sep}mozart${sep}repos`;
  }
}
