import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideFolderOpen,
  lucideFolderPlus,
  lucideGithub,
  lucideZap,
} from '@ng-icons/lucide';

// "Open project" button + dropdown. Atom 1: the "Open project" item emits
// an event but no handler is wired yet (matches today's behavior).
// Atom 2 will wire the click to ProjectsFacade.openPickerAndAdd().
@Component({
  selector: 'app-feature-add-project',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideFolderOpen,
      lucideFolderPlus,
      lucideGithub,
      lucideZap,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button
      hlmBtn
      variant="ghost"
      size="icon-xs"
      type="button"
      hlmTooltip="Open project"
      position="bottom"
      class="size-7 rounded-md text-muted-foreground"
      [hlmDropdownMenuTrigger]="addMenu"
    >
      <ng-icon hlm name="lucideFolderPlus" size="xs" />
    </button>
    <ng-template #addMenu>
      <hlm-dropdown-menu>
        <button
          hlmDropdownMenuItem
          type="button"
          (triggered)="openProject.emit()"
        >
          <ng-icon hlm name="lucideFolderOpen" size="sm" />
          Open a repository on this machine
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          (triggered)="openGithubProject.emit()"
        >
          <ng-icon hlm name="lucideGithub" size="sm" />
          Clone from Git
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          (triggered)="quickStart.emit()"
        >
          <ng-icon hlm name="lucideZap" size="sm" />
          Create a new project
        </button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class FeatureAddProject {
  readonly openProject = output<void>();
  readonly openGithubProject = output<void>();
  readonly quickStart = output<void>();
}
