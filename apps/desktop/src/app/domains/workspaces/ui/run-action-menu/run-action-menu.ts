import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideChevronDown,
  lucideCircleStop,
  lucidePlay,
} from '@ng-icons/lucide';

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
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
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
        [variant]="isRunning() ? 'destructive' : 'outline'"
        size="sm"
        type="button"
        [hlmTooltip]="primaryTooltip()"
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
  /** Current run status. Drives label/icon and the destructive variant
   *  for the Stop state. */
  readonly status = input.required<RunStatus>();
  /** Disabled until a run command is configured for the project. */
  readonly hasCommand = input<boolean>(false);

  readonly start = output<void>();
  readonly stop = output<void>();

  protected readonly isRunning = computed(() => {
    const s = this.status();
    return s === 'running' || s === 'starting';
  });

  protected readonly primaryDisabled = computed(
    () => !this.isRunning() && !this.hasCommand(),
  );

  protected readonly primaryLabel = computed(() =>
    this.isRunning() ? 'Stop' : 'Run',
  );

  protected readonly primaryIcon = computed(() =>
    this.isRunning() ? 'lucideCircleStop' : 'lucidePlay',
  );

  protected readonly primaryTooltip = computed(() => {
    if (this.isRunning()) return 'Stop the run';
    if (!this.hasCommand()) {
      return 'No run command configured. Add one in project settings.';
    }
    return 'Run the configured command';
  });

  protected primary(): void {
    if (this.primaryDisabled()) return;
    if (this.isRunning()) {
      this.stop.emit();
    } else {
      this.start.emit();
    }
  }
}
