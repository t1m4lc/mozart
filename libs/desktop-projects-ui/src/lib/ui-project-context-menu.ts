import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolderGit2,
  lucideFolderOpen,
  lucideGitBranch,
  lucideGithub,
  lucidePlus,
  lucideSettings,
  lucideTrash2,
} from '@ng-icons/lucide';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';

@Component({
  selector: 'app-project-context-menu',
  imports: [NgIcon, HlmDropdownMenuImports, HlmIconImports],
  providers: [
    provideIcons({
      // lucideEyeOff,
      lucideFolderGit2,
      lucideFolderOpen,
      lucideGitBranch,
      lucideGithub,
      lucidePlus,
      lucideSettings,
      // lucideSmile,
      lucideTrash2,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // `display:contents` makes the wrapper layout-transparent so the
  // hlm-dropdown-menu becomes the effective root of the CDK overlay panel.
  host: { class: 'contents' },
  template: `
    <hlm-dropdown-menu class="w-52">
      <hlm-dropdown-menu-group>
        <!-- Project settings is hidden until the project-level settings
             surface ships. Restore by uncommenting this block. -->
        <!-- <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="settings.emit()"
        >
          <ng-icon hlm name="lucideSettings" size="xs" /> Project settings
        </button> -->
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="newWorkspace.emit()"
        >
          <ng-icon hlm name="lucidePlus" size="xs" /> New workspace
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="newWorkspaceFromBranch.emit()"
        >
          <ng-icon hlm name="lucideGitBranch" size="xs" /> Workspace from…
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          [hlmDropdownMenuTrigger]="repoSub"
          align="start"
          side="right"
        >
          <ng-icon hlm name="lucideFolderGit2" size="xs" /> Source repository
          <hlm-dropdown-menu-item-sub-indicator />
        </button>
        <!-- <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="changeIcon.emit()"
        >
          <ng-icon hlm name="lucideSmile" size="xs" /> Change icon
        </button> -->
        <!-- <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="hide.emit()"
        >
          <ng-icon hlm name="lucideEyeOff" size="xs" /> Hide repository
        </button> -->
      </hlm-dropdown-menu-group>
      <hlm-dropdown-menu-separator />
      <hlm-dropdown-menu-group>
        <button
          hlmDropdownMenuItem
          type="button"
          variant="destructive"
          class="cursor-pointer"
          (triggered)="remove.emit()"
        >
          <ng-icon hlm name="lucideTrash2" size="xs" /> Remove repository
        </button>
      </hlm-dropdown-menu-group>
    </hlm-dropdown-menu>

    <ng-template #repoSub>
      <hlm-dropdown-menu class="w-52">
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="openRepoFolder.emit()"
        >
          <ng-icon hlm name="lucideFolderOpen" size="xs" /> Open repository folder
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="openRepoRemote.emit()"
        >
          <ng-icon hlm name="lucideGithub" size="xs" /> Open on GitHub
        </button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class ProjectContextMenu {
  readonly newWorkspace = output<void>();
  readonly newWorkspaceFromBranch = output<void>();
  readonly settings = output<void>();
  readonly changeIcon = output<void>();
  readonly hide = output<void>();
  readonly remove = output<void>();
  // "Source repository" submenu — open the local folder or the GitHub
  // remote. The parent (shell-project-list) resolves the path / URL.
  readonly openRepoFolder = output<void>();
  readonly openRepoRemote = output<void>();
}
