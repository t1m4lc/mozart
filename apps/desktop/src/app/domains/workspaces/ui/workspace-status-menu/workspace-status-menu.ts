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
          (triggered)="_onPick(s.id)"
        >
          <ng-icon hlm [name]="s.icon" size="xs" [class]="s.colorClass" />
          {{ _labelFor(s.id, s.label) }}
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
  // Fired when the user picks the Done row while current === 'done'.
  // The host wires this to the reopen confirmation dialog. The status
  // menu does not itself mutate status in that case.
  readonly reopenRequested = output<void>();

  protected readonly statuses = UI_WORKSPACE_STATUSES;

  // Vocabulary lock (plan P0.2):
  //   - State label for `done` is "Done" (used elsewhere — chips, etc.)
  //   - Status-menu action for setting `done` is "Mark as done"
  //   - When current === 'done', the same row becomes "Reopen workspace"
  //     and emits `reopenRequested` instead of `statusSelect`.
  protected _labelFor(id: UiWorkspaceStatus, fallback: string): string {
    if (id !== 'done') return fallback;
    return this.current() === 'done' ? 'Reopen workspace' : 'Mark as done';
  }

  protected _onPick(id: UiWorkspaceStatus): void {
    if (id === 'done' && this.current() === 'done') {
      this.reopenRequested.emit();
      return;
    }
    this.statusSelect.emit(id);
  }
}
