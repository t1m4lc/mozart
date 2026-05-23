import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmEmptyImports } from '@spartan-ui/empty';

@Component({
  selector: 'app-projects-empty-state',
  imports: [HlmEmptyImports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmEmpty class="gap-1 rounded-md border p-3">
      <p class="text-xs text-muted-foreground">No projects yet.</p>
      <p class="text-xs text-muted-foreground/70">Use + to open a project.</p>
    </div>
  `,
})
export class ProjectsEmptyState {}
