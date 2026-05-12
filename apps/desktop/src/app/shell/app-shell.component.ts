/**
 * `AppShellComponent` — the dark 3-panel root view.
 *
 * Layout (per DESIGN.md, S1.ui.2 re-architecture):
 *   - The host renders a 64px-tall header band on top of the body. The
 *     band is column-aligned to the body's 3-column grid (sidebar /
 *     center / right-panel), so every header segment sits directly
 *     above its corresponding body column.
 *   - LEFT segment   = `<app-top-bar>` (mac traffic-lights or empty +
 *     draggable). Width: `var(--sidebar-width)`.
 *   - CENTER segment = `<app-center-header>` (breadcrumb row + tabs
 *     row, stacked to 2 × 32px). Width: `1fr`. Only renders when a
 *     workspace is selected (matches `centerView() === 'chat'`).
 *   - RIGHT segment  = `<app-right-header>` (win/linux controls or
 *     empty + draggable). Width: `var(--right-panel-width)`.
 *   - Body strip: same 3-column grid as before — sidebar / main /
 *     aside, with the `aside` track collapsing when the right panel is
 *     hidden or the viewport drops below 1100 px.
 *
 * Hiding the right-panel column also hides the RIGHT header segment so
 * the 3-segment header always matches the body grid exactly. The same
 * `@media (max-width: 1099px)` rule applies to both rows.
 *
 * ARIA landmarks: the top-bar component owns `role="banner"`; the
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
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HlmDialogService } from '@mozart/ui/dialog';
import { FolderPickerService } from '../services/folder-picker.service';
import { ShortcutService } from '../services/shortcut.service';
import { ProjectStore } from '../state/project.store';
import { ShellStore } from '../state/shell.store';
import { WorkspaceStore } from '../state/workspace.store';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { CenterHeaderComponent } from './center-header.component';
import { ChatPanelComponent } from './chat-panel.component';
import { CreateWorkspaceDialogComponent } from './create-workspace-dialog.component';
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
  template: `
    <div
      class="shell-header"
      [class.no-right]="!shellStore.showRightPanel()"
      data-tauri-drag-region
    >
      <app-top-bar />
      <app-center-header />
      @if (shellStore.showRightPanel()) {
        <app-right-header />
      }
    </div>
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
      grid-template-rows: 64px 1fr;
      height: 100vh;
      background: hsl(var(--background));
      color: hsl(var(--foreground));
      font-family: var(--font-sans);
    }
    .shell-header {
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr var(--right-panel-width);
      height: 64px;
      min-height: 0;
    }
    .shell-header.no-right {
      grid-template-columns: var(--sidebar-width) 1fr;
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
      .shell-header { grid-template-columns: var(--sidebar-width) 1fr; }
      .shell-grid { grid-template-columns: var(--sidebar-width) 1fr; }
      aside { display: none; }
      app-right-header { display: none; }
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
  private readonly shortcuts = inject(ShortcutService);
  private readonly dialog = inject(HlmDialogService);
  private readonly folderPicker = inject(FolderPickerService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    // Touch each store so the `inject()` call is preserved across
    // tree-shaking by the Angular compiler. Reading any signal achieves
    // that; this is a no-op at runtime.
    void this.projects.projects;
    void this.workspaces.all;

    // ⌘R / Ctrl+R → open the native folder picker (post-1.8b refactor).
    //
    // The old binding opened the text-only `AddRepoDialog`; that path
    // is gone. The new shortcut skips the 3-item dropdown menu (which
    // lives behind the sidebar `+` button) because there's exactly one
    // functional menu entry in v0.0.1 — "Open project" — so a keyboard
    // shortcut for it goes straight to the picker.
    //
    // NOTE: ⌘R is also the platform "reload page" shortcut. In a Tauri
    // dev build the webview may intercept it before `preventDefault`
    // can suppress it — the shortcut service still calls
    // `event.preventDefault()` first (Tauri honors it on most setups
    // because of WebKit/WebView2 event ordering). If Tauri's webview
    // ever wins the race during dev, the next pass may need to remap
    // this to ⌘⇧R; documented as a known risk.
    this.shortcuts
      .register$({
        key: 'mod+r',
        command: () => undefined,
        preventDefault: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Sonner/toast surfacing of MozartError is out of scope; we
        // log to the dev console for now. Tracked in `docs/TODO.md`.
        void this.folderPicker.openAndAddRepo().catch((err) => {
          console.error('[AppShell] ⌘R open project failed:', err);
        });
      });

    // ⌘N / Ctrl+N → open CreateWorkspaceDialog. The dialog reads
    // ProjectStore.selectedProject() when no `lockedRepoId` context is
    // passed (the global-keyboard case). When no project is selected,
    // the dialog still opens but renders "Select a project first" and
    // disables Create — matching the audit-plan behaviour.
    this.shortcuts
      .register$({
        key: 'mod+n',
        command: () => undefined,
        preventDefault: true,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.openNewWorkspace());
  }

  private openNewWorkspace(): void {
    const selectedRepoId = this.projects.selectedProjectId();
    this.dialog.open(CreateWorkspaceDialogComponent, {
      contentClass: 'w-[480px] max-w-[90vw]',
      showCloseButton: true,
      context: { lockedRepoId: selectedRepoId },
    });
  }
}
