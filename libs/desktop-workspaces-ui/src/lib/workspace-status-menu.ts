import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { MzStatusIcon } from '@mozart-ui/status-icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import {
  UI_WORKSPACE_STATUSES,
  type UiWorkspaceStatus,
} from '@mozart/desktop-workspaces-util';

@Component({
  selector: 'app-workspace-status-menu',
  imports: [NgIcon, HlmDropdownMenuImports, HlmIconImports, MzStatusIcon],
  providers: [provideIcons({ lucideCheck })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <hlm-dropdown-menu-sub class="w-44">
      @for (s of statuses; track s.id) {
        <button
          hlmDropdownMenuItem
          type="button"
          class="cursor-pointer"
          (triggered)="statusSelect.emit(s.id)"
        >
          <mz-status-icon [status]="s.id" />
          {{ s.label }}
          @if (current() === s.id) {
            <ng-icon hlm name="lucideCheck" size="xs" class="ms-auto" />
          }
        </button>
      }
    </hlm-dropdown-menu-sub>
  `,
})
export class WorkspaceStatusMenu {
  readonly current = input.required<UiWorkspaceStatus>();
  // Plan P0.2: the reopen confirmation lives on the consumer side —
  // the menu always emits the raw pick, and the consumer intercepts
  // transitions out of `done` to open the dialog. Keeps this component
  // free of any "are you sure" semantics.
  readonly statusSelect = output<UiWorkspaceStatus>();

  protected readonly statuses = UI_WORKSPACE_STATUSES;
}
