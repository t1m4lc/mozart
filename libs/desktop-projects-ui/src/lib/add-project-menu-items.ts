import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFolderOpen, lucideGithub, lucideZap } from '@ng-icons/lucide';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';

// Shared "add a project" items, rendered as direct children of an
// existing <hlm-dropdown-menu>. Three call sites used to inline the
// same three buttons (sidebar `+` dropdown, Projects-header
// right-click submenu, and the empty-state right-click); centralizing
// them keeps wording, icon sizing, and the Quickstart disabled state
// in one place.
//
// `host: 'contents'` keeps the wrapper out of layout so the buttons
// stay as direct siblings inside the dropdown.
@Component({
  selector: 'app-add-project-menu-items',
  imports: [NgIcon, HlmDropdownMenuImports, HlmIconImports],
  providers: [provideIcons({ lucideFolderOpen, lucideGithub, lucideZap })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button
      hlmDropdownMenuItem
      type="button"
      (triggered)="openProject.emit()"
    >
      <ng-icon hlm name="lucideFolderOpen" size="sm" />
      Open a project from your machine
    </button>
    <button
      hlmDropdownMenuItem
      type="button"
      (triggered)="openGithubProject.emit()"
    >
      <ng-icon hlm name="lucideGithub" size="sm" />
      Clone from Git
    </button>
    <!-- Quickstart kept visible but disabled — CreateProjectDialog
         flow is on ice until the underlying create-folder UX lands. -->
    <button hlmDropdownMenuItem type="button" disabled>
      <ng-icon hlm name="lucideZap" size="sm" />
      Start with Quickstart
    </button>
  `,
})
export class AddProjectMenuItems {
  readonly openProject = output<void>();
  readonly openGithubProject = output<void>();
}
