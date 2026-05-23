# Mozart — LLM Stream Parser & UI Specification (v2)

> **Scope :** v0.1.0-beta.1 MVP — Phase 3 (agentic streaming chat) and
> its supporting parser.
> **Purpose :** specify how the raw LLM stream is parsed into
> structured events, and how those events are rendered into the
> live "agent activity" UI (the equivalent of what Claude.ai
> shows during a tool-using turn).
>
> **Architectural placement :**
>
> - **Parser + reducer + types** live in
>   `domains/llm-model/data/stream/` as **pure functions** — no
>   DOM, no Angular, no Tauri. Anthropic / Claude is the first
>   provider parser ; future providers add siblings producing the
>   same normalized `StreamEvent` union.
> - **Tauri adapter** lives in `domains/llm-model/data/` as
>   `tauri-claude.adapter.ts` — the only file importing
>   `@tauri-apps/api` for the LLM concern.
> - **UI components** (turn container, timeline, renderers, file
>   chips, diff stats) live in `libs/spartan-ui/timeline/` as composed
>   dumb components using Spartan NG primitives.
> - **Chat-side wiring** (subscribing to the stream, feeding the
>   reducer, exposing `TurnState` to the renderers) lives in
>   `domains/chat/`.

---

## Phase 3a vs Phase 3b — read this first

Per `plan.md` Phase 3, this work ships in two sub-phases :

### Phase 3a — Parser, reducer, raw text rendering, clean scroll

**Priority work.** Builds the foundation :

- Parser + reducer + fixtures + types in
  `domains/llm-model/data/stream/`
- Tauri adapter that feeds the parser
- Chat facade subscribes to the stream and patches `TurnState`
- UI : **only `<MessageBody>`** from `libs/spartan-ui/timeline/` is
  used in 3a — it renders `turnState.text` as a clean paragraph.
  No collapsible header, no timeline items, no shimmer, no plan
  mode UI.
- The composer's anchor / `autoFollowChat` scroll pattern (per
  `composer-timeline-ui.md` §3) replaces the current broken
  scroll patches.
- Notification + sound on `message_end` when the user isn't on
  the focused chat.

End of Phase 3a : the agent can actually edit files, the user
sees the text response, scroll is clean. The full visual specs
below (sections 4-6) are **not yet implemented**.

### Phase 3b — Full Claude-style Timeline UI

Done **after Phase 3a is stable**. Implements everything in
sections 4-6 of this doc :

- Collapsible turn header with shimmer summary
- Vertical timeline of items
- File-edit / file-read / file-create / shell / search /
  thinking / generic renderers
- File chips + diff stats
- Plan mode UI (`plan_proposal` → PENDING items → Approve /
  Cancel)
- Done / Error markers
- Reduced-motion handling

**Reference snippets (Appendix A) :** the DOM and CSS captured
from a live Claude.ai conversation are now included below — see
§A.2 through §A.6. The implementing agent SHOULD mirror those
visuals, adapted to Spartan NG primitives per §B.

---

## 1. Context

The LLM is **not a chatbot, it is an agent**. A single user prompt
produces :

1. A **stream of structured events** (text chunks, tool calls, tool
   results, reasoning, status).
2. **Side effects on disk** — files in the workspace's git worktree
   are created/modified/deleted in real time. If the user has the
   worktree open in an IDE on the correct branch, they see those
   edits live.

The UI must reflect both flows :

- **Left flow** (chat panel) : a live, collapsible timeline of what
  the agent is _doing_ and _thinking_.
- **Right flow** (file tree + diff, scheduled for v0.1.0) : the
  materialization of those tool calls as actual file changes.

This spec covers the **left flow** only — parser + UI rendering of
the stream.

---

## 2. Reference behavior

The target UX is the one Claude.ai uses in agentic conversations
(also used by Claude Code) :

