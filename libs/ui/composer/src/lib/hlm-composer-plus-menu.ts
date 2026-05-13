import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  signal,
  viewChild,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmPopoverImports } from '@mozart/ui/popover';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideHash,
  lucideLink,
  lucidePaperclip,
  lucidePlus,
} from '@ng-icons/lucide';

@Component({
  selector: 'hlm-composer-plus-menu',
  imports: [
    NgIcon,
    HlmButtonImports,
    HlmIconImports,
    HlmPopoverImports,
  ],
  providers: [
    provideIcons({ lucideHash, lucideLink, lucidePaperclip, lucidePlus }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <div
      hlmPopover
      [state]="_state()"
      [attachTo]="_triggerEl()"
      closeOnOutsidePointerEvents
      (stateChanged)="_onStateChanged($event)"
    >
      <button
        #trigger
        hlmBtn
        variant="outline"
        size="icon-sm"
        type="button"
        aria-label="Add to message"
        class="ml-1 rounded-lg"
        (mouseenter)="_onTriggerEnter()"
        (mouseleave)="_onTriggerLeave()"
        (click)="_onTriggerClick()"
      >
        <ng-icon hlm name="lucidePlus" size="sm" />
      </button>

      <ng-template hlmPopoverPortal>
        <div
          hlmPopoverContent
          side="top"
          align="end"
          sideOffset="12"
          class="flex flex-col w-56 p-1 gap-0.5"
          (mouseenter)="_onContentEnter()"
          (mouseleave)="_onContentLeave()"
        >
          <header
            class="flex items-center px-2 pt-1 pb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"
          >
            Attach
          </header>
          <button
            type="button"
            aria-disabled="true"
            class="flex w-full items-center gap-2.5 px-2 py-1.5 text-sm rounded-md text-foreground hover:bg-accent transition-colors cursor-not-allowed"
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
            type="button"
            aria-disabled="true"
            class="flex w-full items-center gap-2.5 px-2 py-1.5 text-sm rounded-md text-foreground hover:bg-accent transition-colors cursor-not-allowed"
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
            type="button"
            aria-disabled="true"
            class="flex w-full items-center gap-2.5 px-2 py-1.5 text-sm rounded-md text-foreground hover:bg-accent transition-colors cursor-not-allowed"
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
        </div>
      </ng-template>
    </div>
  `,
})
export class HlmComposerPlusMenu {
  private readonly _trigger =
    viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  protected readonly _triggerEl = computed(() => this._trigger().nativeElement);

  private readonly _triggerHovered = signal(false);
  private readonly _contentHovered = signal(false);
  private readonly _pinned = signal(false);
  private _closeTimer?: ReturnType<typeof setTimeout>;

  protected readonly _state = computed<'open' | 'closed'>(() =>
    this._pinned() || this._triggerHovered() || this._contentHovered()
      ? 'open'
      : 'closed',
  );

  protected _onTriggerEnter(): void {
    this._cancelClose();
    this._triggerHovered.set(true);
  }

  protected _onTriggerLeave(): void {
    this._scheduleClose(() => this._triggerHovered.set(false));
  }

  protected _onContentEnter(): void {
    this._cancelClose();
    this._contentHovered.set(true);
  }

  protected _onContentLeave(): void {
    this._scheduleClose(() => this._contentHovered.set(false));
  }

  protected _onTriggerClick(): void {
    if (this._pinned()) {
      this._pinned.set(false);
      this._triggerHovered.set(false);
      this._contentHovered.set(false);
    } else {
      this._pinned.set(true);
    }
  }

  protected _onStateChanged(state: 'open' | 'closed'): void {
    if (state === 'closed') {
      this._pinned.set(false);
      this._triggerHovered.set(false);
      this._contentHovered.set(false);
    }
  }

  private _scheduleClose(setter: () => void): void {
    this._cancelClose();
    this._closeTimer = setTimeout(() => {
      setter();
      this._closeTimer = undefined;
    }, 120);
  }

  private _cancelClose(): void {
    if (this._closeTimer !== undefined) {
      clearTimeout(this._closeTimer);
      this._closeTimer = undefined;
    }
  }
}
