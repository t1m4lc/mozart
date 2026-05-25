# Scroll & viewport architecture — planning report

## Context

Scrolling inside the desktop workspace shell doesn't feel native. Streaming a long agent response causes a perceptible "managed" feel — per-token JavaScript writes to `scrollTop`, a 700 ms grace window suppressing an at-bottom detector during programmatic smooth-scrolls, a 50 px-threshold scroll-event listener flipping attached/detached per scroll tick. The composer feels visually glued to content because it's `position: absolute` with a hard-coded `pb-32`/`pb-40` clearance, and there's no ChatGPT "rides up" behavior on send.

Worse, scroll behavior is split across **three separate codepaths**: `FeatureChatScrollSurface` (chat), `MzScrollPersist` directive on `MzDiffView` (file diff), and CodeMirror's internal `scrollDOM` (file edit). Each has its own restoration logic, its own conventions for keys, and its own quirks.

**Goal: one unified scroll primitive — the same directive owns scroll behavior for every scrollable surface in the app.** Chat, file diff, file edit, future surfaces. Native browser behavior whenever possible; opt-in features (auto-follow, rides-up) layered on the primitive without forking it.

No code changes in this step. This is the planning report.

---

## 1. Current behavior and architecture

### 1.1 Layout shell

Horizontal flex `AppShell` → `WorkspaceDetailPage` (vertical flex, sticky toolbar, `overflow-hidden h-full flex-col`) → `WorkspaceTabContent` (`overflow-hidden relative flex-col`). Inside `WorkspaceTabContent`:

- `@switch` between chat content and file content (destroy/recreate on switch).
- Composer is **always mounted, `position: absolute; inset-x-0 bottom-0; z-30`**.
- Composer overlay masked by a 32 px gradient + `backdrop-blur`.
- Content reserves clearance with `pb-32` (chat) / `pb-40` (file).
- `min-h-0` correctly threaded through flex columns.

Each content kind has exactly one scroll container — no nested scrolls.

### 1.2 Three separate scroll codepaths (today)

| Surface | Scroll container | Persistence | Auto-follow | At-bottom detector |
|---|---|---|---|---|
| Chat | `FeatureChatScrollSurface` host (`overflow-y-auto`) | Direct `ScrollPositionService.recall`/`remember` in component | `messages` signal → `auditTime` → `scrollTop = scrollHeight` | Scroll-event listener + 50 px threshold + 700 ms grace window |
| File diff | `MzDiffView` host (`overflow-auto`) | `MzScrollPersist` directive (`afterNextRender` + cleanup snapshot) | n/a | n/a |
| File edit | CodeMirror `scrollDOM` | **None** (TODO) | n/a | n/a |

Three implementations of "restore scrollTop on key change", three subtly different lifecycles, one of which is missing entirely.

### 1.3 Scroll-related services

- **`ScrollPositionService`** (`libs/desktop-workspaces-data-access/src/lib/scroll-position.service.ts`)
  - `_scrollByTabKey: Signal<Map<string, number>>` — keys `chat:${ws}:${chatId}` / `file:${ws}:${path}`.
  - `_followModeByChat: Signal<Map<chatId, 'attached'|'detached'>>` + signal cache.
  - API: `remember`/`recall`/`forget*`, `setAttached`/`setDetached`, `followMode*`/`isAttached`.
- **`ChatScrollOrchestrator`** (`libs/desktop-workspaces-data-access/src/lib/chat-scroll-orchestrator.service.ts`)
  - `_mainElByWorkspace: Map<wsId, HTMLElement>`; `_graceUntilByWorkspace: Map<wsId, number>`.
  - `register`/`unregister`/`scrollToBottom(smooth)`/`isInGracePeriod`/`endGracePeriod`/`requestFocus`.
- **`MzScrollPersist`** directive — restores on `key` change via `afterNextRender`, snapshots on cleanup + destroy. Used by `MzDiffView` only.

### 1.4 `FeatureChatScrollSurface` — three RxJS streams

1. `combineLatest([workspaceId, mainEl])` → `NEVER` + `finalize` → orchestrator register/unregister.
2. `combineLatest([chatTabKey, mainEl])` → on change: `afterNextRender(() => main.scrollTop = stored ?? scrollHeight)`. `finalize` snapshots.
3. `toObservable(messages)` → `filter(isAttached)` → `auditTime(0, animationFrameScheduler)` → `filter(isAttached)` → `main.scrollTop = main.scrollHeight`.

Scroll listener (`fromEvent(el, 'scroll', { passive: true })`) computes distance, flips attach/detach, with grace-window suppression and early-end on user scroll-up.

### 1.5 Composer onSend

```
scroll.setAttached(chatId)
orchestrator.scrollToBottom(ws, true)   // 700 ms grace, smooth animation
facade.sendUserMessage(...)             // user msg + streaming placeholder
```

### 1.6 Streaming pipeline

Tauri `Channel<ClaudeStreamEvent>` → `AsyncQueue` → `AsyncIterator<AgentEvent>` → `ChatFacade` emits per token; SQLite flush every 200 ms. The `messages` signal fires 50+/sec on fast streams.

### 1.7 Tab / workspace / file switch and cold boot

- Chat tab switch: `@switch` destroys surface; `finalize` snapshots; remount restores; first visit defaults to bottom.
- File tab switch: `MzScrollPersist` snapshots/restores; first visit defaults to top.
- File edit: no persistence.
- Cold boot: `RouterFacade.bootRestoreUrl()` restores URL; scroll values are session-only and reset.

---

## 2. Discovered product / business rules

Explicit (`docs/specs/plan-v0.1.0-beta.1.md` Phase 3a):
- Sticky-bottom auto-follow only when user was at bottom.
- "Scroll to bottom" button when the anchor isn't visible.
- Explicit anchor element after the last message + viewmodel signal — **not yet implemented**; code writes `scrollTop = scrollHeight` directly.

Implicit but load-bearing:
- Composer is always mounted; drafts survive tab switches via `linkedSignal`.
- Composer doesn't steal focus on stream-end when active tab is a file.
- Preview file tabs replace in place; pinned tabs append. Closing forgets per-file scroll.
- 50 px at-bottom threshold; 700 ms grace; 200 ms SQLite flush.
- Cold reload defaults to bottom (chat) / top (file).

