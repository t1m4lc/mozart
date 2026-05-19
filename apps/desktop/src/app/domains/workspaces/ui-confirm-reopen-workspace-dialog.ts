import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

export interface ConfirmReopenWorkspaceContext {
  onConfirm: () => void | Promise<void>;
}

// Vocabulary lock (plan P0.2): copy here is exact and must not be
// paraphrased. Title doubles as the reopen-action label so the dialog
// reads as a sentence with its trigger.
@Component({
  selector: 'app-confirm-reopen-workspace-dialog',
  imports: [HlmButtonImports, HlmDialogImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>Workspace is done, reopen it?</h3>
    </div>
    <div class="px-6 py-4">
      <p hlmDialogDescription class="text-sm text-muted-foreground">
        You'll be able to edit and run agents again.
      </p>
    </div>
    <div hlmDialogFooter class="px-6 py-4">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button hlmBtn variant="default" type="button" (click)="confirm()">
        Reopen workspace
      </button>
    </div>
  `,
})
export class ConfirmReopenWorkspaceDialog {
  protected readonly ctx =
    injectBrnDialogContext<ConfirmReopenWorkspaceContext>();
  private readonly _ref = inject(BrnDialogRef);

  protected confirm(): void {
    void this.ctx.onConfirm();
    this._ref.close();
  }
}
