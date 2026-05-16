import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArchive,
  lucideBell,
  lucidePencil,
  lucidePin,
  lucidePinOff,
  lucideTag,
} from '@ng-icons/lucide';
import type { UiWorkspaceStatus } from '../../data/workspace-status';
import type { Workspace } from '../../data/workspace.model';
import { WorkspaceStatusMenu } from '../workspace-status-menu/workspace-status-menu';

@Component({
  selector: 'app-workspace-context-menu',
  imports: [
    NgIcon,
    HlmDropdownMenuImports,
    HlmIconImports,
    WorkspaceStatusMenu,
  ],
  providers: [
    provideIcons({
      lucideArchive,
      lucideBell,
      lucidePencil,
      lucidePin,
      lucidePinOff,
      lucideTag,
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
          (triggered)="pin.emit()"
        >
          @if (workspace().pinned) {
            <ng-icon hlm name="lucidePinOff" size="xs" /> Unpin
          } @else {
            <ng-icon hlm name="lucidePin" size="xs" /> Pin
          }
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          [hlmDropdownMenuTrigger]="statusSubTpl"
          align="start"
          side="right"
        >
          <ng-icon hlm name="lucideTag" size="xs" /> Set status
          <hlm-dropdown-menu-item-sub-indicator />
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="rename.emit()"
        >
          <ng-icon hlm name="lucidePencil" size="xs" /> Rename
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="markUnread.emit()"
        >
          @if (workspace().unread) {
            <ng-icon hlm name="lucideBell" size="xs" /> Mark as read
          } @else {
            <ng-icon hlm name="lucideBell" size="xs" /> Mark as unread
          }
        </button>
      </hlm-dropdown-menu-group>
      <hlm-dropdown-menu-separator />
      <hlm-dropdown-menu-group>
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="archive.emit()"
        >
          <ng-icon hlm name="lucideArchive" size="xs" /> Archive
        </button>
      </hlm-dropdown-menu-group>
    </hlm-dropdown-menu>

    <ng-template #statusSubTpl>
      <app-workspace-status-menu
        [current]="workspace().status"
        (select)="setStatus.emit($event)"
      />
    </ng-template>
  `,
})
export class WorkspaceContextMenu {
  readonly workspace = input.required<Workspace>();
  readonly markUnread = output<void>();
  readonly pin = output<void>();
  readonly rename = output<void>();
  readonly archive = output<void>();
  readonly setStatus = output<UiWorkspaceStatus>();
}
