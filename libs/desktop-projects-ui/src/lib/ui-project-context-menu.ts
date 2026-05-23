import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideEyeOff,
  lucidePlus,
  lucideSettings,
  lucideSmile,
  lucideTrash2,
} from '@ng-icons/lucide';

@Component({
  selector: 'app-project-context-menu',
  imports: [NgIcon, HlmDropdownMenuImports, HlmIconImports],
  providers: [
    provideIcons({
      lucideEyeOff,
      lucidePlus,
      lucideSettings,
      lucideSmile,
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
          (triggered)="settings.emit()"
        >
          <ng-icon hlm name="lucideSettings" size="xs" /> Repository settings
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="changeIcon.emit()"
        >
          <ng-icon hlm name="lucideSmile" size="xs" /> Change icon
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="hide.emit()"
        >
          <ng-icon hlm name="lucideEyeOff" size="xs" /> Hide repository
        </button>
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
  `,
})
export class ProjectContextMenu {
  readonly newWorkspace = output<void>();
  readonly settings = output<void>();
  readonly changeIcon = output<void>();
  readonly hide = output<void>();
  readonly remove = output<void>();
}
