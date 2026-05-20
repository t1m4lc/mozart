import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmSelectImports } from '@mozart/ui/select';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideSignal,
  lucideSignalHigh,
  lucideSignalLow,
  lucideSignalMedium,
  lucideSignalZero,
} from '@ng-icons/lucide';
import type { EffortLevel } from './mz-composer';

interface EffortRow {
  readonly value: EffortLevel;
  readonly label: string;
  readonly icon: string;
}

const EFFORT_ROWS: readonly EffortRow[] = [
  { value: 'max', label: 'Max', icon: 'lucideSignal' },
  { value: 'xhigh', label: 'XHigh', icon: 'lucideSignalHigh' },
  { value: 'high', label: 'High', icon: 'lucideSignalMedium' },
  { value: 'medium', label: 'Medium', icon: 'lucideSignalLow' },
  { value: 'low', label: 'Low', icon: 'lucideSignalZero' },
];

const ROW_BY_LEVEL: Record<EffortLevel, EffortRow> = EFFORT_ROWS.reduce(
  (acc, row) => {
    acc[row.value] = row;
    return acc;
  },
  {} as Record<EffortLevel, EffortRow>,
);

/**
 * Private to `HlmComposer`. Effort picker (low / medium / high / xhigh /
 * max). Trigger shows a signal-bar icon matching the level + the level
 * label.
 */
@Component({
  selector: 'mz-composer-effort-select',
  imports: [NgIcon, HlmSelectImports, HlmTooltipImports],
  providers: [
    provideIcons({
      lucideCheck,
      lucideSignal,
      lucideSignalHigh,
      lucideSignalLow,
      lucideSignalMedium,
      lucideSignalZero,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <hlm-select
      [value]="effort()"
      [disabled]="disabled()"
      (valueChange)="_onValueChange($event)"
    >
      <hlm-select-trigger
        size="auto"
        hlmTooltip="Adjust effort"
        class="h-6 w-auto gap-1 rounded-md border-transparent px-1.5 py-0 text-xs shadow-none [&>ng-icon:last-child]:text-xs"
      >
        <ng-icon hlm [name]="_currentRow().icon" size="xs" />
        <span class="text-xs">{{ _currentRow().label }}</span>
      </hlm-select-trigger>
      <hlm-select-content *hlmSelectPortal class="w-40">
        <hlm-select-group>
          @for (row of _rows; track row.value) {
            <hlm-select-item [value]="row.value">
              <span class="flex flex-1 items-center gap-2">
                <ng-icon hlm [name]="row.icon" size="xs" />
                <span>{{ row.label }}</span>
              </span>
              @if (effort() === row.value) {
                <ng-icon
                  hlm
                  name="lucideCheck"
                  size="xs"
                  class="text-muted-foreground"
                />
              }
            </hlm-select-item>
          }
        </hlm-select-group>
      </hlm-select-content>
    </hlm-select>
  `,
})
export class ComposerEffortSelect {
  readonly effort = input.required<EffortLevel>();
  readonly disabled = input(false);
  readonly effortChange = output<EffortLevel>();

  protected readonly _rows = EFFORT_ROWS;
  protected readonly _currentRow = computed<EffortRow>(
    () => ROW_BY_LEVEL[this.effort()],
  );

  protected _onValueChange(next: unknown): void {
    if (typeof next !== 'string') return;
    if (!(next in ROW_BY_LEVEL)) return;
    const level = next as EffortLevel;
    if (level === this.effort()) return;
    this.effortChange.emit(level);
  }
}
