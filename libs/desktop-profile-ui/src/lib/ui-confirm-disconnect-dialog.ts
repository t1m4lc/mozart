import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

export interface ConfirmDisconnectContext {
  onConfirm: () => void;
}

// Confirms removal of the stored Anthropic key. Matches the projects
// domain's destructive-action pattern (ui-confirm-delete-project-dialog).
// The dialog never sees the key — it only carries an intent.
@Component({
  selector: 'app-ui-confirm-disconnect-dialog',
  imports: [HlmButtonImports, HlmDialogImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>Remove your stored API key?</h3>
    </div>
    <div class="px-6 py-4">
      <p hlmDialogDescription class="text-sm text-muted-foreground">
        Mozart will no longer be able to use it. You can re-paste it any time.
      </p>
    </div>
    <div hlmDialogFooter class="px-6 py-4">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button hlmBtn variant="destructive" type="button" (click)="confirm()">
        Disconnect
      </button>
    </div>
  `,
})
export class UiConfirmDisconnectDialog {
  protected readonly ctx =
    injectBrnDialogContext<ConfirmDisconnectContext>();
  private readonly _ref = inject(BrnDialogRef);

  protected confirm(): void {
    this.ctx.onConfirm();
    this._ref.close();
  }
}
