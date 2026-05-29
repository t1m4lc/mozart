import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideCircleStop,
  lucidePlay,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDropdownMenuImports } from '@spartan-ui/dropdown-menu';
import { HlmIconImports } from '@spartan-ui/icon';

export type RunStatus = 'idle' | 'starting' | 'running' | 'exited';

// Split-button + dropdown for the workspace run action. Mirrors the
// `MergeActionMenu` shape so the right-aside processes header reads as
// a sibling control to the merge button up top.
//
//   - Primary button: "Run" when idle/exited, "Stop" when running.
//   - Dropdown chevron: disabled for now (no run variants yet).
//
// The host owns the start/stop wiring; this component is pure UI.
@Component({
  selector: 'app-run-action-menu',
  imports: [NgIcon, HlmButtonImports, HlmDropdownMenuImports, HlmIconImports],
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideCircleStop,
      lucidePlay,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex">
      <button
        hlmBtn
        [variant]="isRunning() ? 'secondary' : 'outline'"
        size="sm"
        type="button"
        position="bottom"
        class="h-7 rounded-r-none rounded-l-md border-r-0 px-2 text-xs font-normal"
        [disabled]="primaryDisabled()"
        (click)="primary()"
      >
        <ng-icon hlm [name]="primaryIcon()" size="xs" />
        <span>{{ primaryLabel() }}</span>
      </button>
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        hlmTooltip="More run options (coming soon)"
        position="bottom"
        class="h-7 rounded-l-none rounded-r-md px-1.5"
        disabled
      >
        <ng-icon hlm name="lucideChevronDown" size="xs" />
      </button>
    </div>
  `,
})
export class RunActionMenu {
  /** Current run status. Drives the label/icon and the button variant
   *  (neutral `secondary` for Stop — stopping a dev server isn't a
   *  destructive action). */
  readonly status = input.required<RunStatus>();
  /** Disabled until a run command is configured for the project. */
  readonly hasCommand = input<boolean>(false);
  /** True when *another* per-workspace PTY (typically the setup
   *  command) is already executing. Locks the toolbar Run button so
   *  the user can't try to start two PTYs at once. */
  readonly busy = input<boolean>(false);

  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly start = output<void>();
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly stop = output<void>();

  protected readonly isRunning = computed(() => {
    const s = this.status();
    return s === 'running' || s === 'starting';
  });

  protected readonly primaryDisabled = computed(() => {
    if (this.isRunning()) return false;
    if (!this.hasCommand()) return true;
    return this.busy();
  });

  protected readonly primaryLabel = computed(() =>
    this.isRunning() ? 'Stop' : 'Run',
  );

  protected readonly primaryIcon = computed(() =>
    this.isRunning() ? 'lucideCircleStop' : 'lucidePlay',
  );

  protected primary(): void {
    if (this.primaryDisabled()) return;
    if (this.isRunning()) {
      this.stop.emit();
    } else {
      this.start.emit();
    }
  }
}
