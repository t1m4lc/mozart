import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

export interface ConfirmDiscardChangesContext {
  /** Path the user right-clicked. Shown for context — the actual
   *  destructive op is workspace-wide (see CLAUDE.md vocabulary: the
   *  menu surfaces on a file row but `Discard changes` reuses the
   *  existing workspace-level reset, not a per-file restore). */
  readonly path: string;
  readonly onConfirm: () => void | Promise<void>;
}

@Component({
  selector: 'app-ui-confirm-discard-changes-dialog',
  imports: [HlmButtonImports, HlmDialogImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>Discard all changes since the last agent run?</h3>
    </div>
    <div class="px-6 py-4">
      <p hlmDialogDescription class="text-sm text-muted-foreground">
        Right-clicked from
        <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">{{
          ctx.path
        }}</code
        >. This resets the whole workspace to the most recent agent-run
        checkpoint. You cannot undo it.
      </p>
    </div>
    <div hlmDialogFooter class="px-6 py-4">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button hlmBtn variant="destructive" type="button" (click)="confirm()">
        Discard changes
      </button>
    </div>
  `,
})
export class UiConfirmDiscardChangesDialog {
  protected readonly ctx =
    injectBrnDialogContext<ConfirmDiscardChangesContext>();
  private readonly _ref = inject(BrnDialogRef);

  protected confirm(): void {
    void this.ctx.onConfirm();
    this._ref.close();
  }
}
