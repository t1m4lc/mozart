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
  template: `
    <div class="card">
      <p class="copy">No projects yet.</p>
      <app-add-project-menu
        class="add-repo-menu"
        variant="outline"
        size="sm"
        label="+ Add repository"
        ariaLabel="Add project"
      />
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 12px;
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 12px;
      border: 1px dashed hsl(var(--border));
      border-radius: var(--radius-md);
      background: transparent;
      text-align: center;
    }
    .copy {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 13px;
      color: hsl(var(--muted-foreground));
    }
  `,
})
export class SidebarEmptyComponent {}
