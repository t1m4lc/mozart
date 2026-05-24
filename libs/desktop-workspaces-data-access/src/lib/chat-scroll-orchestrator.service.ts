import { Injectable, signal, type Signal } from '@angular/core';

// 700ms covers the default smooth-scroll duration (~500ms in
// Chromium) plus a margin for layout settling. Mirrors the prior
// in-component constant in FeatureWorkspaceMiddle.scrollMainToBottom
// — see commit history before the P2.2 decoupling.
const PROGRAMMATIC_SCROLL_GRACE_MS = 700;

/** Payload of a focus request emitted by the chat-scope surface
 *  (streaming false-edge) and consumed by the always-mounted
 *  composer host. The nonce changes on every call so consecutive
 *  requests for the same workspace still fire the consumer effect. */
export interface ComposerFocusRequest {
  readonly workspaceId: string;
  readonly nonce: number;
}

/**
 * Workspace-scoped seam between the always-mounted composer
 * (`FeatureWorkspaceComposer`) and the chat-only scroll surface
 * (`FeatureChatScrollSurface`). After P2.2 these live in different
 * branches of `WorkspaceTabContent`'s `@switch`, so neither owns
 * the other's DOM. This service:
 *
 *   1. Tracks the chat scroll surface's resolved `<main>` element
 *      per workspace (`register`/`unregister`).
 *   2. Runs `scrollToBottom` on behalf of the composer without the
 *      composer ever touching the DOM. Honors
 *      `prefers-reduced-motion` and opens a programmatic-scroll
 *      grace window so the at-bottom detector ignores the partway
 *      scroll events the smooth animation fires.
 *   3. Carries a focus-request channel (signal) so the chat surface
 *      can ask the composer to refocus on streaming false-edge.
 *
 * Attach/detach state stays in `ScrollPositionService` — composer
 * queries it directly via `followModeFor(chatId)`.
 *
 * When no chat scroll surface is registered for a workspace (e.g.
 * the user is on a file tab), `scrollToBottom` is a no-op and
 * `isInGracePeriod` returns false. That's the intended
 * file-tab semantics for P2.2.
 */
@Injectable({ providedIn: 'root' })
export class ChatScrollOrchestrator {
  private readonly _mainElByWorkspace = new Map<string, HTMLElement>();
  private readonly _graceUntilByWorkspace = new Map<string, number>();

  private readonly _focusRequest = signal<ComposerFocusRequest | null>(null);
  private _focusNonce = 0;

  /** Reactive focus-request signal. Composer hosts subscribe and
   *  trigger `.focus()` when the payload's workspaceId matches. */
  readonly focusRequest: Signal<ComposerFocusRequest | null> =
    this._focusRequest.asReadonly();

  /** Chat scroll surface registers its resolved `<main>` on mount.
   *  Overwrites a prior entry for the same workspace (defensive — a
   *  fast chat→file→chat round-trip should still leave the latest
   *  mount as the active surface). */
  register(workspaceId: string, mainEl: HTMLElement): void {
    this._mainElByWorkspace.set(workspaceId, mainEl);
  }

  /** Chat scroll surface unregisters on destroy. Idempotent. */
  unregister(workspaceId: string): void {
    this._mainElByWorkspace.delete(workspaceId);
    this._graceUntilByWorkspace.delete(workspaceId);
  }

  /** Scroll the registered surface to its bottom. Respects
   *  `prefers-reduced-motion` (always `auto` when reduced). Smooth
   *  scrolls open a grace window so the at-bottom detector
   *  suppresses attach/detach flips during the animation. */
  scrollToBottom(workspaceId: string, smooth: boolean): void {
    const main = this._mainElByWorkspace.get(workspaceId);
    if (!main) return;
    const reduced =
      typeof matchMedia !== 'undefined' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    const useSmooth = !reduced && smooth;
    if (useSmooth) {
      this._graceUntilByWorkspace.set(
        workspaceId,
        performance.now() + PROGRAMMATIC_SCROLL_GRACE_MS,
      );
    }
    main.scrollTo({
      top: main.scrollHeight,
      behavior: useSmooth ? 'smooth' : 'auto',
    });
  }

  /** True while the most recent smooth `scrollToBottom` for the
   *  workspace is still animating. The at-bottom detector reads
   *  this synchronously on every scroll event. */
  isInGracePeriod(workspaceId: string): boolean {
    const until = this._graceUntilByWorkspace.get(workspaceId);
    if (until == null) return false;
    return performance.now() < until;
  }

  /** Ask the composer host for `workspaceId` to refocus its
   *  textarea. The nonce ensures consecutive requests trigger the
   *  consumer effect even for the same workspaceId. */
  requestFocus(workspaceId: string): void {
    this._focusNonce += 1;
    this._focusRequest.set({ workspaceId, nonce: this._focusNonce });
  }
}
