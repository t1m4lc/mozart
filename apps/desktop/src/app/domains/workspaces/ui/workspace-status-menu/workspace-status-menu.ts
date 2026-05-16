import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideCircleCheck,
  lucideCircleDashed,
  lucideCircleX,
  lucideEye,
  lucideTimer,
} from '@ng-icons/lucide';
import {
  UI_WORKSPACE_STATUSES,
  type UiWorkspaceStatus,
} from '../../data/workspace-status';

@Component({
  selector: 'app-workspace-status-menu',
  imports: [NgIcon, HlmDropdownMenuImports, HlmIconImports],
  providers: [
    provideIcons({
      lucideCheck,
      lucideCircleCheck,
      lucideCircleDashed,
      lucideCircleX,
      lucideEye,
      lucideTimer,
    }),
  ],
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
          <ng-icon hlm [name]="s.icon" size="xs" [class]="s.colorClass" />
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
  readonly statusSelect = output<UiWorkspaceStatus>();

  protected readonly statuses = UI_WORKSPACE_STATUSES;
}
