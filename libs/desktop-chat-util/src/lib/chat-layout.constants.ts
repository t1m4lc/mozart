// Tunable layout constants for the chat scroll surface + composer
// overlap. Centralized so dogfood passes can iterate the values
// without hunting through three components. JS-consumed numbers live
// here directly ; Tailwind class values are documented as comments
// because Tailwind v4 needs the literal class string in the source
// scan (a class read out of a const string wouldn't be picked up
// by the JIT). When you change one of the Tailwind-class values,
// update the matching constant comment too.
//
// Geometry (top → bottom of viewport) :
//
//   ┌───────────────────────────────────┐  ← scroll surface top
//   │  CHAT_TOP_FADE_HEIGHT_PX (sticky) │     gradient fade
//   ├───────────────────────────────────┤
//   │                                   │
//   │   chat content / messages         │
//   │                                   │
//   │   ┌─ in-flight spacer ─┐          │     CHAT_IN_FLIGHT_SPACER_VH
//   │   │   (50vh below      │          │     while a turn is mid-flight
//   │   │    last message)   │          │
//   │   └────────────────────┘          │
//   ├───────────────────────────────────┤
//   │  CHAT_COMPOSER_OVERLAY_PX         │     reserved by inner pb-* +
//   │  (composer chrome ~120-140px +    │     auto-follow target offset
//   │   ~20px breathing room)           │
//   └───────────────────────────────────┘  ← scroll surface bottom

/**
 * Vertical footprint reserved at the bottom of the chat scroll
 * surface for the absolutely-positioned composer overlay. The
 * auto-follow tap targets `lastMsg.offsetBottom - clientHeight +
 * CHAT_COMPOSER_OVERLAY_PX` so the newest message lands just above
 * the composer chrome instead of being tucked under it.
 *
 * Real composer measured during dogfood ranges 120–140px depending
 * on which mode/model selectors are shown. Headroom :
 *   CHAT_COMPOSER_OVERLAY_PX - 140 = 20px minimum breathing room.
 *
 * Mirrored by the inner-wrapper bottom padding `pb-48` (= 192px)
 * in `FeatureChatScrollSurface`'s template, which provides the
 * same clearance for the static at-rest case (no auto-follow).
 */
export const CHAT_COMPOSER_OVERLAY_PX = 160;

/**
 * Distance-from-content-end threshold for the at-bottom detector
 * inside `FeatureChatScrollSurface`. Under this, the chat is
 * considered "attached" (auto-follow on) ; over it, the user is
 * deemed to have scrolled up to read history and auto-follow is
 * suspended.
 *
 * Measured against the bottom of the last real message, not
 * `scrollHeight` — `MessageList` appends a 50vh in-flight spacer
 * that would otherwise keep the detector permanently detached.
 */
export const CHAT_AT_BOTTOM_THRESHOLD_PX = 80;

/**
 * Height of the in-flight spacer appended by `MessageList` while
 * the user just sent a prompt or the assistant is still streaming.
 * Reserves vertical room below the last real message so the
 * agent's response can land into pre-allocated space without
 * forcing a scroll on every token.
 *
 * Used as a Tailwind class `h-[50vh]` in MessageList's template —
 * keep this constant in sync with that literal. If you tune it
 * here, change the class there too.
 */
export const CHAT_IN_FLIGHT_SPACER_VH = 50;

/**
 * Height of the top fade gradient sticky-pinned to the top of the
 * scroll surface viewport. Softens the seam where chat content
 * scrolls under the workspace header.
 *
 * Used as a Tailwind class `h-10` in `FeatureChatScrollSurface`'s
 * template — keep this constant in sync with that literal. If you
 * tune it here, change the class there too.
 */
export const CHAT_TOP_FADE_HEIGHT_PX = 40;
