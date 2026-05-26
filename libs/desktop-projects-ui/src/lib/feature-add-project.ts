import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFolderPlus } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { AddProjectMenuItems } from './add-project-menu-items';

// Trigger button (sidebar `+`) + dropdown. The dropdown body is the
// shared <app-add-project-menu-items/> — see that file for wording,
// icons, and the Quickstart disabled state.
@Component({
  selector: 'app-feature-add-project',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmTooltipImports,
    AddProjectMenuItems,
  ],
  providers: [provideIcons({ lucideFolderPlus })],
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
        <app-add-project-menu-items
          [githubConnected]="githubConnected()"
          (openProject)="openProject.emit()"
          (openGithubProject)="openGithubProject.emit()"
        />
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class FeatureAddProject {
  readonly githubConnected = input<boolean>(false);
  readonly openProject = output<void>();
  readonly openGithubProject = output<void>();
  // readonly quickStart = output<void>();
}
