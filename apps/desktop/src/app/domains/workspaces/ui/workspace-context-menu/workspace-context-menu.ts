import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBell,
  lucidePencil,
  lucidePin,
  lucidePinOff,
  lucideTag,
} from '@ng-icons/lucide';
import type { UiWorkspaceStatus } from '../../data/workspace-status';
import type { Workspace } from '../../data/workspace.model';
import { WorkspacesFacade } from '../../data/workspace.facade';
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
          @if (_live().pinned) {
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
          @if (_live().unread) {
            <ng-icon hlm name="lucideBell" size="xs" /> Mark as read
          } @else {
            <ng-icon hlm name="lucideBell" size="xs" /> Mark as unread
          }
        </button>
      </hlm-dropdown-menu-group>
    </hlm-dropdown-menu>

    <ng-template #statusSubTpl>
      <app-workspace-status-menu
        [current]="_live().status"
        (statusSelect)="setStatus.emit($event)"
      />
    </ng-template>
  `,
})
export class WorkspaceContextMenu {
  // The host (sidebar @for) hands the menu its workspace via the
  // hlmContextMenuTrigger directive's triggerData. That value is
  // captured at right-click time and never re-evaluated for the
  // lifetime of the popup, so reads off `workspace()` go stale the
  // instant the underlying status flips. `_live` re-resolves the row
  // from the store on every change-detection pass so the Set-status
  // check icon + pinned/unread labels track real state.
  readonly workspace = input.required<Workspace>();
  readonly markUnread = output<void>();
  readonly pin = output<void>();
  readonly rename = output<void>();
  readonly setStatus = output<UiWorkspaceStatus>();

  private readonly _workspaces = inject(WorkspacesFacade);
  protected readonly _live = computed<Workspace>(() => {
    const captured = this.workspace();
    return this._workspaces.workspaceById(captured.id)() ?? captured;
  });
}
