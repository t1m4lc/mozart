import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import type { Project } from '../../data/project.model';

export interface ConfirmDeleteProjectContext {
  project: Project;
  onConfirm: () => void;
}

@Component({
  selector: 'app-confirm-delete-project-dialog',
  imports: [HlmButtonImports, HlmDialogImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Remove "{{ ctx.project.title }}"?</h3>
    </div>
    <p hlmDialogDescription class="text-sm text-muted-foreground px-6">
      The source repository at
      <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">{{
        ctx.project.path
      }}</code>
      will not be deleted. Only this project will be removed from Mozart.
    </p>
    <div hlmDialogFooter class="mt-2">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button hlmBtn variant="destructive" type="button" (click)="confirm()">
        Remove project
      </button>
    </div>
  `,
})
export class ConfirmDeleteProjectDialog {
  protected readonly ctx = injectBrnDialogContext<ConfirmDeleteProjectContext>();
  private readonly _ref = inject(BrnDialogRef);

  protected confirm(): void {
    this.ctx.onConfirm();
    this._ref.close();
  }
}
