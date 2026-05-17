import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDropdownMenuImports } from '@mozart/ui/dropdown-menu';
import { HlmIconImports } from '@mozart/ui/icon';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideHash,
  lucideLink,
  lucidePaperclip,
  lucidePlus,
} from '@ng-icons/lucide';

// Attach / Link / Issue menu pinned to the right of the composer's
// send/stop button. Click-to-open dropdown — replaces the prior
// hover-pinned popover for a more deliberate interaction model and so
// the menu doesn't fight with the user's hover when reading the chat.
@Component({
  selector: 'hlm-composer-plus-menu',
  imports: [NgIcon, HlmButtonImports, HlmDropdownMenuImports, HlmIconImports],
  providers: [
    provideIcons({ lucideHash, lucideLink, lucidePaperclip, lucidePlus }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <button
      hlmBtn
      variant="ghost"
      size="icon-xs"
      type="button"
      aria-label="Add to message"
      class="size-6 rounded-md text-muted-foreground"
      [hlmDropdownMenuTrigger]="addMenu"
    >
      <ng-icon hlm name="lucidePlus" size="xs" />
    </button>
    <ng-template #addMenu>
      <hlm-dropdown-menu class="w-56">
        <header
          class="flex items-center px-2 pt-1 pb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"
        >
          Attach
        </header>
        <button
          hlmDropdownMenuItem
          type="button"
          disabled
          class="cursor-not-allowed"
        >
          <ng-icon
            hlm
            name="lucidePaperclip"
            size="sm"
            class="text-muted-foreground"
          />
          <span class="flex-1 text-left">Attach file</span>
          <span
            class="text-xs font-medium uppercase tracking-wider text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded"
          >
            Soon
          </span>
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          disabled
          class="cursor-not-allowed"
        >
          <ng-icon
            hlm
            name="lucideLink"
            size="sm"
            class="text-muted-foreground"
          />
          <span class="flex-1 text-left">Link</span>
          <span
            class="text-xs font-medium uppercase tracking-wider text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded"
          >
            Soon
          </span>
        </button>
        <button
          hlmDropdownMenuItem
          type="button"
          disabled
          class="cursor-not-allowed"
        >
          <ng-icon
            hlm
            name="lucideHash"
            size="sm"
            class="text-muted-foreground"
          />
          <span class="flex-1 text-left">Issue</span>
          <span
            class="text-xs font-medium uppercase tracking-wider text-muted-foreground bg-muted/70 px-1.5 py-0.5 rounded"
          >
            Soon
          </span>
        </button>
      </hlm-dropdown-menu>
    </ng-template>
  `,
})
export class HlmComposerPlusMenu {}
