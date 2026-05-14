import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { WorkspacesFacade } from '../domains/workspaces';

// Phase 1 dashboard. Renders when no workspace is selected (`/`).
// Atom 2 ships the route + state-coherence wiring; the three cards
// (Open project / Open GitHub project / Quick start) land in Atom 3.
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full items-center justify-center' },
  template: `
    <div class="text-center text-muted-foreground">
      <h1 class="text-xl font-medium">Mozart</h1>
      <p class="mt-2 text-sm">Dashboard — Atom 3 fills the three action cards here.</p>
    </div>
  `,
})
export class DashboardPage {
  constructor() {
    // Clear active workspace so the shell knows we are not in a
    // workspace context (drives right-aside visibility).
    inject(WorkspacesFacade).setActive(null);
  }
}
