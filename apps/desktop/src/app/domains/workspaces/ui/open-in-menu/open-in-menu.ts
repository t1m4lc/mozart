import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBookOpen,
  lucideBraces,
  lucideChevronDown,
  lucideCode2,
  lucideCopy,
  lucideFolderOpen,
  lucideMousePointerClick,
  lucideTerminal,
  lucideWind,
  lucideZap,
} from '@ng-icons/lucide';
import type { OpenInTool } from '../../data/open-in-tools';

@Component({
  selector: 'app-open-in-menu',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmDropdownMenuImports,
    HlmIconImports,
    HlmTooltipImports,
  ],
  providers: [
    provideIcons({
      lucideBookOpen,
      lucideBraces,
      lucideChevronDown,
      lucideCode2,
      lucideCopy,
      lucideFolderOpen,
      lucideMousePointerClick,
      lucideTerminal,
      lucideWind,
      lucideZap,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex">
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        [hlmTooltip]="'Open with ' + lastUsed().label"
        position="bottom"
        class="h-7 rounded-r-none rounded-l-md border-r-0 px-3 text-xs font-normal hover:bg-accent"
        (click)="openIn.emit(lastUsed())"
      >
        @if (lastUsed().iconPath; as path) {
          <img [src]="path" alt="" aria-hidden="true" class="size-3.5 shrink-0" />
        } @else {
          <ng-icon hlm [name]="lastUsed().icon" size="xs" />
        }
        @if (subtitle()) {
          <span
            class="ml-1 hidden max-w-28 truncate text-muted-foreground lg:inline"
          >
            {{ subtitle() }}
          </span>
        }
      </button>
      <button
        hlmBtn
        variant="outline"
        size="sm"
        type="button"
        position="bottom"
        [hlmDropdownMenuTrigger]="menu"
        align="end"
        side="bottom"
        class="h-7 rounded-l-none rounded-r-md px-1.5 hover:bg-accent"
      >
        <ng-icon hlm name="lucideChevronDown" size="xs" />
      </button>
    </div>

    <ng-template #menu>
      <hlm-dropdown-menu>
        @for (tool of tools(); track tool.id) {
          <button
            hlmDropdownMenuItem
            type="button"
            class="cursor-pointer"
            (triggered)="openIn.emit(tool)"
          >
            @if (tool.iconPath; as path) {
              <img
                [src]="path"
                alt=""
                aria-hidden="true"
                class="size-3.5 shrink-0"
              />
            } @else {
              <ng-icon hlm [name]="tool.icon" size="xs" />
            }
            <span class="flex-1">{{ tool.label }}</span>
            <span class="ml-4 text-xs text-muted-foreground/60">{{
              tool.shortcut
            }}</span>
          </button>
        }
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class OpenInMenu {
  readonly tools = input.required<readonly OpenInTool[]>();
  readonly lastUsed = input.required<OpenInTool>();
  readonly subtitle = input<string>('');
  readonly openIn = output<OpenInTool>();
}
