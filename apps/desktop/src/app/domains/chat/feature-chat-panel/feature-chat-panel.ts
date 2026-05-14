import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  HlmComposer,
  type ComposerMode,
  type ComposerSendEvent,
} from '@mozart/ui/composer';
import { ChatFacade } from '../data/chat.facade';
import { MessageList } from '../ui/message-list/message-list';

@Component({
  selector: 'app-feature-chat-panel',
  imports: [HlmComposer, MessageList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block h-full w-full' },
  template: `
    <div
      #scrollContainer
      class="absolute inset-0 overflow-y-auto"
    >
      @if (messages().length > 0) {
        <app-message-list [messages]="messages()" />
        <div class="h-48" aria-hidden="true"></div>
      } @else {
        <ng-content select="[chat-empty-state]" />
      }
    </div>

    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-4 pt-6 dark:from-background dark:via-background/90"
    >
      <div class="pointer-events-auto">
        <hlm-composer
          #composerEl
          [(value)]="value"
          [(mode)]="mode"
          [isRunning]="isStreaming()"
          (send)="onSend($event)"
          (stop)="onStop()"
        />
      </div>
    </div>
  `,
})
export class FeatureChatPanel {
  readonly workspaceId = input<string | null>(null);

  private readonly facade = inject(ChatFacade);
  private readonly scrollContainer =
    viewChild<ElementRef<HTMLDivElement>>('scrollContainer');
  private readonly composerEl = viewChild('composerEl', {
    read: ElementRef<HTMLElement>,
  });

  protected readonly value = signal('');
  protected readonly mode = signal<ComposerMode>('normal');
  protected readonly messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );
  protected readonly isStreaming = this.facade.isStreaming(this.workspaceId);

  // Bring focus to the embedded HlmComposer's textarea. Public so the
  // workspace-detail page can refocus on tab-active-change without
  // plumbing the event through the dumb tab bar. Scoped through a
  // viewChild on the composer's host element so we never reach into
  // the panel's own host.
  focusComposer(): void {
    queueMicrotask(() => {
      const ta = this.composerEl()?.nativeElement.querySelector('textarea');
      ta?.focus();
    });
  }

  // Tracked across effect runs to detect the streaming false-edge
  // (run ended OR was stopped) — that's when we refocus the composer.
  private _wasStreaming = false;

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      if (id) {
        this.facade.ensureChatForWorkspace(id);
        // Workspace entered -> focus composer so the user can type
        // immediately without a manual click.
        this.focusComposer();
      }
    });

    // Refocus the composer the moment a run ends or is stopped so the
    // user can keep typing without grabbing the mouse.
    effect(() => {
      const streaming = this.isStreaming();
      if (this._wasStreaming && !streaming) {
        this.focusComposer();
      }
      this._wasStreaming = streaming;
    });

    // Auto-scroll strategy :
    //   - last message `streaming` → keep its BOTTOM at ~70 % from
    //     the viewport top (bubble grows upward, lower 30 % stays
    //     clean for the composer overlay) ;
    //   - otherwise (user just sent, or assistant done/stopped) →
    //     anchor the TOP at ~70 %.
    // The trailing h-48 spacer matches the composer's visual
    // footprint (~192 px) so manually scrolling to the bottom puts
    // the last message just above the composer, with no excess
    // empty space.
    effect(() => {
      const msgs = this.messages();
      if (msgs.length === 0) return;
      const last = msgs[msgs.length - 1];
      if (!last) return;
      queueMicrotask(() => {
        const container = this.scrollContainer()?.nativeElement;
        if (!container) return;
        const items = container.querySelectorAll('ul > li');
        const lastItem = items[items.length - 1];
        if (!(lastItem instanceof HTMLElement)) return;
        const containerRect = container.getBoundingClientRect();
        const itemRect = lastItem.getBoundingClientRect();

        if (last.status === 'streaming') {
          const currentBottom = itemRect.bottom - containerRect.top;
          const targetBottom = container.clientHeight * 0.7;
          const delta = currentBottom - targetBottom;
          if (delta > 12) {
            container.scrollBy({ top: delta, behavior: 'smooth' });
          }
        } else {
          const currentTop = itemRect.top - containerRect.top;
          const targetTop = container.clientHeight * 0.7;
          const delta = currentTop - targetTop;
          if (Math.abs(delta) > 4) {
            container.scrollBy({ top: delta, behavior: 'smooth' });
          }
        }
      });
    });
  }

  protected onSend(event: ComposerSendEvent): void {
    const id = this.workspaceId();
    if (!id) return;
    void this.facade.sendUserMessage(id, event.text, event.mode);
    this.value.set('');
  }

  protected onStop(): void {
    const id = this.workspaceId();
    if (!id) return;
    this.facade.cancelActive(id);
  }
}
