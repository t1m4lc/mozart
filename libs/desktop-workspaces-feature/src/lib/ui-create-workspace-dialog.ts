import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmComboboxImports } from '@spartan-ui/combobox';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';

// Context handed to the dialog by the opener (shell-project-list). Kept as
// data + a callback so the dialog stays a dumb form view — no facade/router
// graph to wire up in a test.
export interface CreateWorkspaceContext {
  /** Branches the worktree can fork from. */
  branches: readonly string[];
  /** Pre-selected branch (the project's resolved `git.baseBranch`). */
  defaultBranch: string;
  /** Fork a workspace from `baseBranch`. Rejects on failure (the opener
   *  toasts); the dialog stays open so the user can retry. */
  onCreate: (baseBranch: string) => Promise<void>;
}

// "New workspace from branch…" dialog. Lets the user override the default
// base branch via a spartan combobox before forking a workspace. The instant
// "+" affordance keeps using the configured default; this is the opt-in path.
@Component({
  selector: 'app-create-workspace-dialog',
  imports: [HlmButtonImports, HlmComboboxImports, HlmDialogImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-4 pt-4">
      <h3 hlmDialogTitle>New workspace from</h3>
    </div>

    <div class="space-y-3 p-4">
      <hlm-combobox
        [value]="selected()"
        (valueChange)="selected.set($event ?? '')"
        [itemToString]="_itemToString"
        [autoHighlight]="true"
      >
        <hlm-combobox-trigger class="w-full">
          <hlm-combobox-value placeholder="Select a branch" />
        </hlm-combobox-trigger>
        <hlm-combobox-content>
          <hlm-combobox-input placeholder="Search branches…" />
          <ul hlmComboboxList>
            <hlm-combobox-empty>No branches found</hlm-combobox-empty>
            @for (branch of ctx.branches; track branch) {
              <hlm-combobox-item [value]="branch">{{ branch }}</hlm-combobox-item>
            }
          </ul>
        </hlm-combobox-content>
      </hlm-combobox>

      <div hlmDialogFooter>
        <button hlmBtn variant="outline" (click)="close()" [disabled]="busy()">
          Cancel
        </button>
        <button hlmBtn (click)="create()" [disabled]="busy() || !selected()">
          Create
        </button>
      </div>
    </div>
  `,
})
export class CreateWorkspaceDialog {
  protected readonly ctx = injectBrnDialogContext<CreateWorkspaceContext>();
  private readonly ref = inject(BrnDialogRef);

  protected readonly selected = signal<string>(this.ctx.defaultBranch);
  protected readonly busy = signal(false);

  protected readonly _itemToString = (branch: string): string => branch;

  protected close(): void {
    this.ref.close();
  }

  protected async create(): Promise<void> {
    const branch = this.selected();
    if (!branch || this.busy()) return;
    this.busy.set(true);
    try {
      await this.ctx.onCreate(branch);
      this.ref.close();
    } catch {
      // The opener surfaces the error toast; leave the dialog open to retry.
      this.busy.set(false);
    }
  }
}
