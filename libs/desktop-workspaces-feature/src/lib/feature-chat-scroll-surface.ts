import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { ChatFacade } from '@mozart/desktop-chat-data-access';
import { chatTabKey } from '@mozart/desktop-workspaces-data-access';
import { MzScrollSurface } from './mz-scroll-surface.directive';

/**
 * Chat-only scroll surface — the chat content's frame.
 *
 * Owns no scroll behavior of its own. The inner scroll container has
 * the MzScrollSurface directive applied, which handles:
 *   - per-chat scrollTop persistence (key = chatTabKey(ws, chatId))
 *   - IntersectionObserver-driven isAtBottom (autoFollow=true; sentinel
 *     rendered as the last child of MessageList)
 *   - registry registration (so the composer can call scrollToBottom /
 *     scrollIntoView via registry.get(workspaceId))
 *
 * What this component computes: chatTabKey from workspaceId + the
 * ChatFacade's active chat id. Everything else is delegated. Streaming
 * auto-follow is handled natively by the host's `overflow-anchor: auto`
 * (browser compositor pins the growing bottom node) — no JS writes
 * scrollTop during a stream.
 */
@Component({
  selector: 'app-feature-chat-scroll-surface',
  imports: [MzScrollSurface],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 w-full flex-col' },
  template: `
    <!-- The scrolling container. min-h-0 lets it shrink within the flex
         parent; overflow-y-auto + overflow-anchor enables native scroll
         anchoring during streaming. pb-32 reserves clearance for the
         absolutely-positioned composer overlay (composer chrome ~100px).
         The MzScrollSurface directive owns persistence (mzScrollSurface
         key), the IO at-bottom detector (mzScrollSurfaceAutoFollow), and
         the registry seam (mzScrollSurfaceRegisterAs). -->
    <div
      data-testid="chat-surface-scroll"
      class="flex min-h-0 flex-1 flex-col overflow-y-auto [overflow-anchor:auto]"
      [mzScrollSurface]="_chatTabKey()"
      mzScrollSurfaceDefault="bottom"
      [mzScrollSurfaceAutoFollow]="true"
      [mzScrollSurfaceRegisterAs]="workspaceId()"
    >
      <div class="mx-auto flex w-full max-w-5xl flex-1 flex-col pt-2.5 pb-32">
        <ng-content />
      </div>
    </div>
  `,
})
export class FeatureChatScrollSurface {
  readonly workspaceId = input<string | null>(null);

  private readonly facade = inject(ChatFacade);

  private readonly _activeChatId = computed(() => {
    const id = this.workspaceId();
    if (!id) return null;
    return this.facade.activeChatFor(id)?.id ?? null;
  });

  protected readonly _chatTabKey = computed(() => {
    const ws = this.workspaceId();
    const chatId = this._activeChatId();
    if (!ws || !chatId) return null;
    return chatTabKey(ws, chatId);
  });
}