Accidental complexity:
- Per-chat attach/detach stored centrally — derivable from geometry of the chat on screen.
- Per-frame `scrollTop = scrollHeight` write — duplicates `overflow-anchor`.
- Scroll-event listener + grace window — both go away with an IntersectionObserver-based detector.
- `ChatScrollOrchestrator.requestFocus` — only one producer (composer's own stream-end); composer can drive focus directly.
- Three parallel scroll codepaths for chat / file-diff / file-edit — one primitive should cover all three.

---

## 3. Performance issues

| # | Issue | Where | Why it hurts |
|---|---|---|---|
| P1 | Per-token `scrollTop = scrollHeight` write on animation frame | Stream 3 in `FeatureChatScrollSurface` | Fights the compositor; introduces "managed" feel |
| P2 | Scroll-event listener fires on every wheel tick + computes distance + signal-flips attach/detach | `_setupAtBottomDetector` | Wasted work between threshold crossings |
| P3 | Smooth scroll-to-bottom on every Send + 700 ms grace window | `scrollToBottom` + `isInGracePeriod` | Two systems compensating for each other |
| P4 | Three RxJS streams of bookkeeping in chat surface | `combineLatest + NEVER + finalize` × 2 + `auditTime` | One effect + one IO is enough |
| P5 | `messages` signal fires 50+/sec → flows through filter/audit/filter pipeline regardless | Stream 3 | Cheap per emission but constant; deletable with `overflow-anchor` |
| P6 | Past freeze (commit 457abe7): `FileTabsService` mirror effect read store reactively, wrote back, looped. Fixed via `untracked()` | `FileTabsService` ctor | Resolved; structural rule (no service-level mirror effects) prevents recurrence |

No nested scroll containers, no `MutationObserver`/`ResizeObserver` chains on scroll, no `scrollIntoView` per-message — those traps are already avoided.

---

## 4. UI / UX issues

- **Submitted message lands directly above the composer.** No "rides up"; user sees their just-sent message at the bottom edge and waits for the response to push it up.
- **Content feels glued to the composer** (~16 px visible breathing room after the gradient fade).
- **Smooth scroll on Send conflicts with rapid token streaming** during the 700 ms grace.
- **Composer overlay needs `backdrop-blur` + gradient hack** to hide the hard edge over scrolling content.
- **File-edit scroll is not persisted today.** Switching away from a file in edit mode and back resets to the top of the file every time (TODO noted in `feature-file-content.ts` line 395). This is a real gap — opening a 500-line file, scrolling to line 240, switching to a sibling tab, and returning lands the user back at line 1.

---

## 5. Recommended target architecture — one primitive for all surfaces

### 5.1 The single primitive: `MzScrollSurface` directive

A standalone Angular directive that owns **all scroll behavior** for any scrollable element in the app. Apply it to a chat container, a file-diff container, a CodeMirror `scrollDOM` (programmatically), or any future surface. Same lifecycle, same persistence, same conventions.

```ts
/** Shared contract — both the directive and `attachToElement` return this shape. */
export interface ScrollSurface {
  readonly isAtBottom: Signal<boolean>;
  readonly element: Signal<HTMLElement | null>;
  setKey(key: string | null): void;
  scrollToBottom(smooth?: boolean): void;
  scrollIntoView(target: HTMLElement, opts?: ScrollIntoViewOptions): void;
  scrollTo(top: number, smooth?: boolean): void;
  snapshot(): void;       // force persist now
  detach(): void;         // no-op on the directive form (DestroyRef handles it); meaningful for attachToElement
}

@Directive({
  selector: '[mzScrollSurface], [mzScrollPersist]',  // legacy alias during Phase A → Phase D transition
  exportAs: 'mzScrollSurface',
  host: {
    class: 'overflow-y-auto [overflow-anchor:auto]',
  },
})
export class MzScrollSurface implements ScrollSurface {
  // --- inputs ---
  readonly key = input<string | null>(null);                        // persistence key; null = no persistence
  readonly defaultPosition = input<'top' | 'bottom'>('top');        // first-visit landing
  readonly autoFollow = input<boolean>(false);                      // enable IO bottom-sentinel detector
  readonly registerAs = input<string | null>(null);                 // optional: register in ScrollSurfaceRegistry under this id (e.g. workspaceId)

  // --- public signals (consumers read these) ---
  readonly isAtBottom = signal<boolean>(true);                      // meaningful when autoFollow=true; default true
  readonly element = signal<HTMLElement | null>(null);              // host element ref

  // --- imperative API (matches ScrollSurface) ---
  setKey(key: string | null): void;                                  // imperative equivalent of [key] for the programmatic-attach form
  scrollToBottom(smooth?: boolean): void;
  scrollIntoView(target: HTMLElement, opts?: ScrollIntoViewOptions): void;
  scrollTo(top: number, smooth?: boolean): void;
  snapshot(): void;
  detach(): void;
}
```

The `[mzScrollPersist]` selector stays alive during Phase A → Phase D so M2 lands independently of M11. The legacy selector is removed in M11 once `MzDiffView` consumes the new name.

Behavior of the directive:
- **Container CSS**: applies `overflow-y: auto` + `overflow-anchor: auto` via host class. Consumers can override with utility classes.
- **Persistence**: when `key` changes, snapshot prior key's `scrollTop` to `ScrollPositionService.remember(prior, scrollTop)`. After the next render, restore new key's value via `ScrollPositionService.recall(key)`; fall back to `scrollHeight` (bottom) or `0` (top) based on `defaultPosition`. On destroy, final snapshot.
- **At-bottom detection** (opt in via `autoFollow`): creates one `IntersectionObserver` on a 1×1 px sentinel **expected as a `[data-scroll-sentinel]` child** (or as a content-projected slot). `rootMargin: '0px 0px 100px 0px'`, `threshold: 0`. Writes `isAtBottom`.
- **Registry**: when `registerAs` is set, registers the directive instance in `ScrollSurfaceRegistry` under that id so siblings (e.g. composer) can call `scrollToBottom` / `scrollIntoView` without DOM coupling.

### 5.2 Usage across the three surfaces

```html
<!-- Chat -->
<div
  mzScrollSurface
  [key]="chatTabKey()"
  defaultPosition="bottom"
  [autoFollow]="true"
  [registerAs]="workspaceId()"
  class="flex min-h-0 w-full flex-col [container-type:size]"
>
  <ui-message-list [messages]="messages()" />
  <div data-scroll-sentinel class="h-px w-full" aria-hidden="true"></div>
</div>

<!-- File diff -->
<div
  mzScrollSurface
  [key]="fileTabKey()"
  defaultPosition="top"
  class="h-full w-full"
>
  <mz-diff-view [...] />
</div>

<!-- File edit (CodeMirror) — programmatic attach because CM owns scrollDOM -->
<!-- In the editor host component, after EditorView is constructed:
       this.scrollSurface = this.registry.attachToElement(view.scrollDOM, {
         key: fileTabKey(ws, path),
         defaultPosition: 'top',
       });
     destroyRef.onDestroy(() => this.scrollSurface?.detach());
     Effect on (workspaceId, path) change: this.scrollSurface?.setKey(fileTabKey(ws, path));
-->
```

**Same key namespace** (`chat:${ws}:${chatId}` / `file:${ws}:${path}`) — already used by `ScrollPositionService`. Restoration logic identical for every surface. `defaultPosition` is the only knob that changes between chat and files.

### 5.3 What shrinks or disappears

| Today | Tomorrow |
|---|---|
| `MzScrollPersist` directive (file diff only) | **Renamed/extended → `MzScrollSurface` (all surfaces)** |
| `FeatureChatScrollSurface` host class `overflow-y-auto` + three RxJS streams + scroll listener + grace window | `<div mzScrollSurface [key] [autoFollow] [registerAs]>` + minimal component shell |
| Direct `scrollTop = stored` in `FeatureChatScrollSurface` `combineLatest + afterNextRender` | Directive does it |
| `ScrollPositionService.setAttached/setDetached/followMode*/isAttached` + `_followModeByChat` + signal cache | **Deleted.** At-bottom state is local to the directive's `isAtBottom` signal; consumers read via registry |
| `ChatScrollOrchestrator._mainElByWorkspace` + `_graceUntilByWorkspace` + `isInGracePeriod` + `endGracePeriod` + grace logic in `scrollToBottom` | **Deleted.** Registry exposes surface refs; smooth scroll has no grace window |
| `ChatScrollOrchestrator.requestFocus`/`_focusRequest`/`_focusNonce` | **Deleted.** Composer drives its own focus |
| Per-token `scrollTop = scrollHeight` write | **Deleted.** `overflow-anchor` pins natively |
| Scroll-event listener + 50 px threshold + signal flips per scroll tick | **Deleted.** Replaced by one IO per surface (only when `autoFollow=true`) |

`ScrollPositionService` keeps `_scrollByTabKey` + `remember`/`recall`/`forget*`. `ChatScrollOrchestrator` is renamed `ScrollSurfaceRegistry` (or merged into a single `ScrollService` if you prefer) and exposes `register(id, surface)` / `unregister(id)` / `get(id): MzScrollSurface | null`. Composer calls `registry.get(workspaceId)?.scrollIntoView(userMsgEl, { block: 'start', behavior: 'smooth' })` and `registry.get(workspaceId)?.scrollToBottom(true)`.

### 5.4 ChatGPT-style "rides up"

Implemented as a chat-only layer **on top of** the primitive — the primitive is unaware of conversation semantics:

- Wrap each `(user message + assistant response)` pair in `<div class="chat-turn">…</div>` in `MessageList`.
- Style: `.chat-turn:last-of-type { min-height: 100cqh; }`.
- Scroll host gets `container-type: size` (already added in the usage above).
- Padding-bottom on the inner content equals the composer height (`var(--composer-h, 6rem)`).
- On `Send`, composer calls `registry.get(workspaceId)?.scrollIntoView(lastUserMsgEl, { block: 'start', behavior: 'smooth' })`. Browser scrolls the user message to top; `min-height: 100cqh` provides the empty space below; `overflow-anchor` pins the assistant text as tokens stream in. **No JS writes `scrollTop`.**

The directive provides the primitive (`scrollIntoView`); the chat surface provides the conversation-specific CSS (`min-height: 100cqh`, `container-type: size`, turn-wrapping).

### 5.5 Composer relationship

Composer becomes a **flex sibling** of the scroll surface in `WorkspaceTabContent`'s flex column — not `position: absolute`. The scroll surface gets `flex: 1 1 0%` of available height; the composer takes its natural height below. Benefits:

- `100cqh` of the scroll surface = visible-to-composer height (no `pb-32` magic).
- No coupling between composer height and content `padding-bottom` (delete `pb-32`/`pb-40`).
- No need for the gradient hack or `backdrop-blur` (nothing scrolls behind the composer).
- File editor stops being hidden behind a floating composer.

Composer height is **fixed at 6rem** (`max-h-24`, `min-h-24`) and the scroll inner wrapper gets `padding-bottom: 6rem`. No `ResizeObserver`, no per-keystroke layout writes. Drafts that exceed the cap scroll internally inside the composer textarea — the only place that should grow. If real telemetry later shows users hit the cap often, revisit with a quantized (sm / md / lg) height instead of a per-keystroke observer.

### 5.6 Decisions per evaluation point

| # | Question | Decision | Why |
|---|---|---|---|
| A | `overflow-anchor: auto` + bottom sentinel | **Adopt** in primitive; delete per-frame writes | Compositor-native; one CSS line |
| B | `IntersectionObserver` for at-bottom | **Adopt** in primitive (opt-in via `autoFollow`) | No per-event work, no threshold math |
| C | "Rides up" via `min-height: 100cqh` on `.chat-turn:last-of-type` | **Adopt**; reject spacer-element option | Zero JS; ChatGPT-equivalent feel |
| D | Composer positioning | **Flex sibling**; delete absolute + gradient + `pb-32`/`pb-40` | Removes coupling between composer height and content padding |
| E | Per-surface scroll services | **One directive (`MzScrollSurface`)** + one tiny registry; consolidate `MzScrollPersist`, chat surface restore, file diff scroll, file edit scroll | Single source of scroll behavior across the app |
| F | RxJS streams in chat surface | **Drop entirely**; behavior moves into the directive | Signals + IO is simpler |
| G | 700 ms grace window | **Delete** | IO doesn't false-detach during smooth scroll |
| H | `@switch` vs `[hidden]` for tabs | **Keep `@switch`** | Sub-frame flash; `afterNextRender` handles it |
| I | Composer focus stealing | **Keep current guard** + add `document.activeElement` check | One-line safeguard |
| J | **File-edit scroll persistence (currently missing — explicit deliverable)** | **Land it via the primitive** by programmatically attaching `MzScrollSurface` to CodeMirror's `view.scrollDOM` after init. Same key namespace (`file:${ws}:${path}`), same lifecycle as the diff surface | Closes the long-standing TODO; no separate codepath for "CodeMirror scroll" |

---

## 6. Migration plan

Each step is independently mergeable and leaves the app working.

### Phase A — Build the primitive (no behavioral change yet)

| Step | What | Files | ~Diff |
|---|---|---|---|
| M1 | Add `overflow-anchor: auto` to chat scroll container host class | `feature-chat-scroll-surface.ts` | ~5 lines |
| M2 | Rename `MzScrollPersist` → `MzScrollSurface`; extend with `autoFollow`, `registerAs`, IO setup, `isAtBottom` signal, `scrollToBottom`/`scrollIntoView` imperatives. Keep existing key/restore/snapshot behavior intact | `mz-scroll-persist.directive.ts` → `mz-scroll-surface.directive.ts` (or kept name, expanded) | ~150 lines |
| M3 | Introduce `ScrollSurfaceRegistry` service (`register`/`unregister`/`get`) — small Map-backed service | new `scroll-surface-registry.service.ts` | ~40 lines |

### Phase B — Migrate chat to the primitive (behavior identical to today first)

| Step | What | Files | ~Diff |
|---|---|---|---|
| M4 | Add a `[data-scroll-sentinel]` div at end of `MessageList` | `ui-message-list.ts` | ~5 lines |
| M5 | Refactor `FeatureChatScrollSurface` to use `<div mzScrollSurface [key]="chatTabKey()" defaultPosition="bottom" [autoFollow]="true" [registerAs]="workspaceId()">…<div data-scroll-sentinel></div></div>`. Delete the host `overflow-y-auto`/restore-effect/scroll-listener AND **delete the `auditTime` auto-follow effect in the same step** — trust `overflow-anchor` end-to-end. No "parallel safety net": once M1's `overflow-anchor` is live and IO drives `isAtBottom`, an extra `scrollTop = scrollHeight` write fights user scroll-ups | `feature-chat-scroll-surface.ts` | ~110 lines net deletion |
| M6 | Switch composer's `autoFollowChat` computed to read from `registry.get(workspaceId)?.isAtBottom()` instead of `scroll.followModeFor(chatId)` | `feature-workspace-composer.ts` | ~10 lines |
| M7 | Switch composer's `onSend` and `onScrollToBottom` to call `registry.get(workspaceId)?.scrollToBottom(true)` instead of `ChatScrollOrchestrator.scrollToBottom`. Drop `scroll.setAttached`/`setDetached` calls | `feature-workspace-composer.ts` | ~15 lines net deletion |

### Phase C — Delete legacy mechanisms

| Step | What | Files | ~Diff |
|---|---|---|---|
| ~~M8~~ | Absorbed into M5 — `auditTime` stream deleted alongside the chat migration | — | — |
| M9 | Delete `ScrollPositionService.setAttached`/`setDetached`/`followMode*`/`isAttached` + `_followModeByChat` + signal cache | `scroll-position.service.ts` | ~50 lines deletion |
| M10 | Delete `ChatScrollOrchestrator` entirely (replaced by `ScrollSurfaceRegistry`); update remaining call sites. Also: wire `ScrollPositionService.forgetChat` on chat-delete and `forgetWorkspace` on workspace-delete (closes TODOS #116) — or delete both methods | `chat-scroll-orchestrator.service.ts` (removed), composer, chat surface, `chat-facade.ts`, `workspaces-facade.ts` | ~120 lines deletion + ~10 added |

### Phase D — Migrate file surfaces

| Step | What | Files | ~Diff |
|---|---|---|---|
| M11 | `MzDiffView`: switch from `[mzScrollPersist]` to `[mzScrollSurface]` (rename + same args; no behavioral change) | `mz-diff-view.ts` (libs/mozart-ui/) and any callers | ~10 lines |
| M12 | `FeatureFileContent` diff-mode effect: delete the local `effect + afterNextRender + onCleanup` pattern; rely on the directive on `MzDiffView` | `feature-file-content.ts` | ~30 lines deletion |
| M13 | **File-edit scroll persistence (new feature).** In the CodeMirror editor host component, immediately after `new EditorView({ ... })`: `const surface = registry.attachToElement(view.scrollDOM, { key: fileTabKey(ws, path), defaultPosition: 'top' });`. On `(workspaceId, path)` change inside the same host: `surface.setKey(fileTabKey(ws, path))` so the directive snapshots the prior path and restores the new one. On destroy: `surface.detach()`. Verifies that opening a long file, scrolling deep, switching tabs, and returning restores the exact line | wherever CodeMirror is mounted (editor host component) | ~30 lines (net addition — first time this feature exists) |

### Phase E — ChatGPT "rides up" + composer breathing room

| Step | What | Files | ~Diff |
|---|---|---|---|
| M14 | Wrap consecutive `user → assistant` messages into `.chat-turn` divs (derived `turns()` computed) | `ui-message-list.ts` | ~40 lines |
| M15 | Add CSS: `.chat-turn:last-of-type { min-height: 100cqh; }` and `container-type: size` on the chat scroll surface | `ui-message-list.ts` styles | ~5 lines |
| M16 | Move composer from `absolute` to flex sibling; delete `pb-32`/`pb-40` and gradient overlay; set `padding-bottom: var(--composer-h, 6rem)` on chat scroll inner wrapper (and one `ResizeObserver` writing `--composer-h` from composer height — or fix at 6rem) | `workspace-tab-content.ts`, `feature-workspace-composer.ts`, chat surface | ~25 lines |
| M17 | "Rides up" on send: in composer `onSend`, after `facade.sendUserMessage`, `afterNextRender(() => registry.get(workspaceId)?.scrollIntoView(lastUserMsgEl, { block: 'start', behavior: 'smooth' }))`. Chat surface exposes `lastUserMessageEl()` via the registry or via a viewchild surfaced by the chat-content component | `feature-workspace-composer.ts`, chat surface | ~15 lines |

### Phase F — Final cleanup

| Step | What | Files | ~Diff |
|---|---|---|---|
| M18 | Delete `ChatScrollOrchestrator.requestFocus`/`_focusRequest`/`_focusNonce` (if still present after M10) | composer, registry/orchestrator | ~15 lines deletion |
| M19 | Add `document.activeElement` guard to streaming-false-edge composer focus handler | `feature-workspace-composer.ts` | ~5 lines |

### Phase G — Perf validation (verify the win)

| Step | What | Files | ~Diff |
|---|---|---|---|
| M20 | Capture before/after metrics during a 60s streamed response: scroll-event listener invocations (target: 0), JS `scrollTop` writes during stream (target: 0), FPS p95 (target: ≥60), main-thread layout time per frame (target: <2ms), `padding-bottom` recalc rate (target: 0 with fixed-height composer). Run on Tauri Chromium webview **and** Linux WebKitGTK (TODOS #95 already shipped a WebKit fix; perf claim should hold on the slower platform too) | profiling notes under `docs/tmp/scroll-perf-before.md` and `docs/tmp/scroll-perf-after.md` | ad-hoc |

After all phases: one directive owns scroll behavior; `ScrollPositionService` is half the size; `ChatScrollOrchestrator` is gone (replaced by a ~40-line `ScrollSurfaceRegistry`); chat surface is ~80 lines vs current ~340; file-edit scroll is restored properly for the first time; perf claim validated.

### 6.1 Resolved decisions

- **Test framework — Jest/Vitest via `@angular/build:unit-test`** (already in use across the touched libs). All unit + component specs in this migration use the same executor. **E2E for "rides up" and file-edit scroll restore is deferred** as a TODO (no Playwright/Cypress harness in the repo today); replaced by manual verification steps in §6.2.
- **Registry namespacing — chat-only.** `ScrollSurfaceRegistry.register(workspaceId, surface)` is invoked only by the chat scroll surface. File diff and file edit do **not** register because no sibling (composer or otherwise) needs to address them. If a future surface needs that seam, introduce a typed key (`chatSurface:{wsId}` / `editor:{wsId}:{path}`) at that point — not pre-emptively.

### 6.2 Verification

1. `pnpm nx serve desktop` (or project run target). With a long agent response:
   - No mid-stream scroll jitter; user scrolling up doesn't get yanked.
   - Sending rides the user message to near-top with empty space below.
   - Streaming fills the empty space without further scrolling.
   - Overflowing responses resume natural scrolling; IO governs auto-follow.
2. `tools/verify-scope-tags.sh` — confirm no module boundary violations.
3. `pnpm nx graph --print --affected` — confirm scope.
4. Tab/workspace switching: scroll position restored for chat and file diff; **file edit now also restores** — explicit test: open a long file in edit mode, scroll to line ~250, switch to a sibling tab, return, confirm landing at line ~250 (not line 1).
5. Cold boot: URL restored; chat lands at bottom; file diff and file edit land at top (or first-visit default).
6. `prefers-reduced-motion`: enabled → smooth scrolls use `behavior: 'auto'`.

---

## 7. Risks and edge cases

1. **`overflow-anchor` interaction with collapsible message renderers (Phase 3b Timeline).** Collapse above the anchor: anchor stays pinned (correct). Collapse below: no anchor change (correct). Re-verify when 3b lands.
2. **`100cqh` requires `container-type: size`** which establishes containment. Scope to the chat scroll host only.
3. **Composer ↔ `overflow-hidden`**: with absolute children gone, `overflow-hidden` still clips the scroll surface; confirm `min-h-0` remains on the flex column.
4. **IO init flash on chat switch.** Seed `isAtBottom = true` on key change; IO corrects within one frame.
5. **`scrollIntoView({ behavior: 'smooth' })` interruptible by user wheel.** Correct UX; don't try to lock the animation.
6. **`prefers-reduced-motion`** — same branch as today; pass `behavior: 'auto'`.
7. **CodeMirror `scrollDOM` (file-edit persistence)**: programmatic attach must happen after `EditorView` is constructed. Detach on destroy via `DestroyRef`. Two CM-specific subtleties to verify:
   - CM may briefly self-scroll on first mount (e.g. to a selection at line 1). The directive's restore must run *after* CM's initial layout — do it in `afterNextRender` post-attach, or after a `view.requestMeasure` callback.
   - If the file content changes (external rewrite, branch switch), the cached `scrollTop` may be invalid. Acceptable: clamp to `scrollHeight` on restore so we don't seek beyond EOF.
8. **`MzScrollPersist` rename** breaks consumers — only `MzDiffView` and any direct usages. M2 + M11 are paired in the same PR or done back-to-back.
9. **Registry lifecycle**: registry must `unregister` on directive destroy. Use `DestroyRef.onDestroy`; verify no leaked refs across hot reload in dev.
10. **Tauri webview**: Chromium — all of `overflow-anchor`, `container-type: size`, `100cqh`, IO are supported.

---

## 8. What NOT to do

- Don't call `scrollIntoView` on every new message or every token — reintroduces the fight `overflow-anchor` solves. **`scrollIntoView` runs once per Send.**
- Don't use `position: sticky` on the composer — silently no-ops inside `overflow: hidden` ancestors.
- Don't measure composer height in JS to compute a spacer height — `padding-bottom: var(--composer-h)` (one observer) or a fixed value.
- Don't keep both the scroll-event listener AND IntersectionObserver "for safety" — they will disagree at edges and the grace window comes back.
- Don't persist attach/detach to localStorage / SQLite — transient UI state.
- Don't use `position: fixed` on the composer — escapes the workspace flex column.
- Don't add `MutationObserver` or `requestAnimationFrame` loops to re-pin the bottom — `overflow-anchor` does this in the compositor.
- Don't `scrollTo({ behavior: 'smooth' })` and simultaneously write `scrollTop` — Chromium cancels the former silently.
- Don't make the bottom sentinel `position: absolute` — must be in normal flow so IO sees natural geometry.
- Don't switch from `@switch` to `[hidden]` "to avoid the flash" — sub-frame; running parallel scroll surfaces is worse.
- Don't fork the primitive into chat-only and file-only variants — keep all behavior in `MzScrollSurface`, gated by inputs.

---

## Critical files

- `libs/desktop-workspaces-feature/src/lib/mz-scroll-persist.directive.ts` → renamed/extended to `mz-scroll-surface.directive.ts` (the single primitive)
- `libs/desktop-workspaces-data-access/src/lib/scroll-position.service.ts` (keep persistence; delete attach/detach API)
- `libs/desktop-workspaces-data-access/src/lib/chat-scroll-orchestrator.service.ts` (delete; replaced by `ScrollSurfaceRegistry`)
- new: `libs/desktop-workspaces-data-access/src/lib/scroll-surface-registry.service.ts` (thin Map-backed registry)
- `libs/desktop-workspaces-feature/src/lib/feature-chat-scroll-surface.ts` (shrink to ~80 lines; directive in template)
- `libs/desktop-workspaces-feature/src/lib/feature-workspace-composer.ts` (consume registry; flex sibling)
- `libs/desktop-workspaces-feature/src/lib/feature-detail/workspace-tab-content.ts` (composer becomes flex sibling)
- `libs/desktop-chat-ui/src/lib/ui-message-list.ts` (sentinel + `.chat-turn` wrapping + `min-height: 100cqh`)
- `libs/mozart-ui/.../mz-diff-view.ts` (switch to `[mzScrollSurface]`)
- `libs/desktop-workspaces-feature/src/lib/feature-file-content.ts` (delete local scroll restore effect)
- CodeMirror editor host component (programmatic `MzScrollSurface` attach for `scrollDOM`)

---

## GSTACK REVIEW REPORT

`/plan-eng-review` — 2026-05-25, branch `wt-scroll`, base commit `dd80925`.

### Step 0 — Scope Challenge

| Check | Verdict |
|---|---|
| File touch count | ~10 (borderline; 8+ is a smell). Justified by deliberate consolidation, not creep. |
| New services / classes | 1 service (`ScrollSurfaceRegistry`), 1 directive rename+extend (`MzScrollSurface`). Within budget. |
| Layer 1 alternative | `@angular/cdk` is on disk but **unused**. `CdkScrollable` + `ScrollDispatcher` rejected: 70% of the primitive's value (persistence, IO sentinel, registry, programmatic attach) stays custom either way. |
| Future virtual-scroll path | **`content-visibility: auto` per `.chat-turn`** (Chromium-native), NOT CDK Virtual Scroll. Closes TODO #71 with a Layer-1 answer. CDK Virtual Scroll was already reverted once (`37f6171`) because variable-height streaming markdown breaks both `FixedSize` and experimental `AutoSize` strategies. |
| Distribution | n/a — internal Angular code, no new artifact. |
| Completeness | **Full lake** (user-confirmed). Migration ships its own tests; perf validation included. |

### Findings & decisions (resolved with user)

| ID | Topic | Decision |
|---|---|---|
| D1 | Build MzScrollSurface from scratch vs wrap CdkScrollable | **From scratch.** CDK doesn't pull weight here. Document the rejection inline in the plan (this report). |
| D2 | Phase B parallel `auditTime` safety net | **Delete in M5, not M8.** Trust `overflow-anchor`. M8 absorbed into M5. |
| D3 | Test thoroughness | **Full lake.** Per-phase test work as enumerated in §T. |

### Section 1 — Architecture

**[P2] (confidence 8/10) — `MzScrollSurface` has a dual API surface (declarative directive + programmatic `attachToElement`); plan defines neither a shared interface nor the imperative `setKey`.**
Both forms must implement the same contract or consumers diverge. Recommendation: define
```ts
export interface ScrollSurface {
  readonly isAtBottom: Signal<boolean>;
  readonly element: Signal<HTMLElement | null>;
  setKey(key: string | null): void;
  scrollToBottom(smooth?: boolean): void;
  scrollIntoView(target: HTMLElement, opts?: ScrollIntoViewOptions): void;
  scrollTo(top: number, smooth?: boolean): void;
  snapshot(): void;
  detach(): void; // no-op for directive form (DestroyRef handles it); meaningful for attachToElement
}
```
Both `MzScrollSurface` directive and the object returned by `ScrollSurfaceRegistry.attachToElement(...)` implement `ScrollSurface`. The directive's `key` input remains reactive; `setKey()` is the imperative-equivalent. Plan §5.1 should list `setKey()` and `detach()` explicitly.

**[P2] (confidence 8/10) — Registry lifetime races with `@switch` destroy/recreate.**
Composer reads `registry.get(workspaceId)` reactively. On chat-tab switch, the surface is destroyed (unregister) then a new one mounts (register) within the same change-detection turn. Between the two, `get()` returns `null` — and the composer's `autoFollowChat` computed will briefly flicker the scroll-to-bottom button visible.

Recommendation: make the registry signal-backed: `private _entries = signal<Map<string, Signal<ScrollSurface | null>>>(new Map())`. Each id has its own writable signal. Register/unregister mutates the inner signal, not the outer Map. Subscribers don't see the registry "lose" the entry mid-turn — they see one transition `surface_old → surface_new` after change detection settles.

**[P2] (confidence 7/10) — `registerAs` namespacing is ambiguous.**
Plan uses `[registerAs]="workspaceId()"` for chat. If file-diff also registers under workspaceId (or if a future surface does), they collide silently — last-registered wins. Recommendation: change the contract — `registerAs` accepts a *purpose-prefixed* key (`'chatSurface:' + workspaceId`) or only chat registers (file-diff doesn't need composer-seam access). Tighten the docstring on the input.

**[P3] (confidence 7/10) — `container-type: size` semantics on the chat scroll surface.**
Required for `100cqh` to resolve. Scope it to the chat scroll host only — applying it higher would change how descendants' percentage heights compute. Verify the existing message renderers (code blocks, images) still size correctly. Worth one Playwright screenshot diff before/after as part of M15.

**[P3] (confidence 6/10) — Plan does not state where the new feature lives.**
`ScrollSurfaceRegistry` is proposed in `desktop-workspaces-data-access`. `MzScrollSurface` lives in `desktop-workspaces-feature`. Module-boundary rule: `feature → feature|ui|data-access|util`, so the directive depending on the service is fine. But CodeMirror's editor host (in `feature-file-content.ts` or wherever CodeMirror lives) needs to inject the registry — confirm no `ui → data-access` violation if the editor host is in a UI lib. Run `tools/verify-scope-tags.sh` after M3.

### Section 2 — Code quality

**[P1] (confidence 9/10) — `MzScrollPersist` → `MzScrollSurface` rename breaks Phase A's "no behavioral change" promise.**
Plan §6 risk #8 admits "M2 + M11 are paired in the same PR or done back-to-back". That contradicts "each step independently mergeable". Fix: keep both selectors during transition.
```ts
@Directive({ selector: '[mzScrollSurface], [mzScrollPersist]', ... })
```
M2 lands with both selectors. M11 removes the legacy selector (and migrates `mz-diff-view.ts`). Phase A genuinely lands alone. Apply the same to `exportAs` if any template uses `#x="mzScrollPersist"`.

**[P2] (confidence 7/10) — ResizeObserver writing `--composer-h` per keystroke is the wrong default.**
A growing textarea fires RO every typed character. Each write triggers a recalc of `padding-bottom` on the scroll container. Recommendation order:
1. **Default**: set `padding-bottom: 6rem` as a constant. Cap composer max-height at the same value (Tailwind: `max-h-24` or similar). Removes the RO entirely.
2. **If users need taller composers**: ResizeObserver writes the variable, but throttle the writes by skipping when the delta is < 4px. Or quantize to discrete bands (sm/md/lg).
3. **Reject**: per-character live update. Layout-thrash for no UX win.

**[P3] (confidence 9/10) — `forgetChat` / `forgetWorkspace` already unused before this refactor (TODOS #116).**
Plan §5.3 keeps `forgetWorkspace` and drops `forgetChat`. Either wire `forgetChat` on chat-delete and `forgetWorkspace` on workspace-delete (one-line each in ChatFacade / WorkspacesFacade) as part of M9, or delete both methods. Leaving dead code is the worst option.

### Section 3 — Test review

#### Test diagram

```
PRIMITIVE (MzScrollSurface)
  Directive form
    ├── [GAP] [★★★] key change → snapshot prior + restore new (afterNextRender)
    ├── [GAP] [★★]  destroy → final snapshot
    ├── [GAP] [★★★] defaultPosition 'top' / 'bottom' fallback when no recall value
    ├── [GAP] [★★]  null key → no persistence ops
    └── [GAP] [★★★] autoFollow=true → IO observes sentinel, flips isAtBottom
  Programmatic form (attachToElement)
    ├── [GAP] [★★★] attach to detached element → registers, snapshots/restores on setKey
    ├── [GAP] [★★]  detach() → unregisters, no leaked refs
    └── [GAP] [★★★] CodeMirror scrollDOM scenario (use a fake scrollDOM-shaped el)

REGISTRY (ScrollSurfaceRegistry)
    ├── [GAP] [★★★] register/get/unregister round-trip
    ├── [GAP] [★★]  re-register under same id → previous entry replaced
    ├── [GAP] [★★★] signal-backed entry: subscribers see null between unregister and re-register (or atomically if chosen design)
    └── [GAP] [★★]  detached on host destroy (DestroyRef)

CHAT SCROLL SURFACE
    ├── [MUTATE] feature-chat-scroll-surface.spec.ts (299 lines)
    │   - Delete: 3 RxJS streams assertions, scroll-event listener tests, grace-window tests
    │   - Add: directive integration (template uses [mzScrollSurface]), IO-driven isAtBottom
    └── [GAP] [→E2E] Playwright: scroll up during stream → no auto-jump

COMPOSER
    ├── [MUTATE] feature-workspace-composer.spec.ts (288 lines)
    │   - Delete: orchestrator.scrollToBottom assertions, scroll.setAttached calls
    │   - Add: registry.get(ws)?.scrollToBottom + scrollIntoView on send
    │   - Add: autoFollowChat reads from registry.get(ws)?.isAtBottom()
    └── [GAP] [★★]  document.activeElement guard in stream-end focus handler

FILE DIFF
    └── [MUTATE] feature-file-content.spec.ts (175 lines)
        - Delete: local effect+afterNextRender+onCleanup pattern assertions
        - Verify: directive on MzDiffView still restores diff scrollTop

FILE EDIT (NEW — first time tested)
    ├── [GAP] [★★★] CodeMirror mount + attach → recall restores scrollTop after CM layout
    ├── [GAP] [★★]  destroy → final snapshot
    ├── [GAP] [★★★] file content changes externally → restore clamps to scrollHeight
    └── [GAP] [→E2E] open long file, scroll to line ~250, switch tab, return → land at ~250

CHATGPT RIDES-UP
    ├── [GAP] [→E2E] send message in chat tab → user message lands near top, empty space below
    ├── [GAP] [→E2E] streaming fills empty space without further scrolling
    └── [GAP] [→E2E] response overflowing 100cqh → natural scrolling, IO governs follow

DELETIONS
    ├── chat-scroll-orchestrator.service.spec.ts (194 lines) → DELETE (orchestrator gone)
    └── mz-scroll-persist.directive.spec.ts (156 lines) → RENAME → mz-scroll-surface.directive.spec.ts, EXPAND

REGRESSION (mandatory)
    └── [GAP] [★★★] FileTabsService construction with seeded openByWorkspace state does NOT freeze
        - Mirrors commit 457abe7 scenario
        - Prevents future "service reads store reactively, writes back, loops" pattern

COVERAGE: 0/19 new paths tested  |  Existing: 6 specs / 1,284 lines (4 mutate, 2 delete-or-rename)
QUALITY TARGET: ★★★:14 ★★:5 — 7 unit gaps + 5 E2E + 1 regression
```

Legend: ★★★ behavior + edge + error  |  ★★ happy path  |  [→E2E] integration  |  [MUTATE] update existing spec

#### Test plan addenda

- **Regression spec is non-negotiable.** Commit 457abe7 freeze happened once; any architectural change near `FileTabsService` or signal-mirror patterns must keep the regression test green.
- **E2E for "rides up"** is the only way to validate the user-visible win. Requires whatever e2e harness you adopt (Playwright recommended; not detected in repo today — confirm before commiting to it).
- **Test framework**: Nx + Angular 22 → Jest is the default test target. Confirm via `pnpm nx show project <proj> --json` for any touched lib.

### Section 4 — Performance

**[P2] (confidence 7/10) — Plan claims "no managed feel" with no measurement.**
Add Phase G (perf validation) as the last step, with before/after captures:

| Metric | Today (baseline) | Target |
|---|---|---|
| scroll-event listener invocations during 60s stream | every wheel tick × stream-event-count | 0 (no listener) |
| JS `scrollTop` writes during 60s stream | ~1/frame via auditTime | 0 (overflow-anchor handles it) |
| FPS during stream (avg, p95) | TBD (Chrome DevTools Performance trace) | 60 fps p95 |
| Main-thread layout time per stream frame | TBD | < 2 ms |
| `padding-bottom` recalc rate (if RO retained) | per-keystroke | 0 or quantized |

Capture both **Tauri Chromium webview** and **Linux WebKitGTK** (TODO #95 fix is shipped, but the perf claim should be validated on the slower platform too).

**[P3] (confidence 8/10) — `100cqh` perf is fine in steady state but worth a sanity check during streaming.**
`cqh` resolves to the container's computed height. Once `container-type: size` is set, the value is constant unless the container itself resizes. Streaming doesn't resize the container — only its content. No re-evaluation per token. Confirmed by spec; trust it but include in the Phase G profile to be sure.

**[P3] (confidence 8/10) — IO sentinel callback rate.**
Chromium fires IO callbacks within ~1 frame of threshold crossing, not per scroll event. For a single sentinel per surface and 2-4 surfaces at most, total IO load is negligible. No mitigation needed.

### NOT in scope

- Anchor-based scroll persistence (TODOS #59) — the primitive's key API can later add an `anchor` mode; doing it now expands the contract without proven value.
- CDK Virtual Scroll for chat (TODOS #71) — superseded by `content-visibility: auto` recommendation; treat as a different work item triggered when chats exceed ~1k messages.
- File path identity changes (TODOS #83) — primitive inherits today's key scheme; rename handling is orthogonal.
- macOS / Windows scroll-feel parity (TODOS #95) — already shipped for Linux; non-Linux is a separate investigation.
- Chat draft persistence to disk — out of scope; session-only by design.

### What already exists (reused, not rebuilt)

- `ScrollPositionService._scrollByTabKey` — keep the Map + remember/recall/forget* methods; primitive delegates to them. Don't reinvent persistence storage.
- Existing key factories `chatTabKey(ws, chatId)` / `fileTabKey(ws, path)` — primitive accepts the string output; key shape unchanged.
- `MzScrollPersist` directive's `afterNextRender` + cleanup pattern (~156 lines) — preserved as the core of `MzScrollSurface`'s persistence path; tested logic carries over.
- 1,284 lines of existing specs — 4 mutate, 2 rename/delete; not rewritten end-to-end.
- WebKitGTK Linux scroll tweak in `apps/desktop/src-tauri/src/lib.rs` (TODOS #95) — already shipped; no change.

### Failure modes (per new codepath)

| Codepath | Failure mode | Tested? | Handled? | User experience |
|---|---|---|---|---|
| IO sentinel on chat surface | Sentinel never enters viewport (e.g., zero messages) | NEW | Default `isAtBottom = true` | Composer shows "attached" state correctly |
| Programmatic CodeMirror attach | Attach fires before CM lays out, restore overshoots | NEW | Use `view.requestMeasure` or `afterNextRender` | User lands at line 1 instead of recall position; **clear failure**, not silent |
| Registry get() during destroy/recreate | Returns null mid-turn | NEW | Signal-backed entry per design | Composer scroll-to-bottom button flicker (sub-frame) |
| `scrollIntoView` on send when user already at top | Browser still smooth-scrolls to "start" (a no-op) | NEW | Browser handles correctly | No visible change |
| `overflow-anchor` mis-anchors on dynamic media | Image load below anchor pushes anchor down | NEW | Mostly handled by anchor algorithm | Possible one-time jump; acceptable per spec |
| `100cqh` + zero-message chat | Empty chat has a tall empty space | NEW | `min-height` only on `:last-of-type` of `.chat-turn`; no turn = no min-height | Fresh chat looks correct |
| File rename mid-session | Cached scrollTop under stale key | NOT (TODO #83) | Not handled today; same as today | New path opens at top |

**Critical gap candidates**: programmatic CM attach (no test plan today) and the registry signal-backed entry shape (no test plan today). Both are NEW failure modes — addressed by Section 3 test list.

### Worktree parallelization

Module touch table (directories, not files):

| Step | Modules | Depends on |
|---|---|---|
| M1 | `desktop-workspaces-feature/feature-chat-scroll-surface` | — |
| M2 (rename + extend + alias selector) | `desktop-workspaces-feature/mz-scroll-persist→surface` | — |
| M3 | `desktop-workspaces-data-access/scroll-surface-registry` (new) | — |
| M4 | `desktop-chat-ui/ui-message-list` | — |
| M5 (chat → directive + drop auditTime) | `desktop-workspaces-feature/feature-chat-scroll-surface` | M2, M3, M4 |
| M6, M7 | `desktop-workspaces-feature/feature-workspace-composer` | M3, M5 |
| M9, M10 | `desktop-workspaces-data-access/{scroll-position, chat-scroll-orchestrator}` | M5, M6, M7 |
| M11 | `mozart-ui/mz-diff-view` | M2 |
| M12 | `desktop-workspaces-feature/feature-file-content` | M11 |
| M13 (file-edit attach) | CodeMirror editor host (`feature-file-content`) | M2, M3 |
| M14-M15 | `desktop-chat-ui/ui-message-list` (styles) | M4 |
| M16 | `desktop-workspaces-feature/{workspace-tab-content, feature-workspace-composer}` | M5 |
| M17 | `desktop-workspaces-feature/feature-workspace-composer` | M5, M14 |
| M18, M19 | `desktop-workspaces-feature/feature-workspace-composer` | M10 |
| M20 (Phase G perf validation) | profiling artifacts | all migration steps |

Parallel lanes:

- **Lane A** (primitive + registry): M1 → M2 → M3 — independent foundation. Land alone.
- **Lane B** (chat migration): M4 → M5 → M6 → M7 — depends on Lane A.
- **Lane C** (legacy delete): M8 (absorbed into M5) → M9 → M10 — depends on Lane B.
- **Lane D** (file diff + file edit): M11 → M12 → M13 — depends on Lane A only, can parallel Lanes B + C after A merges.
- **Lane E** (rides-up): M14 → M15 → M16 → M17 — depends on Lane B (chat surface migrated).
- **Lane F** (cleanup + perf): M18 → M19 → M20 — depends on all prior.

Execution: A in isolation. Then B + D in parallel (different lib roots, near-zero conflict risk). C after B. E after B. F last.

Conflict flag: M11 and M12 both touch the file-content area, but in distinct components — low conflict.

### Implementation Tasks

Synthesized from the findings above.

- [ ] **T1 (P1, human: ~2h / CC: ~30m)** — `mz-scroll-surface.directive.ts` — Define `ScrollSurface` interface and ensure both directive form and `attachToElement` return objects implement it. Add `setKey(string | null): void` to the imperative API.
  - Surfaced by: Section 1 — Architecture
  - Files: `libs/desktop-workspaces-feature/src/lib/mz-scroll-persist.directive.ts` (→ renamed), `libs/desktop-workspaces-data-access/src/lib/scroll-surface-registry.service.ts` (new)
  - Verify: type-check + spec asserts both forms satisfy the interface

- [ ] **T2 (P1, human: ~30m / CC: ~5m)** — Directive — Keep `[mzScrollPersist]` as an alias selector during the M2↔M11 gap so Phase A lands independently.
  - Surfaced by: Section 2 — Code quality
  - Files: directive `@Directive({ selector: '[mzScrollSurface], [mzScrollPersist]' })`
  - Verify: `MzDiffView` template unchanged after M2 lands; works until M11 cleans up.

- [ ] **T3 (P1, human: ~1h / CC: ~15m)** — `scroll-surface-registry.service.ts` — Signal-backed entries: `Map<string, WritableSignal<ScrollSurface | null>>`. Subscribers re-fire on register/unregister atomically with change detection.
  - Surfaced by: Section 1 — Architecture
  - Verify: composer reads `registry.entry(workspaceId)()` and sees correct value across @switch destroy/remount cycles.

- [ ] **T4 (P2, human: ~30m / CC: ~10m)** — Plan §5.5 — Default to `padding-bottom: 6rem` constant + composer `max-h-24`; drop the ResizeObserver from M16 unless real telemetry shows users hit the cap.
  - Surfaced by: Section 2 — Code quality
  - Files: chat scroll surface styles, composer max-height
  - Verify: typing a 20-line draft doesn't visibly thrash content padding.

- [ ] **T5 (P1, human: ~3h / CC: ~45m)** — Full test plan as enumerated in §3 above. New: 14 ★★★ + 5 ★★ unit specs, 5 E2E specs, 1 regression spec. Mutate: 4 existing specs. Delete: 1 (`chat-scroll-orchestrator.service.spec.ts`).
  - Surfaced by: Section 3 — Test
  - Files: all `*.spec.ts` listed in §T diagram
  - Verify: `pnpm nx run-many --target=test --all` green; new specs ≥ ★★ coverage on every new path; regression spec models commit 457abe7's freeze scenario.

- [ ] **T6 (P2, human: ~2h / CC: ~30m)** — Phase G perf validation — capture before/after metrics per §4 table. Tauri Chromium + Linux WebKitGTK.
  - Surfaced by: Section 4 — Performance
  - Files: ad-hoc profiling notes in `docs/tmp/scroll-perf-{before,after}.md`
  - Verify: scroll-event listener invocations during 60s stream go from N to 0; FPS p95 ≥ 60.

- [ ] **T7 (P2, human: ~30m / CC: ~5m)** — Document the CDK Virtual Scroll rejection inline in the plan §5; close TODOS #71 with "use `content-visibility: auto` per `.chat-turn`".
  - Surfaced by: Step 0
  - Files: this plan, `TODOS.md`
  - Verify: TODOS #71 marked superseded; future readers find the rationale.

- [ ] **T8 (P3, human: ~30m / CC: ~5m)** — Wire `forgetChat` / `forgetWorkspace` on chat-delete / workspace-delete, OR delete both methods.
  - Surfaced by: Section 2 — Code quality (TODOS #116)
  - Files: `chat-facade.ts`, `workspaces-facade.ts` (or wherever delete happens)
  - Verify: closing a chat triggers `scrollPosition.forgetChat`; spec asserts.

### Unresolved decisions

- **Test framework**: plan should pin Jest (Nx default) vs adopt Playwright for E2E rides-up + file-edit-persistence. Not detected in repo today.
- **Registry namespacing for non-chat surfaces** (file diff, file edit) — left as "chat-only registers, others don't" pending real demand; revisit if composer or another sibling needs to address them.

### Verdict

**CLEARED with concerns.** Three architectural decisions resolved (D1: from-scratch primitive; D2: delete auditTime in M5; D3: full-lake tests). Eight implementation tasks added (T1–T8). Plan §5.1 needs the `ScrollSurface` interface + `setKey` listed. Plan §5.5 should default to fixed composer height. Plan §6 should add Phase G (perf validation) and absorb M8 into M5. Outside voice was not invoked — recommend running `/codex plan-review` before implementation if independent second-opinion desired.

**UNRESOLVED:** 2 (test framework pick, registry namespacing for non-chat surfaces).
**CRITICAL GAPS:** 0 — every new failure mode has a test in T5.
**ISSUES FOUND:** Architecture 5 (P2×3, P3×2) | Code Quality 3 (P1×1, P2×1, P3×1) | Tests 0 unresolved (full plan in T5) | Performance 3 (P2×1, P3×2).

