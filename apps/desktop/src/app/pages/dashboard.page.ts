import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmCardImports } from '@mozart/ui/card';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolderOpen,
  lucideGithub,
  lucideZap,
} from '@ng-icons/lucide';
import { AddProjectFlow } from '../core/add-project.flow';
import { WorkspacesFacade } from '../domains/workspaces';

// Phase 1 dashboard. Renders when no workspace is selected (`/`).
// Three large cards in a horizontal row; clicking one runs the unified
// AddProjectFlow. Cards 2 + 3 are stubs until Atoms 5 + 6 land the
// Clone GitHub repo / Create project dialogs.
@Component({
  selector: 'app-dashboard-page',
  imports: [NgIcon, HlmCardImports, HlmIconImports],
  providers: [
    provideIcons({ lucideFolderOpen, lucideGithub, lucideZap }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full items-center justify-center p-8' },
  template: `
    <div class="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
      <button
        type="button"
        hlmCard
        class="cursor-pointer p-6 text-left transition hover:bg-accent"
        (click)="onOpenProject()"
      >
        <div class="mb-3 flex size-10 items-center justify-center rounded-md bg-muted">
          <ng-icon hlm name="lucideFolderOpen" size="base" />
        </div>
        <h2 class="text-base font-medium">Open project</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Add an existing folder as a Mozart project.
        </p>
      </button>

      <button
        type="button"
        hlmCard
        class="cursor-pointer p-6 text-left transition hover:bg-accent"
        (click)="onOpenGithubProject()"
      >
        <div class="mb-3 flex size-10 items-center justify-center rounded-md bg-muted">
          <ng-icon hlm name="lucideGithub" size="base" />
        </div>
        <h2 class="text-base font-medium">Open GitHub project</h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Clone a repo from GitHub and start working.
        </p>
      </button>

      <button
        type="button"
        hlmCard
        disabled
        class="cursor-not-allowed p-6 text-left opacity-50"
      >
        <div class="mb-3 flex size-10 items-center justify-center rounded-md bg-muted">
          <ng-icon hlm name="lucideZap" size="base" />
        </div>
        <h2 class="text-base font-medium">
          Quick start
          <span class="ml-1 text-xs font-normal text-muted-foreground">Soon</span>
        </h2>
        <p class="mt-1 text-sm text-muted-foreground">
          Create a local folder and an empty project.
        </p>
      </button>
    </div>
  `,
})
export class DashboardPage {
  private readonly addProjectFlow = inject(AddProjectFlow);

  constructor() {
    // Clear active workspace so the shell knows we are not in a
    // workspace context (drives right-aside visibility).
    inject(WorkspacesFacade).setActive(null);
  }

  protected async onOpenProject(): Promise<void> {
    try {
      await this.addProjectFlow.openPickerAndOpen();
    } catch (err) {
      console.error('add project flow failed', err);
    }
  }

  protected async onOpenGithubProject(): Promise<void> {
    try {
      await this.addProjectFlow.openCloneDialog();
    } catch (err) {
      console.error('clone repo flow failed', err);
    }
  }
}
