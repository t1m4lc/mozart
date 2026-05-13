import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { HlmEmptyImports } from '@mozart/ui/empty';

@Component({
  selector: 'app-workspace-empty-state',
  imports: [HlmEmptyImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmEmpty class="gap-1 rounded-md border p-3">
      <p class="text-xs text-muted-foreground">No workspaces yet</p>
      <button
        type="button"
        class="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        (click)="create.emit()"
      >
        Create one
      </button>
    </div>
  `,
})
export class WorkspaceEmptyState {
  readonly create = output<void>();
}
