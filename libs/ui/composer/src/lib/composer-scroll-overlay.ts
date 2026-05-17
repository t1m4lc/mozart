import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmTooltipImports } from '@mozart/ui/tooltip';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowDown, lucideArrowRight } from '@ng-icons/lucide';

/**
 * Private to `HlmComposer`. Two absolute-positioned pill buttons that
 * sit above the composer top edge. Visibility is fully input-driven —
 * the host owns the scroll position + unread checks and just toggles
 * these flags.
 */
@Component({
  selector: 'composer-scroll-overlay',
  imports: [NgIcon, HlmButtonImports, HlmIconImports, HlmTooltipImports],
  providers: [provideIcons({ lucideArrowDown, lucideArrowRight })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none absolute inset-x-0 -top-12 z-10' },
  template: `
    <div class="relative h-10 w-full">
      @if (!autoFollowChat()) {
        <button
          hlmBtn
          variant="outline"
          size="icon-sm"
          type="button"
          hlmTooltip="Scroll to bottom"
          aria-label="Scroll to bottom"
          (click)="scrollToBottom.emit()"
          class="pointer-events-auto absolute left-2 top-0 rounded-full motion-safe:transition-opacity"
        >
          <ng-icon hlm name="lucideArrowDown" size="sm" />
        </button>
      }
      @if (hasNextUnreadInProject()) {
        <button
          hlmBtn
          variant="outline"
          size="sm"
          type="button"
          hlmTooltip="Next unread workspace"
          aria-label="Next unread workspace"
          (click)="nextUnreadWorkspace.emit()"
          class="pointer-events-auto absolute right-2 top-0 h-8 px-2 motion-safe:transition-opacity"
        >
          <ng-icon hlm name="lucideArrowRight" size="sm" />
        </button>
      }
    </div>
  `,
})
export class ComposerScrollOverlay {
  readonly autoFollowChat = input(true);
  readonly hasNextUnreadInProject = input(false);

  readonly scrollToBottom = output<void>();
  readonly nextUnreadWorkspace = output<void>();
}
