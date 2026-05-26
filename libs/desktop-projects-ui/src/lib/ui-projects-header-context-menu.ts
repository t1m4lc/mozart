import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronsDownUp,
  lucideChevronsUpDown,
  lucideFolderPlus,
  lucideListFilter,
} from '@ng-icons/lucide';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';
import { AddProjectMenuItems } from './add-project-menu-items';

@Component({
  selector: 'app-projects-header-context-menu',
  imports: [
    NgIcon,
    HlmDropdownMenuImports,
    HlmIconImports,
    AddProjectMenuItems,
  ],
  providers: [
    provideIcons({
      lucideChevronsDownUp,
      lucideChevronsUpDown,
      lucideFolderPlus,
      lucideListFilter,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <hlm-dropdown-menu class="w-52">
      <hlm-dropdown-menu-group>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="expandAll.emit()"
        >
          <ng-icon hlm name="lucideChevronsUpDown" size="xs" /> Expand all
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="collapseAll.emit()"
        >
          <ng-icon hlm name="lucideChevronsDownUp" size="xs" /> Collapse all
        </button>
      </hlm-dropdown-menu-group>
      <hlm-dropdown-menu-separator />
      <hlm-dropdown-menu-group>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="openFilter.emit()"
        >
          <ng-icon hlm name="lucideListFilter" size="xs" /> Filter…
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          [hlmDropdownMenuTrigger]="addSubTpl"
          align="start"
          side="right"
        >
          <ng-icon hlm name="lucideFolderPlus" size="xs" /> Open project
          <hlm-dropdown-menu-item-sub-indicator />
        </button>
      </hlm-dropdown-menu-group>
    </hlm-dropdown-menu>

    <ng-template #addSubTpl>
      <hlm-dropdown-menu class="w-52">
        <app-add-project-menu-items
          [githubConnected]="githubConnected()"
          (openProject)="openProject.emit()"
          (openGithubProject)="openGithubProject.emit()"
        />
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class ProjectsHeaderContextMenu {
  readonly githubConnected = input<boolean>(false);
  readonly expandAll = output<void>();
  readonly collapseAll = output<void>();
  readonly openFilter = output<void>();
  readonly openProject = output<void>();
  readonly openGithubProject = output<void>();
  // readonly quickStart = output<void>();
}
