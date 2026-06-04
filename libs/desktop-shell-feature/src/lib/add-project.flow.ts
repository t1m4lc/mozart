import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HlmDialogService } from '@spartan-ui/dialog';
import { toast } from '@spartan-ng/brain/sonner';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import {
  DIALOG_ADAPTER,
  ProjectsFacade,
} from '@mozart/desktop-projects-data-access';
import {
  CloneRepoDialog,
  // CreateProjectDialog,
  type CloneRepoContext,
  // type CreateProjectContext,
} from '@mozart/desktop-projects-feature';
import {
  InitProjectDialog,
  type InitProjectContext,
} from '@mozart/desktop-projects-ui';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';
import { workspaceRouteCommands } from '@mozart/desktop-workspaces-util';

// Unified add-project flow used by Phase 1's three dashboard cards and
// the sidebar "+ Add a project" affordance. All entry points converge
// here so the resulting state is identical: project row inserted, first
// workspace + chat created eagerly, route advanced to /project/:projectId/workspace/:workspaceId.
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
  // (`<home>/mozart/projects`) and opens the Clone dialog. On clone
  // success, hands the cloned path to the shared add-project path so
  // the user lands in a freshly-created workspace just like card 1.
  async openCloneDialog(): Promise<void> {
    const defaultLocation = await this._defaultProjectsDir();
    const context: CloneRepoContext = {
      defaultLocation,
      doClone: (url, destDir) => this.projects.cloneRepo(url, destDir),
      onCloned: async (path) => {
        await this.addAndOpen(path);
      },
    };
    this.dialogService.open(CloneRepoDialog, {
      context,
      contentClass: 'sm:max-w-xl max-h-[calc(100vh-4rem)] overflow-hidden',
    });
  }

  // Dashboard card 3 entry point. Opens the Create project dialog,
  // creates a fresh `<parent>/<name>` folder, then runs init + add
  // without bouncing through the Init confirmation dialog — Quick
  // start implies init.
  //
  // Disabled: Quickstart entry points are hidden behind `disabled` in
  // the sidebar/header/empty-state menus. Re-enable when the
  // CreateProjectDialog UX is finalized. Keeping the method body
  // commented (not deleted) so the wiring is one uncomment away.
  // async openCreateDialog(): Promise<void> {
  //   const defaultParent = await this._defaultProjectsDir();
  //   const context: CreateProjectContext = {
  //     defaultParent,
  //     doCreate: (parent, name) => this.projects.createProjectFolder(parent, name),
  //     onCreated: async (path) => {
  //       await this._initAndContinue(path);
  //     },
  //   };
  //   this.dialogService.open(CreateProjectDialog, { context });
  // }

  async addAndOpen(path: string): Promise<void> {
    try {
      await this._bootstrapAndContinue(path);
    } catch (err) {
      if (this._isNotARepo(err)) {
        void this._openInitDialog(path);
        return;
      }
      // P0.3 toast template: "Couldn't open <basename>. <reason>."
      toast.error(`Couldn't open ${this._basename(path)}`, {
        description: this._reasonFromError(err),
      });
      console.error('open project flow failed', err);
    }
  }

  // P0.3 happy path: one Tauri call writes everything, then hydrate the
  // dependent stores and route into the workspace.
  //
  // Idempotency is enforced by the backend: bootstrap_project resolves
  // an existing repo row by path instead of creating a duplicate, so
  // re-opening the same folder lands the user back in the first
  // workspace without leaving stray rows behind.
  private async _bootstrapAndContinue(path: string): Promise<void> {
    const result = await this.projects.bootstrap(path);

    // Re-hydrate the workspace list so the freshly-created row appears
    // in the sidebar without waiting for a refresh.
    await this.workspaces.loadAll();
    // Hydrate the chat list — the 'Start' chat + the one-time
    // system_info entry land here. hydrate() is idempotent.
    await this.chat.hydrate(result.firstWorkspaceId);

    await this.router.navigate(
      workspaceRouteCommands(result.project.id, result.firstWorkspaceId),
    );
    // Kick the setup auto-run for the new worktree. Fire-and-forget so
    // navigation isn't blocked; `installFor` carries the lifecycle for
    // the live chat ready-state + the Setup tab. Identical to the
    // generated-workspace path (`createForPrompt`), so both flows land
    // on the same screen.
    void this.workspaces.runInstall(result.firstWorkspaceId);
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
    this.dialogService.open(InitProjectDialog, { context });
  }

  // Run `git init` + initial commit at `path`, then re-enter the
  // happy add-project path. Used both by the Init confirmation dialog
  // (after the user agrees) and by Quick start (init is implicit).
  private async _initAndContinue(path: string): Promise<void> {
    try {
      await this.projects.initRepo(path);
      await this._bootstrapAndContinue(path);
    } catch (err) {
      toast.error(`Couldn't open ${this._basename(path)}`, {
        description: this._reasonFromError(err),
      });
      console.error('init + open project flow failed', err);
    }
  }

  private _basename(path: string): string {
    // Honor both OS separators since the picker on Windows hands back
    // a path with backslashes.
    const trimmed = path.replace(/[/\\]+$/, '');
    const idx = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
    return idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  }

  private _reasonFromError(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    return 'Unknown error';
  }

  // Single source of truth for the user-facing default location used
  // by Clone (Location) and Create (Parent folder) dialogs. Honors the
  // host OS separator so Windows users get a backslash path. Stays
  // distinct from `~/.mozart/projects` (the leading-dot Mozart-internal
  // sandbox dir) — this one is a top-level `mozart/projects` folder
  // the user owns and can move freely.
  private async _defaultProjectsDir(): Promise<string> {
    const home = await this.dialog.homeDir();
    const sep = home.includes('\\') ? '\\' : '/';
    return `${home}${sep}mozart${sep}projects`;
  }
}
