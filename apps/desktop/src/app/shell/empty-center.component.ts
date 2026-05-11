/**
 * `EmptyCenterComponent` — fills the centre pane when no workspace is
 * selected. S1.8b.5 expanded the scope: the component now reads
 * `ProjectStore.projects()` and renders the appropriate next-step CTA.
 *
 *   - **0 projects**: "+ Add repository" → opens `AddRepoDialog`.
 *   - **≥1 projects, no workspace selected**: "+ New workspace" →
 *     opens `CreateWorkspaceDialog` with `lockedRepoId` pre-set to
 *     the currently selected project (so the dialog locks to it).
 *
 * Both buttons are now enabled — no more disabled/tooltip placeholder.
 */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { ProjectStore } from '../state/project.store';
import { AddRepoDialogComponent } from './add-repo-dialog.component';
import { CreateWorkspaceDialogComponent } from './create-workspace-dialog.component';

@Component({
  selector: 'app-empty-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports],
  template: `
    <div class="wrap">
      <div class="card">
        @if (hasNoProjects()) {
          <p class="copy">
            No projects yet. Add a repository to get started.
          </p>
          <button
            hlmBtn
            variant="outline"
            type="button"
            class="add-repo-btn"
            (click)="openAddRepo()"
          >
            + Add repository
          </button>
        } @else {
          <p class="copy">
            Pick a workspace from the sidebar, or create a new one.
          </p>
          <button
            hlmBtn
            variant="outline"
            type="button"
            class="new-workspace-btn"
            (click)="openNewWorkspace()"
          >
            + New workspace
          </button>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: var(--bg-center);
    }
    .wrap { display: flex; align-items: center; justify-content: center; padding: 32px; }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      max-width: 420px;
      padding: 24px;
      border: 1px solid hsl(var(--border));
      border-radius: var(--radius-md);
      background: hsl(var(--card));
      text-align: center;
    }
    .copy {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 14px;
      color: hsl(var(--muted-foreground));
    }
  `,
})
export class EmptyCenterComponent {
  private readonly projectStore = inject(ProjectStore);
  private readonly dialog = inject(HlmDialogService);

  protected readonly hasNoProjects = computed<boolean>(
    () => this.projectStore.projects().length === 0,
  );

  protected openAddRepo(): void {
    this.dialog.open(AddRepoDialogComponent, {
      contentClass: 'w-[480px] max-w-[90vw]',
      showCloseButton: true,
    });
  }

  protected openNewWorkspace(): void {
    const selectedRepoId = this.projectStore.selectedProjectId();
    this.dialog.open(CreateWorkspaceDialogComponent, {
      contentClass: 'w-[480px] max-w-[90vw]',
      showCloseButton: true,
      context: { lockedRepoId: selectedRepoId },
    });
  }
}
