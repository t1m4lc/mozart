import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronsDownUp,
  lucideChevronsUpDown,
  lucideFolderOpen,
  lucideFolderPlus,
  lucideGithub,
  lucideListFilter,
  lucideZap,
} from '@ng-icons/lucide';

@Component({
  selector: 'app-projects-header-context-menu',
  imports: [NgIcon, HlmDropdownMenuImports, HlmIconImports],
  providers: [
    provideIcons({
      lucideChevronsDownUp,
      lucideChevronsUpDown,
      lucideFolderOpen,
      lucideFolderPlus,
      lucideGithub,
      lucideListFilter,
      lucideZap,
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
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="openProject.emit()"
        >
          <ng-icon hlm name="lucideFolderOpen" size="xs" /> Open a repository on
          this machine
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="openGithubProject.emit()"
        >
          <ng-icon hlm name="lucideGithub" size="xs" /> Clone from Git
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="quickStart.emit()"
        >
          <ng-icon hlm name="lucideZap" size="xs" /> Create a new project
        </button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class ProjectsHeaderContextMenu {
  readonly expandAll = output<void>();
  readonly collapseAll = output<void>();
  readonly openFilter = output<void>();
  readonly openProject = output<void>();
  readonly openGithubProject = output<void>();
  readonly quickStart = output<void>();
}
