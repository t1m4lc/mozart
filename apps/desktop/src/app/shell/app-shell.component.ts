/**
 * `AppShellComponent` — the dark 3-panel root view.
 *
 * Layout (per DESIGN.md):
 *   - Outer host: `display: grid` with two rows: a 36 px top bar +
 *     a 1fr body strip.
 *   - Body strip: `grid-template-columns: var(--sidebar-width) 1fr
 *     var(--right-panel-width)` when the right pane is visible,
 *     `var(--sidebar-width) 1fr` when hidden — the centre pane fills
 *     the freed track.
 *   - Below 1100 px viewport width the right `<aside>` collapses (hidden
 *     via `display: none`) — the centre pane expands to fill its track.
 *
 * ARIA landmarks: the top bar component owns `role="banner"`; the
 * sidebar owns `role="navigation"`; this component contributes
 * `role="main"` (centre) + `role="complementary"` (right).
 *
 * Store wiring:
 *   - `ProjectStore.refresh()` and `WorkspaceStore.refresh()` fire via
 *     each store's `withHooks({ onInit })`. We hold references to keep
 *     DI alive so the stores instantiate when the shell mounts.
 *   - `ShellStore` drives `centerView()` (chat vs empty placeholder) and
 *     `showRightPanel()` (right aside visibility). It reads
 *     `WorkspaceStore.selectedWorkspaceId()` via a computed — no
 *     duplicated state lives in the shell store.
 *
 * Center routing: S1.8b.4 will swap the `chat` branch for
 * `<app-chat-panel />`. Until then both branches render the empty-center
 * placeholder so the switch is visible in DevTools.
 */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ProjectStore } from '../state/project.store';
import { ShellStore } from '../state/shell.store';
import { WorkspaceStore } from '../state/workspace.store';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { ChatPanelComponent } from './chat-panel.component';
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
    ChatPanelComponent,
    EmptyCenterComponent,
    EmptyRightComponent,
  ],
  template: `
    <app-top-bar />
    <div class="shell-grid" [class.no-right]="!shellStore.showRightPanel()">
      <app-sidebar />
      <main role="main" aria-label="Workspace conversation">
        @if (shellStore.centerView() === 'chat') {
          <app-chat-panel />
        } @else {
          <app-empty-center />
        }
      </main>
      @if (shellStore.showRightPanel()) {
        <aside role="complementary" aria-label="Workspace changes and terminal">
          <app-empty-right />
        </aside>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-rows: 32px 1fr;
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
    .shell-grid.no-right {
      grid-template-columns: var(--sidebar-width) 1fr;
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
  // mount. ProjectStore and WorkspaceStore trigger their own initial
  // `refresh()` via withHooks; without these injects they wouldn't wake
  // up until some other consumer read from them.
  private readonly projects = inject(ProjectStore);
  private readonly workspaces = inject(WorkspaceStore);
  // ShellStore drives the centre route + right-panel visibility.
  protected readonly shellStore = inject(ShellStore);

  constructor() {
    // Touch each store so the `inject()` call is preserved across
    // tree-shaking by the Angular compiler. Reading any signal achieves
    // that; this is a no-op at runtime.
    void this.projects.projects;
    void this.workspaces.all;
  }
}
