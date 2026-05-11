/**
 * `SidebarEmptyComponent` — empty-state card shown by `SidebarComponent`
 * when `ProjectStore.projects()` is `[]`. Wires the
 * `[+ Add repository]` CTA to the `AddRepoDialog` (S1.8b.5).
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogService } from '@mozart/ui/dialog';
import { AddRepoDialogComponent } from '../shell/add-repo-dialog.component';

@Component({
  selector: 'app-sidebar-empty',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmButtonImports],
  template: `
    <div class="card">
      <p class="copy">No projects yet.</p>
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        class="add-repo-btn"
        (click)="openAddRepo()"
      >
        + Add repository
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 12px;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border: 1px dashed hsl(var(--border));
      border-radius: var(--radius-md);
      background: transparent;
      text-align: center;
    }
    .copy {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 13px;
      color: hsl(var(--muted-foreground));
    }
  `,
})
export class SidebarEmptyComponent {
  private readonly dialog = inject(HlmDialogService);

  protected openAddRepo(): void {
    this.dialog.open(AddRepoDialogComponent, {
      contentClass: 'w-[480px] max-w-[90vw]',
      showCloseButton: true,
    });
  }
}
