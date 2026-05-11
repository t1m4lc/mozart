/**
 * `AppShellComponent` — the dark 3-panel root view.
 *
 * Layout (per DESIGN.md):
 *   - Outer host: `display: grid` with two rows: a 36 px top bar +
 *     a 1fr body strip.
 *   - Body strip: `grid-template-columns: var(--sidebar-width) 1fr
 *     var(--right-panel-width)`.
 *   - Below 1100 px viewport width the right `<aside>` collapses (hidden
 *     via `display: none`) — the centre pane expands to fill its track.
 *
 * ARIA landmarks: the top bar component owns `role="banner"`; the
 * sidebar owns `role="navigation"`; this component contributes
 * `role="main"` (centre) + `role="complementary"` (right).
 *
 * Store wiring: `ProjectStore.refresh()` fires automatically via its
 * `withHooks({ onInit })`. `WorkspaceStore.refresh()` is wired the same
 * way upstream — touching it here would be a no-op, but we hold a
 * reference to keep DI alive so the store is created when the shell
 * mounts (otherwise its store wouldn't instantiate until something
 * read from it).
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ProjectStore } from '../state/project.store';
import { WorkspaceStore } from '../state/workspace.store';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { EmptyCenterComponent } from './empty-center.component';
import { EmptyRightComponent } from './empty-right.component';
import { TopBarComponent } from './top-bar.component';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TopBarComponent,
    SidebarComponent,
    EmptyCenterComponent,
    EmptyRightComponent,
  ],
  template: `
    <app-top-bar />
    <div class="shell-grid">
      <app-sidebar />
      <main role="main" aria-label="Workspace conversation">
        <app-empty-center />
      </main>
      <aside role="complementary" aria-label="Workspace changes and terminal">
        <app-empty-right />
      </aside>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: 36px 1fr;
      height: 100vh;
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .shell-grid {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr var(--right-panel-width);
      min-height: 0;
      height: 100%;
    }
    main, aside {
      min-height: 0;
      overflow: hidden;
    }
    main { background: var(--bg-center); }
    aside { background: hsl(var(--card)); border-left: 1px solid hsl(var(--border)); }
    @media (max-width: 1099px) {
      .shell-grid { grid-template-columns: var(--sidebar-width) 1fr; }
      aside { display: none; }
    }
  `,
})
export class AppShellComponent {
  // Hold references so DI instantiates each root-scoped store on shell
  // mount. Stores trigger their own initial `refresh()` via withHooks.
  private readonly projects = inject(ProjectStore);
  private readonly workspaces = inject(WorkspaceStore);

  constructor() {
    // Touch each store so the `inject()` call is preserved across
    // tree-shaking by the Angular compiler. Reading any signal achieves
    // that; this is a no-op at runtime.
    void this.projects.projects;
    void this.workspaces.all;
  }
}
