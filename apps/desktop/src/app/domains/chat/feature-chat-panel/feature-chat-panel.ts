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
        <div class="h-3/4" aria-hidden="true"></div>
      } @else {
        <ng-content select="[chat-empty-state]" />
      }
    </div>

    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/90 to-transparent px-4 pb-4 pt-6 dark:from-background dark:via-background/90"
    >
      <div class="pointer-events-auto">
        <hlm-composer
          [(value)]="value"
          [(mode)]="mode"
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

  protected readonly value = signal('');
  protected readonly mode = signal<ComposerMode>('normal');
  protected readonly messages = this.facade.messagesForWorkspace(
    this.workspaceId,
  );

  constructor() {
    effect(() => {
      const id = this.workspaceId();
      if (id) this.facade.ensureChatForWorkspace(id);
    });

    // Position the last message's TOP at ~70% from the top of the
    // visible viewport — message sits in the lower portion, leaving
    // the lower ~30% for the (future) assistant reply, like
    // Claude.ai / ChatGPT. The trailing h-3/4 spacer guarantees the
    // scroll position is reachable even for short messages.
    effect(() => {
      const count = this.messages().length;
      if (count === 0) return;
      queueMicrotask(() => {
        const container = this.scrollContainer()?.nativeElement;
        if (!container) return;
        const items = container.querySelectorAll('ul > li');
        const lastItem = items[items.length - 1];
        if (!(lastItem instanceof HTMLElement)) return;
        const containerRect = container.getBoundingClientRect();
        const itemRect = lastItem.getBoundingClientRect();
        const currentTop = itemRect.top - containerRect.top;
        const targetTop = container.clientHeight * 0.7;
        container.scrollBy({
          top: currentTop - targetTop,
          behavior: 'smooth',
        });
      });
    });
  }

  protected onSend(event: ComposerSendEvent): void {
    const id = this.workspaceId();
    if (!id) return;
    this.facade.sendUserMessage(id, event.text, event.mode);
    this.value.set('');
  }

  protected onStop(): void {
    /* Step 5 will cancel the in-flight stream. */
  }
}
