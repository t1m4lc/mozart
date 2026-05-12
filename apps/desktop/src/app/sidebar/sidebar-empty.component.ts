/**
 * `SidebarEmptyComponent` — empty-state card shown by `SidebarComponent`
 * when `ProjectStore.projects()` is `[]`.
 *
 * Post-1.8b refactor: the single `[+ Add repository]` button (which used
 * to open the deleted text-only `AddRepoDialog`) is replaced with the
 * shared `<app-add-project-menu>` trigger, set to the larger `outline`
 * variant with a "+ Open project" label so it reads as a CTA inside the
 * dashed card.
 */
import { ChangeDetectionStrategy, Component } from '@angular/core';

import { AddProjectMenuComponent } from './add-project-menu.component';

@Component({
  selector: 'app-sidebar-empty',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AddProjectMenuComponent],
  host: { class: 'block p-3' },
  template: `
    <div
      class="flex flex-col items-center gap-2.5 p-3 rounded-md border border-dashed border-border bg-transparent text-center"
    >
      <p class="m-0 text-[13px] text-muted-foreground">No projects yet.</p>
      <app-add-project-menu
        variant="outline"
        size="sm"
        label="+ Add repository"
        ariaLabel="Add project"
      />
    </div>
  `,
})
export class SidebarEmptyComponent {}
