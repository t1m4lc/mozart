/**
 * `EmptyCenterComponent` — fills the centre pane when no workspace is
 * selected. S1.8b.5 expanded the scope; the post-1.8b refactor swaps
 * the 0-projects CTA from a single `[+ Add repository]` button (which
 * opened the deleted `AddRepoDialog`) over to the shared
 * `<app-add-project-menu>` trigger.
 *
 *   - **0 projects**: `<app-add-project-menu>` → native folder picker
 *     via `FolderPickerService` (with v0.2 placeholders for GitHub +
 *     Quick start in the menu).
 *   - **≥1 projects, no workspace selected**: `[+ New workspace]` →
 *     opens `CreateWorkspaceDialog` with `lockedRepoId` pre-set to the
 *     currently selected project (so the dialog locks to it).
 *     UNCHANGED by this refactor.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { AddProjectMenuComponent } from '../sidebar/add-project-menu.component';
import { ProjectStore } from '../state/project.store';
import { CreateWorkspaceDialogComponent } from './create-workspace-dialog.component';

@Component({
  selector: 'app-empty-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports, AddProjectMenuComponent],
  host: { class: 'flex items-center justify-center w-full h-full' },
  template: `
    <div class="flex items-center justify-center p-8">
      <div
        class="flex flex-col items-center gap-4 max-w-[420px] p-6 rounded-md border border-border bg-card text-center"
      >
        @if (hasNoProjects()) {
          <p class="m-0 text-sm text-muted-foreground">
            No projects yet. Add a repository to get started.
          </p>
          <app-add-project-menu
            variant="outline"
            size="default"
            label="+ Add repository"
            ariaLabel="Add project"
          />
        } @else {
          <p class="m-0 text-sm text-muted-foreground">
            Pick a workspace from the sidebar, or create a new one.
          </p>
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="openNewWorkspace()"
          >
            + New workspace
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    :host { background: var(--bg-center); }
  `,
})
export class EmptyCenterComponent {
  private readonly projectStore = inject(ProjectStore);
  private readonly dialog = inject(HlmDialogService);

  protected readonly hasNoProjects = computed<boolean>(
    () => this.projectStore.projects().length === 0,
  );

  protected openNewWorkspace(): void {
    const selectedRepoId = this.projectStore.selectedProjectId();
    this.dialog.open(CreateWorkspaceDialogComponent, {
      contentClass: 'w-[480px] max-w-[90vw]',
      showCloseButton: true,
      context: { lockedRepoId: selectedRepoId },
    });
  }
}