- A **single status header** that summarizes the turn in one
  sentence (e.g. _"Restructured documentation corrections et
  planification v0.1.0"_).
- The header summary **rotates** through 3–6 short phrases as the
  agent progresses (e.g. _"Reading parser…"_ → _"Fetching docs…"_
  → _"Editing types…"_), each line replacing the previous one in
  the same position with a fade-up transition. See §5.1 for the
  source-of-truth rules.
- The header has a **chevron** (visible on hover) to
  collapse/expand a **vertical timeline** below it.
- Each timeline item is an **icon + short title** on a vertical
  connector line.
- Some items expand to reveal **details** (reasoning text, file
  diffs, tool inputs).
- The **currently active item** has a **shimmer animation** on its
  title while the LLM is producing it ; once produced, it becomes
  solid text and the shimmer moves to the next item.
- The timeline ends with a **"Done"** marker (checkmark icon) when
  the turn completes.

---

## 3. Stream event model

### 3.1 Parser input

The raw stream is a sequence of typed deltas. The exact wire format
depends on the provider (Anthropic Messages API, OpenAI, custom
Tauri command). The parser MUST normalize them into the internal
event types below.

### 3.2 Internal event types

```ts
type StreamEvent =
  | { type: 'message_start'; messageId: string }
  | { type: 'text_delta'; text: string }                    // assistant prose
  | { type: 'thinking_start'; id: string }
  | { type: 'thinking_delta'; id: string; text: string }    // reasoning
  | { type: 'thinking_end'; id: string }
  | { type: 'tool_use_start'; id: string; name: string; inputPartial?: unknown; planStepId?: string }
  | { type: 'tool_input_delta'; id: string; deltaJson: string }
  | { type: 'tool_use_end'; id: string; input: unknown }    // input fully assembled
  | { type: 'tool_result'; id: string; output: unknown; isError: boolean }
  | { type: 'status_delta'; text: string }                  // header summary update
  | { type: 'queued_prompt'; text: string; queuedAt: number } // user message arrived mid-stream
  | { type: 'message_end'; usage?: TokenUsage }
  | { type: 'error'; error: Error; recoverable: boolean };
```

Notes on additions vs v1 :

- `planStepId` is now first-class on `tool_use_start` (was an
  optional note in v1 §7.3). The agent emits it when it knows
  which plan step the call belongs to.
- `queued_prompt` is new — see §D.1.
- `error.recoverable` distinguishes self-healed errors (the
  agent retried successfully) from terminal ones — see §D.3.

### 3.3 Tool families to render specially

The parser MUST recognize tool names and pick the right renderer.
Unknown tools fall back to a generic renderer.

| Tool family | Examples                          | Renderer          |
| ----------- | --------------------------------- | ----------------- |
| File read   | `view`, `read_file`               | `FileReadItem`    |
| File edit   | `str_replace`, `edit_file`        | `FileEditItem`    |
| File create | `create_file`, `write_file`       | `FileCreateItem`  |
| Shell       | `bash`, `run_command`             | `ShellItem`       |
| Local search| `grep`, `glob`                    | `SearchItem`      |
| Web         | `web_search`, `web_fetch`         | `WebFetchItem`    |
| Generic     | anything else                     | `GenericToolItem` |

The mapping lives in a dedicated file (`tool-renderers.registry.ts`)
so adding a new renderer never touches the parser.

`WebFetchItem` is rendered as a clickable favicon-prefixed link row
— see §A.3 and §D.4.

---

## 4. UI component tree

```
<TurnContainer>                       // one per assistant turn
  ├── <TurnHeader>                    // collapsible
  │     ├── BrandIcon (Claude hand)   // 20×20, see §A.2
  │     ├── summary text (live)       // shimmer while streaming, solid when done
  │     └── chevron toggle            // visible on hover or when expanded
  └── <TurnBody collapsed?>           // hidden when header collapsed
        ├── <MessageBody>             // streaming assistant prose, if any
        └── <Timeline>
              ├── <TimelineItem />    // 0..N items
              ├── <TimelineItem />
              └── <DoneMarker />      // appears at message_end
```

Each `<TimelineItem>` is rendered by the matching renderer (see §3.3).

---

## 5. Behaviors

### 5.1 Header summary

- The header shows a **single-line summary** of the turn.
- Source of the summary text, in priority order :
  1. The latest `status_delta` event the agent emitted (preferred).
  2. The title of the most recent tool call.
  3. A fallback string : _"Working…"_.
- While the turn is streaming, the summary text has a **shimmer
  animation** (see §6.1).
- The agent emits multiple `status_delta` events through a turn.
  Each new event REPLACES the previous summary in the same DOM
  position with a 350 ms fade-up transition (see §A.2). The
  reducer keeps only the latest as `turnState.statusSummary`.
- When `message_end` arrives, the shimmer stops, the text becomes
  solid, and the summary remains as the final one-line recap of
  the turn.
- The chevron toggles a smooth height transition on `<TurnBody>`.

### 5.2 Timeline rendering rules

For each tool call or thinking block, push a new `<TimelineItem>`.
Items are **append-only** for the duration of the turn — never
reorder, never remove.

Each item has five visual states :

| State    | Trigger                                                                | Visuals                                                                                            |
| -------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| PENDING  | Item exists but is not the active one yet (plan mode steps before approval) | Gray icon, gray title, dimmed (opacity 0.6), no animation                                          |
| ACTIVE   | Item is currently being produced                                       | Solid icon, **shimmer on title**, vertical connector line extends below it but ends in nothing yet |
| DONE     | Item received its terminal event                                       | Solid icon, solid title, vertical connector line continues to next item                            |
| ERROR    | Tool returned `isError: true` AND `error.recoverable === false`        | Red icon, red title, expanded by default to show the error                                         |
| RECOVERED| Tool errored but the agent retried successfully                        | Amber icon (warning tone), solid title, collapsed by default — see §D.3                            |

Transition rules :

- A `tool_use_start` creates an item in ACTIVE state and demotes the
  previously active one to DONE.
- A `tool_result` for a given `id` flips that item from ACTIVE →
  DONE (or → ERROR / RECOVERED depending on `recoverable`).
- A `thinking_start` creates a thinking item in ACTIVE state.
- A `thinking_end` flips it to DONE.
- A `message_end` flips any remaining ACTIVE item to DONE and
  appends `<DoneMarker />`.
- A `queued_prompt` creates a non-state item (no transitions) — see
  §D.1.

### 5.3 Expand / collapse

- The whole `<TurnBody>` collapses via the header chevron.
- Individual items have their own expand/collapse :
  - **Thinking items** : collapsed by default, expand to show
    reasoning text. If text is long, cap at `max-height: 200px`
    with a fade-out gradient and a _"Show more"_ affordance.
  - **File-edit items** : title + file chip with diff stats visible
    by default ; the diff body itself is collapsed behind a _"View
    diff"_ affordance. Clicking the file chip opens the full diff
    in a side panel (placeholder in v0.1.0-beta.1, full panel in v0.1.0).
  - **File-read items** : collapsed by default ; no expand needed
    unless inspecting raw input.
  - **Shell items** : expand to show stdout / stderr.
  - **Web items** : never expand — the row IS the result (favicon +
    title + domain + external-link arrow).

Animation : smooth height transition. The reference uses
`max-height` with `transition-[max-height] duration-300 ease-out`
(see §A.5) ; if jank is observed on dynamic content, swap to the
`grid-template-rows: 0fr → 1fr` pattern.

### 5.4 Auto-scroll

- While the turn is streaming, the chat panel auto-scrolls to keep
  the latest event visible.
- If the user manually scrolls up, **stop auto-scrolling** until
  they scroll back to the bottom (sticky-bottom pattern).
- Display a _"Jump to latest"_ pill when auto-scroll is paused and
  new content arrives.

---

## 6. Visual specs

### 6.1 Shimmer text

CSS animation applied to the title of any ACTIVE item AND to the
header summary while streaming.

```css
@keyframes shimmertext {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}

.shimmer-text {
  background: linear-gradient(
    90deg,
    var(--text-400) 30%,
    rgba(255, 255, 255, 0.7) 50%,
    var(--text-400) 80%
  );
  background-size: 400% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: shimmertext 2.25s linear infinite;
}
```

Note : v1 of this spec had the keyframe at `100% 50%` → `-100% 50%`.
The Claude.ai reference uses **200% → -200%** with `background-size:
400%` — the wider sweep makes the highlight pass once per cycle
instead of looping mid-text. Use the values above.

- Duration : **2.25 s** (matches Claude.ai reference).
- Easing : linear, infinite.
- Apply only while the item is ACTIVE. Remove the class on
  transition to DONE.
- Respect `prefers-reduced-motion` : fall back to a solid muted
  color, no animation.

### 6.2 Timeline geometry

- **Indent** : items sit in a `20px`-wide gutter column for the
  connector + icon.
- **Connector line** : `1px` wide, `bg: var(--border-300)`, runs
  from the top of the first item to the bottom of the last item.
  Gaps between consecutive items are bridged by a `height: 8px`
  segment of the same line.
- **Icon size** : `16px × 16px` rendered inside the `20px` column,
  with `padding-top: 4px` to align with the first line of the
  title.
- **Item spacing** : `8px` of vertical connector line between
  consecutive items.
- **Content padding** : `padding: 2px 10px 0` on the title row ;
  expanded bodies follow the same horizontal padding.

### 6.3 Icons

Use **Lucide** icons via `@ng-icons/lucide` (Spartan NG default).
Each icon is `16px` square inside the gutter.

| Renderer        | Lucide name        | Notes                                |
| --------------- | ------------------ | ------------------------------------ |
| FileReadItem    | `lucideFileText`   |                                      |
| FileEditItem    | `lucideFilePen`    |                                      |
| FileCreateItem  | `lucideFilePlus`   | Border accent in `--forest-green`    |
| ShellItem       | `lucideTerminal`   |                                      |
| SearchItem      | `lucideSearch`     | Local grep/glob                      |
| WebFetchItem    | (favicon)          | See §D.4 — no Lucide icon            |
| ThinkingItem    | `lucideClock`      | Subtle, indicates internal reasoning |
| GenericToolItem | `lucideWrench`     |                                      |
| QueuedPrompt    | `lucideMessageSquare` | Amber tint, see §D.1              |
| DoneMarker      | `lucideCircleCheck`   | Green tint, label _"Done"_        |
| ErrorMarker     | `lucideCircleX`       | Red tint, used for ERROR state    |

Color : icons use `var(--muted-foreground)` (Spartan NG) by
default ; ACTIVE items use `var(--foreground)` ; ERROR uses
`var(--destructive)` ; RECOVERED uses `oklch(0.7 0.16 84)` (amber) ;
DONE optionally `var(--forest-green)` only on the final
`DoneMarker`.

### 6.4 File chips

Used by FileRead / FileEdit / FileCreate to reference a file. The
chip is a **compound element** : filename block + optional diff
stats, separated by 1px internal borders. The whole chip is one
clickable target.

```html
<a class="file-chip" href="#" (click)="onChipClick(file)">
  <span class="chip-name">domains/llm-model/data/stream/stream.types.ts</span>
  <span class="chip-stats">
    <span class="chip-add">+14</span>
    <span class="chip-del">-1</span>
  </span>
</a>
```

```css
.file-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  text-decoration: none;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--background);
  max-width: 300px;
  transition: border-color 0.15s, background 0.15s;
}
.file-chip:hover { border-color: var(--muted-foreground); background: var(--card); }

.chip-name {
  padding: 3px 7px;
  color: var(--foreground);
  border-right: 1px solid var(--border);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chip-add { padding: 3px 6px; color: var(--forest-green); font-weight: 500; }
.chip-del { padding: 3px 6px; color: var(--destructive); font-weight: 500; border-left: 1px solid var(--border); }
```

Variants :

- **Edit** : both `+N` and `−N` shown.
- **Create** : single segment `nouveau` in green, border tinted
  `oklch(0.55 0.15 145 / 0.35)`.
- **Delete** : single segment `supprimé` in red, border tinted
  `oklch(0.577 0.245 27.325 / 0.3)`, name has `text-decoration:
  line-through`.
- **Read** : just the filename block, no stats segment.

Click target : in v0.1.0-beta.1 emits `(fileChipClick)` with the absolute
path. The chat domain wires it to a placeholder (toast _"Diff
viewer ships in v0.1.0"_ + path copied to clipboard). In v0.1.0
it routes to the side diff panel.

Truncate the middle of long paths if needed (e.g. `apps/desktop/
…/stream.types.ts`) — never crop the filename itself.

### 6.5 Diff stats

Diff stats are part of the file chip (see §6.4). They are NOT
shown as a separate element. Numbers come from the diff returned
by the tool result ; if absent, compute client-side by diffing
the `old_str` / `new_str` from the tool input.

---

## 7. Plan mode (LLM plan-first)

Every "user feature" exposed in the UI MUST be plannable — meaning
the agent first emits a structured plan before executing tool calls.
The plan IS part of the stream ; the parser recognizes it and the
UI renders it differently from execution.

### 7.1 Plan event

Plan is emitted as a single tool call with a reserved name
(`plan_proposal`) whose input is a structured object :

```ts
type PlanProposal = {
  goal: string;             // one-line user-facing goal
  steps: Array<{
    id: string;
    title: string;          // short, user-facing
    description?: string;   // optional 1–2 sentence detail
    affectedFiles?: string[];
  }>;
};
```

### 7.2 Plan UI

When the parser sees a `plan_proposal`, the renderer :

1. Renders the timeline items in **PENDING** state, one per plan
   step, immediately.
2. Pauses execution until the user clicks **Approve** or **Cancel**.
3. On **Approve** : forward an `approve_plan` message to the agent ;
   subsequent tool calls flip the PENDING items to ACTIVE → DONE
   as they correspond.
4. On **Cancel** : emit `cancel_plan`, mark the turn ended, show a
   muted _"Plan dismissed"_ footer.

The plan block itself is rendered as a single `<PlanProposalItem>`
in the timeline — a Spartan NG `hlmCard` with an amber accent
border, a list of steps with numbered circles, and two
`hlmBtn`s (default variant for Approve, outline for Cancel) in
the footer.

### 7.3 Matching tool calls to plan steps

The parser tracks an optional `planStepId` on each tool call (now
first-class on `tool_use_start`, see §3.2). If absent, fall back
to appending tool calls as new items below the plan steps.

When a tool call carries a `planStepId`, the renderer mounts the
tool's item **inside** the corresponding plan step rather than as
a new timeline row — nested with a sub-indent of `20px` on the
gutter.

---

## 8. Parser state machine

```
        ┌──────────┐
        │   IDLE   │
        └────┬─────┘
             │ message_start
             ▼
        ┌──────────┐
   ┌────│STREAMING │◀──┐
   │    └────┬─────┘   │
   │         │         │
   │  tool_use_start   │  text_delta / status_delta / queued_prompt
   │         ▼         │  (stay in STREAMING)
   │    ┌──────────┐   │
   │    │ TOOL_RUN │───┘  tool_result
   │    └──────────┘
   │
   │ thinking_start
   ▼
┌──────────┐
│ THINKING │── thinking_end ──▶ back to STREAMING
└──────────┘

  message_end (from any state) ──▶ IDLE
  error (recoverable=false)     ──▶ IDLE
  error (recoverable=true)      ──▶ back to STREAMING (item marked RECOVERED)
```

Invariants :

- A `tool_result` for an unknown `id` is logged and dropped, never
  crashes the parser.
- Out-of-order events : the parser is tolerant. If a `tool_use_end`
  arrives before some `tool_input_delta`, buffer and reconcile at
  `tool_result` time.
- Truncated streams (network failure) : the parser emits a synthetic
  `error` event with `recoverable: false` and flips the last ACTIVE
  item to ERROR.

---

## 9. Anti-regression checks (UI)

1. **No duplicate items** : rendering the same timeline twice (e.g.
   on re-mount) MUST produce identical output. Items are keyed by
   their event `id`.
2. **No shimmer at rest** : when no turn is streaming, no element
   has the `shimmer-text` class.
3. **No orphan ACTIVE** : at `message_end`, every item is DONE,
   ERROR, or RECOVERED. Assert in dev mode.
4. **Collapse persists** : collapsing the timeline persists across
   re-renders of the same turn (stable key in component state, not
   derived from stream events).
5. **No layout shift on stream** : incoming events MUST NOT cause
   the previous items to reflow.
6. **Reduced motion** : with `prefers-reduced-motion: reduce`, no
   shimmer, no height-transition animation, but expand/collapse
   still works (instantaneous).
7. **Chevron visibility** : the header chevron is `opacity: 0` by
   default, becomes `opacity: 1` on hover OR when the body is
   expanded. Never visible at rest in collapsed state on a
   touch-only device — use `@media (hover: hover)` to gate this.
8. **Status rotation continuity** : when a new `status_delta`
   replaces the previous summary, the shimmer animation MUST
   continue without restart (the same `.shimmer-text` element
   stays mounted, only its text content changes).

---

## 10. Out of scope (deferred post-MVP)

The agent stream parser captures everything it sees ; UI surfaces
for some of it are deferred :

- **Full diff viewer on click** — Phase 4 ships an aside diff
  view (the `(fileChipClick)` event in §4 routes there).
- **File tree showing modified files** — Phase 4 ships the Files
  tab.
- **Terminal / Run tab** — Phase 4.
- **"Open in IDE" dropdown** — Phase 4 (in the workspace header,
  not the timeline).
- **Inline edit / rollback of individual tool calls** — post-MVP.
- **Branching / "regenerate from here"** — post-MVP.
- **Token usage display** — **capture-now, display-later**
  pattern :
  - The parser DOES capture `TokenUsage` from the
    `message_end` event (`{ inputTokens, outputTokens,
    cacheCreationTokens?, cacheReadTokens? }`).
  - The reducer DOES include it in the resulting `TurnState`.
  - The data IS persisted on `messages.token_usage` (JSON column
    — add this in the Phase 3 schema migration).
  - But it is **NOT displayed in MVP**. The post-MVP `metrics`
    domain (per `plan.md`) will surface it in a usage
    dashboard.
- **Cost display** — same pattern as token usage. Captured if
  the provider returns cost data, persisted, not displayed
  until `metrics` ships.
- **Execution time footer** — captured at `message_end` as
  `turnState.elapsedMs`. NOT rendered in MVP timeline ; will
  appear in the post-MVP `metrics` dashboard alongside tokens.

---

## 11. File layout (Mozart-adapted)

```
apps/desktop/src/app/domains/llm-model/data/stream/
├── event.types.ts                      # StreamEvent union (§3.2)
├── turn-state.types.ts                 # TurnState shape — see §C
├── anthropic.parser.ts                 # raw Anthropic stream → StreamEvent[]
├── anthropic.parser.spec.ts
├── reducer.ts                          # StreamEvent → TurnState
├── reducer.spec.ts
└── __fixtures__/
    ├── text-only.json
    ├── single-tool-call.json
    ├── multi-tool-with-thinking.json
    ├── error-mid-stream.json
    ├── error-recovered.json            # new : §D.3
    ├── queued-prompt.json              # new : §D.1
    ├── status-rotation.json            # new : §5.1 multi-status
    └── plan-proposal.json

libs/spartan-ui/timeline/
├── turn-container.ts
├── turn-header.ts                      # collapsible summary + shimmer
├── message-body.ts                     # plain-prose renderer (used in 3a)
├── timeline.ts
├── timeline-item.ts                    # base ; switches on renderer
├── done-marker.ts
├── error-marker.ts
├── file-chip.ts
├── shimmer.css                         # §6.1
├── timeline.css                        # §6.2
└── renderers/                          # one per tool family (§3.3)
    ├── file-read-item.ts
    ├── file-edit-item.ts
    ├── file-create-item.ts
    ├── shell-item.ts
    ├── search-item.ts
    ├── web-fetch-item.ts               # new — §D.4
    ├── thinking-item.ts
    ├── queued-prompt-item.ts           # new — §D.1
    ├── plan-proposal-item.ts
    ├── generic-tool-item.ts
    └── tool-renderers.registry.ts      # name → component

apps/desktop/src/app/domains/chat/
└── feature-agent-message.ts            # mounts TurnContainer with TurnState
```

Rules :

- `anthropic.parser.ts` has **no DOM imports**, pure functions only.
- The UI components are `OnPush` and consume state via signals fed
  by `reducer.ts`.
- Adding a new tool renderer is a single-file change in
  `libs/spartan-ui/timeline/renderers/` plus one line in the
  registry.
- Adding a new provider parser (OpenAI later) is a sibling file
  alongside `anthropic.parser.ts` — no other change.

---

## 12. Open questions for arbitration

1. **Should the header summary be agent-driven or client-side
   derived ?**
   Recommendation : agent-driven via `status_delta` events, with
   client-side fallback. This lets the agent write better summaries
   than any heuristic could.

2. **How fine-grained should `text_delta` rendering be ?**
   The reference UI streams character-by-character. For v0.1.0-beta.1,
   render every chunk as it arrives ; if jank appears with long
   messages, throttle to ~30 fps. Do not buffer across multiple
   events.

3. **Thinking blocks visibility default.**
   Recommendation : collapsed by default with a one-line preview,
   expandable. Power users can flip a setting to "always expand
   thinking".

4. **Plan mode opt-in or default ?**
   Recommendation : default ON for any action that touches files.
   OFF for pure-Q&A turns (no tool calls expected). The agent
   decides based on the prompt and emits or skips the
   `plan_proposal`.

5. **`queued_prompt` placement.**
   Recommendation : render as a non-state timeline item AT THE
   POSITION in the timeline where the user queued it (i.e. between
   whichever events flanked it in time), not at the top or bottom.
   See §D.1.

---

# Appendix A — Reference snippets from Claude.ai (Phase 3b)

> Captured from a live Claude.ai conversation that included file
> reads, web fetches, thinking blocks, and the streaming header.
> Tailwind classes are preserved as-is from the source ; the
> CSS-variable mapping to Mozart's Spartan NG tokens is in §B.
>
> **Capture date :** 2025-11 (Claude.ai web app, current at time
> of writing).

## A.1 — Public Claude.ai conversation URL

A representative conversation that exercises every UI element in
this spec : header shimmer with rotating status, thinking block,
web fetches with favicons, file reads.

```
https://claude.ai/share/  ← TODO — Timothy : paste an actual share
                            URL of a Mozart-related agent chat that
                            covers files + tools + thinking
```

To capture the snippets below, open the share URL, scroll to a
turn that includes tool use, expand DevTools → Elements, pick the
nodes for each element. The Tailwind class strings are long but
each maps cleanly to the Spartan NG equivalents in §B.

## A.2 — Turn header (shimmer summary + chevron)

Captured DOM (simplified — removed Claude-specific tracking
classes) :

```html
<button class="group/status flex items-center gap-2 py-1 text-sm
               text-text-300 hover:text-text-200 text-left
               cursor-pointer transition-colors flex-1 min-w-0"
        aria-expanded="true">

  <!-- Brand icon : Claude hand SVG, 20×20 -->
  <div class="relative w-5 h-5 flex items-center justify-center shrink-0">
    <div class="!w-5 !text-brand-200 group-hover/status:opacity-0
                transition-opacity duration-100 w-8 text-accent-brand
                inline-block overflow-hidden select-none">
      <svg viewBox="0 0 100 800">
        <path d="m19.622 66.499 ..."/>   <!-- full path in libs/spartan-ui/assets/claude-hand.svg -->
      </svg>
    </div>
    <!-- On hover, the brand icon is replaced by a small X (close/collapse hint) -->
    <div class="absolute opacity-0 group-hover/status:opacity-100
                transition-opacity duration-100 text-text-500">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9.647 12.147a.5.5 0 0 1 .628-.065 ..."/>  <!-- chevron path -->
      </svg>
    </div>
  </div>

  <!-- Summary text with shimmer -->
  <div class="inline-flex items-center gap-1 min-w-0">
    <span class="text-center text-always-white/0
                 bg-gradient-to-r bg-[length:400%_100%]
                 from-30% via-always-white/70 to-80%
                 bg-clip-text bg-no-repeat
                 animate-[shimmertext_2.25s_infinite]
                 bg-text-400 from-text-400 to-text-400
                 text-left truncate text-sm font-base">
      Architected comprehensive widget with multiple states…
    </span>
  </div>
</button>
```

CSS extracted (Tailwind-resolved + the custom keyframe) :

```css
/* The shimmer-text keyframe — Tailwind references this by name */
@keyframes shimmertext {
  0%   { background-position: 200% center; }
  100% { background-position: -200% center; }
}

/* The shimmer span resolves to roughly : */
.shimmer-text {
  color: transparent;
  background-image: linear-gradient(
    to right,
    var(--text-400) 0%,
    var(--text-400) 30%,
    rgba(255, 255, 255, 0.7) 50%,
    var(--text-400) 80%,
    var(--text-400) 100%
  );
  background-size: 400% 100%;
  background-repeat: no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  animation: shimmertext 2.25s infinite linear;
}

/* Brand icon hover swap */
.group\/status:hover .brand-default { opacity: 0; transition: opacity 100ms; }
.group\/status:hover .brand-hover   { opacity: 1; transition: opacity 100ms; }
```

Mozart mapping :

- `text-text-400` → `text-muted-foreground`
- `text-text-300` / `text-text-200` → `text-foreground/70` and
  `text-foreground` on hover.
- The Claude hand SVG is in `libs/spartan-ui/timeline/assets/agent-icon.svg`
  (use the brand mark you pick — for Mozart, this is the small
  conductor's-baton glyph).
- The hover-swap behavior is OPTIONAL. The Spartan NG simpler
  approach : keep the brand icon visible at rest, fade in a
  `lucideChevronsUpDown` icon on hover at the **right side** of
  the button. Mozart does the right-side variant — it's clearer
  about the toggle affordance.

## A.3 — Timeline item (active state, with shimmer on title)

For both tool-use and thinking items, the structure is the same :
a 20px gutter with an icon and a connector line, content on the
right.

```html
<!-- One timeline row -->
<div class="flex flex-col shrink-0">

  <!-- 8px connector segment above (linking to previous row) -->
  <div class="flex flex-row h-[8px]">
    <div class="w-[20px] flex justify-center">
      <div class="w-[1px] h-full bg-border-300"></div>
    </div>
  </div>

  <!-- Row body -->
  <div class="transition-colors rounded-lg duration-150">
    <div class="flex flex-row">

      <!-- Gutter : icon + connector -->
      <div class="w-[20px] flex justify-center shrink-0">
        <div class="flex flex-col items-center pt-1">
          <div class="text-text-500 w-4 h-4 flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.386 2.51A7.5 7.5 0 1 1 2.5 10 ..."/>  <!-- clock -->
            </svg>
          </div>
          <div class="w-[1px] flex-1 mt-1 bg-border-300"></div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 min-w-0">
        <div class="pt-0.5 px-2.5 text-text-300">
          <p>Lecture du parser de stream existant…</p>
          <!-- When ACTIVE, the <p> carries the shimmer-text class -->
        </div>
      </div>

    </div>
  </div>

</div>
```

For ACTIVE state, the title `<p>` carries the same
`shimmer-text` class as the header summary (§A.2). The shimmer
removes itself when the parser flips the item to DONE.

For PENDING state (plan-mode steps not yet started) :

```html
<p class="text-text-500 opacity-60">Lecture des specs Spartan NG</p>
```

For ERROR state, the icon swaps to `lucideCircleX` colored with
`var(--destructive)`, the title color is `text-destructive`, and
the body is **expanded by default** showing the error message in
a monospace block with `border-left: 2px solid var(--destructive)`.

## A.4 — File chip + diff stats

This element was synthesized for Mozart — the Claude.ai capture
did not include a file edit in the inspected turn. The pattern is
modeled on Claude Code's actual file-chip rendering.

```html
<a class="file-chip"
   (click)="onChipClick(chip.path, $event)">
  <span class="chip-name">{{ chip.relativePath }}</span>
  <span class="chip-stats" *ngIf="chip.kind === 'edit'">
    <span class="chip-add">+{{ chip.adds }}</span>
    <span class="chip-del">-{{ chip.dels }}</span>
  </span>
  <span class="chip-new" *ngIf="chip.kind === 'create'">nouveau</span>
</a>
```

```css
.file-chip {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  text-decoration: none;
  font-family: var(--font-mono);
  font-size: 11px;
  background: var(--background);
  max-width: 300px;
  transition: border-color 150ms, background 150ms;
  cursor: pointer;
}
.file-chip:hover {
  border-color: var(--muted-foreground);
  background: var(--card);
}
.chip-name {
  padding: 3px 7px;
  color: var(--foreground);
  border-right: 1px solid var(--border);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: border-color 150ms;
}
.file-chip:hover .chip-name { border-right-color: var(--muted-foreground); }
.chip-add { padding: 3px 6px; color: var(--forest-green); font-weight: 500; }
.chip-del { padding: 3px 6px; color: var(--destructive); font-weight: 500; border-left: 1px solid var(--border); }
.chip-new { padding: 3px 7px; color: var(--forest-green); font-weight: 500; }

/* Variants */
.file-chip.is-create { border-color: oklch(0.55 0.15 145 / 0.35); }
.file-chip.is-create:hover { border-color: oklch(0.55 0.15 145 / 0.7); }
.file-chip.is-delete { border-color: oklch(0.577 0.245 27.325 / 0.3); }
.file-chip.is-delete .chip-name { text-decoration: line-through; }
```

Chips appear as a `flex-wrap` row directly below the item title :

```html
<div class="chips-row">
  <a class="file-chip">…stream.types.ts +14 −1</a>
  <a class="file-chip">…stream.reducer.ts +8 −2</a>
</div>
```

```css
.chips-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 6px 10px 0;
}
```

When multiple files are edited in one tool call (e.g. a single
`str_replace_batch`), all chips appear under one timeline item.

## A.5 — Thinking block (collapsed default)

Captured DOM for the expandable detail pattern :

```html
<!-- Title row always visible -->
<div class="px-2.5 text-text-300">
  <p>Réflexion sur la structure de l'union StreamEvent</p>

  <!-- Collapsible inner -->
  <div class="relative overflow-hidden transition-[max-height]
              duration-300 ease-out"
       [style.max-height]="expanded ? '600px' : '200px'">

    <div class="standard-markdown grid-cols-1 grid gap-3">
      <p>Le parser actuel ne gère que les content_block_delta…</p>
      <!-- … more reasoning paragraphs … -->
    </div>

    <!-- Fade-out gradient at the bottom while collapsed -->
    <div *ngIf="!expanded"
         class="absolute inset-x-0 bottom-0 h-10
                bg-gradient-to-t from-bg-100 to-transparent
                pointer-events-none"></div>
  </div>

  <!-- Show-more affordance -->
  <button (click)="expanded = !expanded"
          class="text-xs text-text-500/80 hover:text-text-100 transition">
    {{ expanded ? 'Masquer' : 'Afficher plus' }}
  </button>
</div>
```

Key behaviors :

- Collapsed `max-height` : **200px** (Claude.ai reference).
  Expanded : `600px` is enough for nearly all reasoning blocks ;
  for outliers, animate to `none` after the transition completes.
- Transition : `max-height 300ms ease-out`. The transition runs
  even with `prefers-reduced-motion: reduce` but at duration 0 —
  i.e. instantaneous expand/collapse, no smooth animation.
- The fade-out gradient uses Mozart's `var(--background)` as the
  top stop (matches the surface beneath the gradient).
- Show-more button text in French (Mozart UI language) :
  _"Afficher plus"_ / _"Masquer"_. Both labels visible only when
  the content actually overflows the collapsed height — if the
  thinking block is short (< 200px), hide the button entirely.

## A.6 — Done marker

Appears at `message_end` as the final item in the timeline. Same
gutter geometry as other items, no connector line below it.

```html
<div class="flex flex-row">
  <div class="w-[20px] flex justify-center shrink-0">
    <div class="flex flex-col items-center pt-1">
      <div class="text-forest-green w-4 h-4 flex items-center justify-center">
        <!-- lucideCircleCheck -->
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm3.707 6.707l-4.5 4.5a1 1 0 0 1-1.414 0l-2-2a1 1 0 0 1 1.414-1.414L8.5 11.086l3.793-3.793a1 1 0 0 1 1.414 1.414z"/>
        </svg>
      </div>
      <!-- NO connector line below the done marker -->
    </div>
  </div>
  <div class="flex-1 min-w-0">
    <div class="pt-0.5 px-2.5 text-text-300 text-sm">Done</div>
  </div>
</div>
```

For the error case, swap to `lucideCircleX` with
`text-destructive`, label _"Échec"_ instead of _"Done"_.

## A.7 — Notes

Things that weren't obvious from the live UI but matter for
faithful reproduction :

1. **The brand icon is animated**. In the actual Claude.ai
   capture, the hand SVG is rendered with a clip-path that draws
   the path progressively (the SVG `viewBox="0 0 100 800"` is
   intentionally tall — different vertical segments are revealed
   over time). For Mozart, **do not** reproduce the animation —
   it's purely Claude.ai branding. Use a single static SVG.
2. **The chevron is invisible at rest**. The
   `opacity-0 group-hover/status:opacity-100` pattern means
   the toggle affordance is hidden until the user hovers the
   button. This is a deliberate _"clean by default, available on
   demand"_ choice. On touch-only devices (no `:hover`), use
   `@media (hover: hover)` to make the chevron always visible.
3. **Status replacement keeps the same DOM node**. When a new
   `status_delta` replaces the previous summary, do NOT swap the
   `<span>` element — only update its `textContent`. Swapping
   restarts the shimmer animation mid-cycle and looks janky.
4. **Connector line continuity**. The vertical line is rendered
   as **separate 1px-wide elements** per row, with explicit 8px
   spacer rows between item rows. Don't try to render one
   continuous `position: absolute` line — it fails when items
   expand or collapse.
5. **Font sizing**. Title rows are `text-sm` (14px in Tailwind
   default = matches Spartan NG `text-sm`). Body and reasoning
   content is also 14px. The only smaller size in the timeline
   is the mono diff block (11px) and the _"Afficher plus"_
   button (11px / `text-xs`).
6. **No icons inside content blocks**. Tool inputs/outputs are
   rendered as plain text or mono-formatted blocks — no
   decorative iconography inside the body. Icons only live in
   the gutter.
7. **The header is the ONLY shimmer at all times during
   streaming**. Item-level shimmer is for the active item title
   only, lasts the duration of that item, and stops on DONE.
   Two shimmers visible simultaneously (header + active item)
   is intentional — they share the same keyframe so they sweep
   in lockstep.

---

# Appendix B — Spartan NG design token mapping

Mozart's UI uses Spartan NG, which itself follows the shadcn/ui
CSS-variable convention. Below maps Claude.ai's internal tokens
to the Mozart equivalents.

| Claude.ai (Tailwind) | Spartan NG variable        | Notes                              |
| -------------------- | -------------------------- | ---------------------------------- |
| `bg-100`             | `var(--background)`        | Page surface                       |
| `bg-200`             | `var(--card)`              | Card / raised surface              |
| `bg-500/40`          | `color-mix(in srgb, var(--muted) 40%, transparent)` | Chip bg |
| `border-300`         | `var(--border)`            | Connector line, chip border        |
| `text-100`           | `var(--foreground)`        | Primary text                       |
| `text-300`           | `var(--foreground)`        | Item titles                        |
| `text-400`           | `var(--muted-foreground)`  | Shimmer base color                 |
| `text-500`           | `var(--muted-foreground)`  | Icon default                       |
| `accent-brand`       | (Mozart brand color)       | The conductor icon tint            |
| `danger-000`         | `var(--destructive)`       | Error icons + diff `−N`            |
| `forest-green`       | `oklch(0.5 0.15 145)`      | Done check + diff `+N`             |
| `--radius`           | `var(--radius)` (0.625rem) | All radii                          |

Tailwind utility shortlist used by the timeline (drop-in for
Spartan NG projects on Tailwind v4) :

```
flex flex-col flex-row items-center justify-center justify-between
w-[20px] w-[1px] h-[8px] pt-1 pt-0.5 px-2.5 gap-2
text-sm text-xs font-mono text-muted-foreground text-foreground
text-destructive bg-card bg-background border border-border
rounded-md rounded-lg overflow-hidden truncate min-w-0 shrink-0
transition-colors duration-150 hover:bg-muted
```

Icon set : `@ng-icons/lucide` (already in Mozart's `package.json`
per Spartan NG default). Concrete list in §6.3.

---

# Appendix C — TurnState shape

Referenced throughout the spec but never formally defined in v1.
This is the shape `reducer.ts` produces from a sequence of
`StreamEvent`s, and the shape the UI consumes.

```ts
type TurnState = {
  /** Stable identifier for this turn — derived from message_start.messageId. */
  id: string;

  /** Current header summary (latest status_delta, or fallback). */
  statusSummary: string;

  /** Streaming state — drives the header shimmer. */
  isStreaming: boolean;

  /** Whether the user has expanded the turn body via the chevron.
   *  Persisted in component state, NOT derived from events. */
  expanded: boolean;

  /** The assistant's plain-prose response (cumulative text_delta). */
  text: string;

  /** Append-only list of timeline items in stream order. */
  items: TimelineItem[];

  /** Plan mode metadata, if a plan_proposal was seen. */
  plan?: {
    goal: string;
    approved: boolean | null;    // null = pending user decision
    cancelled: boolean;
    steps: Array<PlanStepState>;
  };

  /** Captured-now, displayed-later metrics (§10). */
  metrics?: {
    tokenUsage?: TokenUsage;
    elapsedMs?: number;          // populated at message_end
    toolCallCount?: number;
  };

  /** Terminal error, if any (recoverable: false). */
  error?: { message: string; at: number };
};

type TimelineItem =
  | ThinkingItemState
  | ToolItemState
  | QueuedPromptItemState;

type ThinkingItemState = {
  kind: 'thinking';
  id: string;
  state: 'ACTIVE' | 'DONE';
  text: string;                  // cumulative thinking_delta
  expanded: boolean;
};

type ToolItemState = {
  kind: 'tool';
  id: string;
  name: string;
  family: 'file_read' | 'file_edit' | 'file_create' | 'shell'
        | 'search' | 'web' | 'generic';
  state: 'PENDING' | 'ACTIVE' | 'DONE' | 'ERROR' | 'RECOVERED';
  input?: unknown;               // parsed from tool_input_delta accumulation
  output?: unknown;              // from tool_result
  errorMessage?: string;
  planStepId?: string;
  // family-specific fields, e.g. for file_edit :
  fileChips?: Array<{
    path: string;
    kind: 'edit' | 'create' | 'delete' | 'read';
    adds?: number;
    dels?: number;
  }>;
};

type QueuedPromptItemState = {
  kind: 'queued_prompt';
  text: string;
  queuedAt: number;              // ms timestamp
  // Note : not a stateful item ; rendered once and never updated.
};

type PlanStepState = {
  id: string;
  title: string;
  description?: string;
  state: 'PENDING' | 'ACTIVE' | 'DONE' | 'ERROR';
  toolItemIds: string[];         // matched via planStepId on tool_use_start
};

type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
};
```

The reducer's signature :

```ts
function reduce(state: TurnState, event: StreamEvent): TurnState;
```

Pure, total, no side effects. The state always advances forward —
the only field the UI is allowed to mutate independently (i.e.
NOT from a stream event) is `expanded` (both on `TurnState` and
on individual `ThinkingItemState`).

---

# Appendix D — Behaviors not in original spec

## D.1 — Queued prompt during stream

When the user submits a new prompt while the agent is still
streaming, the chat composer queues it (per Mozart's standard
queue behavior). The queued prompt MUST appear as a non-state
timeline item, inserted at the position in the timeline
corresponding to when it was queued (i.e. between whichever stream
events flanked the queue moment in time).

Renderer (`queued-prompt-item.ts`) :

```html
<div class="queued-row">
  <div class="queued-icon">
    <ng-icon name="lucideMessageSquare"
             class="text-amber-600 dark:text-amber-400" />
  </div>
  <div class="queued-body">
    <div class="queued-label">Prompt mis en queue pendant le stream</div>
    <div class="queued-text">{{ item.text }}</div>
  </div>
</div>
```

Visual tone : amber (warning-like) accent, NOT red (it's not an
error). Style is similar to the file chip — a left-aligned card
with a `border-left: 2px solid oklch(0.7 0.16 84)`. The text is
the verbatim user prompt, no truncation.

The queued prompt is consumed by the next turn — once the current
turn ends and the queued prompt is sent, the item remains in the
timeline as a record but does NOT animate or change state.

## D.2 — Status rotation in the header

The header summary is not a single line set once — it's a
**sequence** of `status_delta` events emitted by the agent through
the turn. Common pattern :

```
status_delta: "Analyzing the codebase…"
status_delta: "Reading parser source files…"
status_delta: "Researching tool_use streaming spec…"
status_delta: "Editing types union…"
status_delta: "Validated 3 tests"             ← final, set just before message_end
```

The UI MUST :

1. Always show the **latest** `statusSummary` only (no history).
2. Use a **fade-up transition** (350ms) when replacing the text :
   the old line fades out + translates up 5px, the new line fades
   in from 5px below. CSS pattern :
   ```css
   .summary-line { transition: opacity 350ms ease, transform 350ms ease; }
   .summary-line.entering { opacity: 0; transform: translateY(5px); }
   .summary-line.leaving  { opacity: 0; transform: translateY(-5px); }
   ```
3. Keep the **same** DOM node for the shimmer span (only its
   `textContent` changes) — see §A.7 note 3.

If no `status_delta` arrives for more than ~3 seconds during an
active tool run, the UI falls back to the tool name (e.g. _"Reading
stream.types.ts"_).

## D.3 — Error recovery (agent self-heals)

When a tool call fails but the agent retries successfully without
user intervention, the failed item MUST remain in the timeline
(don't hide history) but in a RECOVERED state :

- Icon : `lucideCircleAlert` in amber (`oklch(0.7 0.16 84)`).
- Title : the original tool description, plus a `(reprise)` suffix.
- Collapsed by default ; expand shows the error message + the
  retry that succeeded.

The agent emits this via a special `error` event with
`recoverable: true` immediately followed by the successful
retry's `tool_use_start` / `tool_result`. The reducer pairs them
by tool name + close timestamp (< 1s).

## D.4 — Web fetch rendering

`WebFetchItem` is the one renderer that does NOT use a Lucide
icon in the gutter — instead it shows a 14×14 favicon for the
fetched domain.

Layout : single-line, no expand, the row IS the result.

```html
<div class="row" [style.align-items]="'center'" [style.padding]="'2px 0'">
  <!-- Gutter : favicon, no connector segment inside the icon column -->
  <div class="gutter">
    <img [src]="faviconUrl(item.url)"
         width="14" height="14"
         class="favicon"
         alt="" />
  </div>

  <!-- Content : clickable link row -->
  <div class="body">
    <a [href]="item.url" target="_blank" rel="noopener noreferrer"
       class="link-row">
      <span class="link-title">{{ item.title }}</span>
      <span class="link-meta">
        <span class="link-domain">{{ domain(item.url) }}</span>
        <ng-icon name="lucideExternalLink" class="text-muted-foreground" />
      </span>
    </a>
  </div>
</div>
```

Favicon source : Google's S2 service for v0.1.0-beta.1 :

```ts
faviconUrl = (url: string) =>
  `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
```

For v0.1.0, cache favicons via the Tauri side to avoid the
Google call. If the favicon fails to load, fall back to a 14×14
colored square with the domain's first letter — same pattern as
Claude.ai uses.

The connector line between web-fetch rows is still 8px on top
and 8px on bottom (drawn in the spacer rows above and below), so
the visual rhythm matches other items even though the row itself
has `align-items: center` instead of `flex-start`.

---

*End of spec. Phase 3b implementation may begin once §A.1 is
filled with a real Claude.ai share URL and a `libs/spartan-ui/timeline/`
skeleton is committed with the file layout from §11.*