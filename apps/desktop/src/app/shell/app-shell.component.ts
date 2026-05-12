import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { ProjectStore } from '../state/project.store';
import { ShellStore } from '../state/shell.store';
import { WorkspaceStore } from '../state/workspace.store';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { CenterHeaderComponent } from './center-header.component';
import { ChatPanelComponent } from './chat-panel.component';
import { EmptyCenterComponent } from './empty-center.component';
import { EmptyRightComponent } from './empty-right.component';
import { RightHeaderComponent } from './right-header.component';
import { TopBarComponent } from './top-bar.component';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TopBarComponent,
    CenterHeaderComponent,
    RightHeaderComponent,
    SidebarComponent,
    ChatPanelComponent,
    EmptyCenterComponent,
    EmptyRightComponent,
  ],
  host: {
    class: 'grid grid-rows-[64px_1fr] h-screen bg-background text-foreground',
  },
  template: `
    <div
      class="shell-header grid h-16 min-h-0 grid-cols-[var(--sidebar-width)_1fr_var(--right-panel-width)] max-[1099px]:grid-cols-[var(--sidebar-width)_1fr]"
      [class.no-right]="!shellStore.showRightPanel()"
      data-tauri-drag-region
    >
      <app-top-bar />
      <app-center-header />
      @if (shellStore.showRightPanel()) {
        <app-right-header class="max-[1099px]:hidden" />
      }
    </div>
    <div
      class="shell-grid grid min-h-0 h-full grid-cols-[var(--sidebar-width)_1fr_var(--right-panel-width)] max-[1099px]:grid-cols-[var(--sidebar-width)_1fr]"
      [class.no-right]="!shellStore.showRightPanel()"
    >
      <app-sidebar />
      <main
        role="main"
        aria-label="Workspace conversation"
        class="min-h-0 overflow-hidden"
      >
        @if (shellStore.centerView() === 'chat') {
          <app-chat-panel />
        } @else {
          <app-empty-center />
        }
      </main>
      @if (shellStore.showRightPanel()) {
        <aside
          role="complementary"
          aria-label="Workspace changes and terminal"
          class="min-h-0 overflow-hidden bg-card border-l border-border max-[1099px]:hidden"
        >
          <app-empty-right />
        </aside>
      }
    </div>
  `,
  styles: `
    :host { font-family: var(--font-sans); }
    main { background: var(--bg-center); }
    .shell-header.no-right { grid-template-columns: var(--sidebar-width) 1fr; }
    .shell-grid.no-right { grid-template-columns: var(--sidebar-width) 1fr; }
  `,
})
export class AppShellComponent {
  private readonly projects = inject(ProjectStore);
  private readonly workspaces = inject(WorkspaceStore);
  protected readonly shellStore = inject(ShellStore);
  constructor() {
    void this.projects.projects;
    void this.workspaces.all;
  }
}
