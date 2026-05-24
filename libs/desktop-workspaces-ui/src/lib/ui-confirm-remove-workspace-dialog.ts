import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideTriangleAlert } from '@ng-icons/lucide';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import type { Workspace } from '@mozart/desktop-workspaces-util';

export interface ConfirmRemoveWorkspaceContext {
  workspace: Workspace;
  hasUncommittedChanges: boolean;
  prNotSent: boolean;
  onConfirm: () => void | Promise<void>;
}

@Component({
  selector: 'app-confirm-remove-workspace-dialog',
  imports: [HlmButtonImports, HlmDialogImports, HlmIconImports, NgIcon],
  providers: [provideIcons({ lucideTriangleAlert })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>Remove "{{ ctx.workspace.name }}"?</h3>
    </div>
    <div class="px-6 py-4 space-y-3">
      <p hlmDialogDescription class="text-sm text-muted-foreground">
        This will permanently delete the workspace and all its local files.
        This action can't be undone.
      </p>
      @if (ctx.hasUncommittedChanges || ctx.prNotSent) {
        <div
          class="flex gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200"
        >
          <ng-icon
            hlm
            name="lucideTriangleAlert"
            size="xs"
            class="mt-0.5 shrink-0"
          />
          <ul class="space-y-1">
            @if (ctx.hasUncommittedChanges) {
              <li>This workspace has uncommitted changes.</li>
            }
            @if (ctx.prNotSent) {
              <li>No pull request has been created for this workspace yet.</li>
            }
          </ul>
        </div>
      }
    </div>
    <div hlmDialogFooter class="px-6 py-4">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button hlmBtn variant="destructive" type="button" (click)="confirm()">
        Remove workspace
      </button>
    </div>
  `,
})
export class ConfirmRemoveWorkspaceDialog {
  protected readonly ctx =
    injectBrnDialogContext<ConfirmRemoveWorkspaceContext>();
  private readonly _ref = inject(BrnDialogRef);

  protected confirm(): void {
    void this.ctx.onConfirm();
    this._ref.close();
  }
}
