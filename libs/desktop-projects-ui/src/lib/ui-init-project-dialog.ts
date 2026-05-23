import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

export interface InitProjectContext {
  // Absolute folder path the user picked.
  path: string;
  // Called when the user confirms initialization. The flow that opens
  // the dialog supplies this; the dialog only fires it and closes.
  onConfirm: () => void | Promise<void>;
}

// Dialog shown when the user picks a folder that isn't a git repository.
// Phase 1 omits the GitHub Owner / Repository-name fields — those land
// alongside GitHub auth in a later phase. For now it's a confirmation:
// run `git init` + an initial commit, or cancel.
@Component({
  selector: 'app-init-project-dialog',
  imports: [HlmButtonImports, HlmDialogImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>This folder isn't a git repository. Initialize it?</h3>
    </div>
    <div class="px-6 py-4">
      <p hlmDialogDescription class="text-sm text-muted-foreground">
        Mozart will run
        <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">git init</code>
        in
        <code class="font-mono text-xs bg-muted px-1 py-0.5 rounded">{{
          ctx.path
        }}</code>
        and create an initial commit so the workspace has a branch to
        spawn from. No remote will be configured.
      </p>
    </div>
    <div hlmDialogFooter class="px-6 py-4">
      <button hlmDialogClose hlmBtn variant="outline" type="button">
        Cancel
      </button>
      <button hlmBtn type="button" (click)="confirm()">
        Initialize the project
      </button>
    </div>
  `,
})
export class InitProjectDialog {
  protected readonly ctx = injectBrnDialogContext<InitProjectContext>();
  private readonly _ref = inject(BrnDialogRef);

  protected confirm(): void {
    void this.ctx.onConfirm();
    this._ref.close();
  }
}
