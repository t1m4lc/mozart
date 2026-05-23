import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { HlmSelectImports } from '@spartan-ui/select';
import { HlmTooltipImports } from '@spartan-ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBot,
  lucideCheck,
  lucideMap,
  lucideMessageCircleQuestion,
} from '@ng-icons/lucide';
import type { ChatMode } from './mz-composer';

interface ModeRow {
  readonly value: ChatMode;
  readonly label: string;
  readonly icon: string;
  readonly tooltip: string;
}

const MODE_ROWS: readonly ModeRow[] = [
  {
    value: 'agent',
    label: 'Agent',
    icon: 'lucideBot',
    tooltip: 'Agent — full edits',
  },
  {
    value: 'plan',
    label: 'Plan',
    icon: 'lucideMap',
    tooltip: 'Plan — design before touching files',
  },
  {
    value: 'ask',
    label: 'Ask',
    icon: 'lucideMessageCircleQuestion',
    tooltip: 'Ask — read-only mode',
  },
];

const ROW_BY_MODE: Record<ChatMode, ModeRow> = MODE_ROWS.reduce(
  (acc, row) => {
    acc[row.value] = row;
    return acc;
  },
  {} as Record<ChatMode, ModeRow>,
);

/**
 * Private to `MzComposer`. Mode picker as a menu (matches the visual
 * pattern of effort/model selects). Single-select, non-nullable.
 */
@Component({
  selector: 'mz-composer-mode-select',
  imports: [NgIcon, HlmSelectImports, HlmTooltipImports],
  providers: [
    provideIcons({
      lucideBot,
      lucideCheck,
      lucideMap,
      lucideMessageCircleQuestion,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex' },
  template: `
    <hlm-select
      [value]="mode()"
      [disabled]="disabled()"
      (valueChange)="_onValueChange($event)"
    >
      <hlm-select-trigger
        size="auto"
        hlmTooltip="Change mode"
        class="h-6 w-auto gap-1 rounded-md border-transparent px-2.5 py-0 text-xs shadow-none [&>ng-icon:last-child]:text-xs [&>ng-icon:last-child]:transition-transform [&>ng-icon:last-child]:duration-150 [&[aria-expanded=true]>ng-icon:last-child]:rotate-180"
      >
        <ng-icon hlm [name]="_currentRow().icon" size="xs" />
        <span class="text-xs">{{ _currentRow().label }}</span>
      </hlm-select-trigger>
      <hlm-select-content *hlmSelectPortal class="w-48">
        <hlm-select-group>
          @for (row of _rows; track row.value) {
            <hlm-select-item [value]="row.value">
              <span class="flex flex-1 items-center gap-2">
                <ng-icon hlm [name]="row.icon" size="xs" />
                <span>{{ row.label }}</span>
              </span>
              @if (mode() === row.value) {
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
export class ComposerModeSelect {
  readonly mode = input.required<ChatMode>();
  readonly disabled = input(false);
  readonly modeChange = output<ChatMode>();

  protected readonly _rows = MODE_ROWS;
  protected readonly _currentRow = computed<ModeRow>(
    () => ROW_BY_MODE[this.mode()],
  );

  protected _onValueChange(next: unknown): void {
    if (typeof next !== 'string') return;
    if (!(next in ROW_BY_MODE)) return;
    const m = next as ChatMode;
    if (m === this.mode()) return;
    this.modeChange.emit(m);
  }
}
