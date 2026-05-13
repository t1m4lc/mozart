# Mozart — LLM Stream Parser & UI Specification

> **Scope :** v0.0.1 — Step 5 (agentic streaming chat) and its
> supporting parser.
> **Purpose :** Specify how the raw LLM stream is parsed into
> structured events, and how those events are rendered into the
> live "agent activity" UI (the equivalent of what Claude.ai shows
> during a tool-using turn).
>
> **Architectural placement :** parser + reducer live in
> `domains/llm-model/data/stream/`. UI components (turn container,
> timeline, renderers, file chips, diff stats) live in `libs/ui` as
> composed dumb components. Chat-side wiring lives in
> `domains/chat/`. The first provider parser implemented is
> **Anthropic / Claude**.

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
- **Right flow** (file tree + diff, scheduled for v0.0.2) : the
  materialization of those tool calls as actual file changes.

This spec covers the **left flow** only — parser + UI rendering of
the stream.

---

## 2. Reference behavior

The target UX is the one Claude.ai uses in agentic conversations :

- A **single status header** that summarizes the turn in one
  sentence (e.g. _"Restructured documentation corrections et
  planification v0.0.2"_).
- The header has a **chevron** to collapse/expand a **vertical
  timeline** below it.
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
  | { type: 'tool_use_start'; id: string; name: string; inputPartial?: unknown }
  | { type: 'tool_input_delta'; id: string; deltaJson: string }
  | { type: 'tool_use_end'; id: string; input: unknown }    // input fully assembled
  | { type: 'tool_result'; id: string; output: unknown; isError: boolean }
  | { type: 'status_delta'; text: string }                  // header summary update
  | { type: 'message_end'; usage?: TokenUsage }
  | { type: 'error'; error: Error };
```

### 3.3 Tool families to render specially

The parser MUST recognize tool names and pick the right renderer.
Unknown tools fall back to a generic renderer.

| Tool family | Examples                     | Renderer          |
| ----------- | ---------------------------- | ----------------- |
| File read   | `view`, `read_file`          | `FileReadItem`    |
| File edit   | `str_replace`, `edit_file`   | `FileEditItem`    |
| File create | `create_file`, `write_file`  | `FileCreateItem`  |
| Shell       | `bash`, `run_command`        | `ShellItem`       |
| Search      | `grep`, `glob`, `web_search` | `SearchItem`      |
| Generic     | anything else                | `GenericToolItem` |

The mapping lives in a dedicated file (`tool-renderers.registry.ts`)
so adding a new renderer never touches the parser.

---

## 4. UI component tree

```
<TurnContainer>                       // one per assistant turn
  ├── <TurnHeader>                    // collapsible
  │     ├── summary text (live)       // shimmer while streaming, solid when done
  │     └── chevron toggle
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
- When `message_end` arrives, the shimmer stops and the text becomes
  solid.
- The chevron toggles a smooth height transition on `<TurnBody>`.

### 5.2 Timeline rendering rules

For each tool call or thinking block, push a new `<TimelineItem>`.
Items are **append-only** for the duration of the turn — never
reorder, never remove.

Each item has four visual states :

| State   | Trigger                                                                | Visuals                                                                                            |
| ------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| PENDING | Item exists but is not the active one yet (rare ; mainly in plan mode) | Gray icon, gray title, no animation                                                                |
| ACTIVE  | Item is currently being produced                                       | Solid icon, **shimmer on title**, vertical connector line extends below it but ends in nothing yet |
| DONE    | Item received its terminal event                                       | Solid icon, solid title, vertical connector line continues to next item                            |
| ERROR   | Tool returned `isError: true` OR threw                                 | Red icon, red title, expanded by default to show the error                                         |

Transition rules :

- A `tool_use_start` creates an item in ACTIVE state and demotes the
  previously active one to DONE.
- A `tool_result` for a given `id` flips that item from ACTIVE →
  DONE (or → ERROR).
- A `thinking_start` creates a thinking item in ACTIVE state.
- A `thinking_end` flips it to DONE.
- A `message_end` flips any remaining ACTIVE item to DONE and
  appends `<DoneMarker />`.

### 5.3 Expand / collapse

- The whole `<TurnBody>` collapses via the header chevron.
- Individual items have their own expand/collapse :
  - **Thinking items** : collapsed by default, expand to show
    reasoning text. If text is long, cap at `max-height: 200px`
    with a fade-out gradient and a _"Show more"_ affordance.
  - **File-edit items** : expanded by default, show the file chip
    and diff stats inline. Clicking opens a full diff (placeholder
    in v0.0.1, full panel in v0.0.2).
  - **File-read items** : collapsed by default ; no expand needed
    unless inspecting raw input.
  - **Shell items** : expand to show stdout / stderr.

Animation : smooth height transition using
`grid-template-rows: 0fr → 1fr` (NOT `max-height`, to avoid jank on
dynamic content).

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
  0%   { background-position: 100% 50%; }
  100% { background-position: -100% 50%; }
}

.shimmer-text {
  background: linear-gradient(
    90deg,
    var(--text-400) 0%,
    var(--text-400) 30%,
    rgba(255, 255, 255, 0.7) 50%,
    var(--text-400) 70%,
    var(--text-400) 100%
  );
  background-size: 400% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: shimmertext 2.25s linear infinite;
}
```

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
- **Icon size** : `16px × 16px` rendered inside the `20px` column.
- **Item spacing** : `8px` of vertical connector line between
  consecutive items.

### 6.3 Icons (Phosphor regular, or equivalent)

| Renderer        | Icon               | Notes                                |
| --------------- | ------------------ | ------------------------------------ |
| FileReadItem    | `file-text`        | Same as edit but no diff stats shown |
| FileEditItem    | `file-pencil`      | Or `pencil-simple` next to file chip |
| FileCreateItem  | `file-plus`        | Green tint                           |
| ShellItem       | `terminal`         |                                      |
| SearchItem      | `magnifying-glass` |                                      |
| ThinkingItem    | `clock`            | Subtle, indicates internal reasoning |
| GenericToolItem | `wrench` or `cube` |                                      |
| DoneMarker      | `check-circle`     | Green tint, label _"Done"_           |
| ErrorMarker     | `x-circle`         | Red tint, used for ERROR state       |

Color : icons use `var(--text-500)` by default ; ACTIVE items use
`var(--text-300)` ; ERROR uses `var(--danger-000)` ; DONE optionally
`var(--forest-green)` only on the final `DoneMarker`.

### 6.4 File chips

Used by FileRead / FileEdit / FileCreate to reference a file.

```html
<span class="file-chip">mozart-v0.0.1-steps.md</span>
```

```css
.file-chip {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 6px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-500) 40%, transparent);
  color: var(--text-200);
  font-family: var(--font-mono);
  font-size: 10px;
  line-height: 1;
}
```

- Clickable : opens the file in the IDE adapter (v0.0.2) or copies
  path to clipboard (v0.0.1 fallback).
- Truncate with `text-overflow: ellipsis` when path is long.

### 6.5 Diff stats

Shown next to file-edit chips :

```html
<span class="diff-stats">
  <span class="added">+4</span>
  <span class="removed">−3</span>
</span>
```

```css
.diff-stats { display: inline-flex; gap: 6px; font-family: var(--font-mono); font-size: 11px; }
.diff-stats .added   { color: var(--forest-green); }
.diff-stats .removed { color: var(--danger-000); }
```

Numbers come from the diff returned by the tool result (or computed
client-side by diffing old vs new content).

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

### 7.3 Matching tool calls to plan steps

The parser tracks an optional `planStepId` on each tool call (the
agent includes it in its tool input metadata when it knows which
step is being executed). If absent, fall back to appending tool
calls as new items below the plan steps.

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
   │  tool_use_start   │  text_delta / status_delta
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
```

Invariants :

- A `tool_result` for an unknown `id` is logged and dropped, never
  crashes the parser.
- Out-of-order events : the parser is tolerant. If a `tool_use_end`
  arrives before some `tool_input_delta`, buffer and reconcile at
  `tool_result` time.
- Truncated streams (network failure) : the parser emits a synthetic
  `error` event and flips the last ACTIVE item to ERROR.

---

## 9. Anti-regression checks (UI)

1. **No duplicate items** : rendering the same timeline twice (e.g.
   on re-mount) MUST produce identical output. Items are keyed by
   their event `id`.
2. **No shimmer at rest** : when no turn is streaming, no element
   has the `shimmer-text` class.
3. **No orphan ACTIVE** : at `message_end`, every item is DONE or
   ERROR. Assert in dev mode.
4. **Collapse persists** : collapsing the timeline persists across
   re-renders of the same turn (stable key in component state, not
   derived from stream events).
5. **No layout shift on stream** : incoming events MUST NOT cause
   the previous items to reflow.
6. **Reduced motion** : with `prefers-reduced-motion: reduce`, no
   shimmer, no height-transition animation, but expand/collapse
   still works (instantaneous).

---

## 10. Out of scope (deferred to v0.0.2+)

- Full diff viewer on click (v0.0.2 right panel).
- File tree showing modified files (v0.0.2).
- Terminal / Run tab (v0.0.2).
- "Open in IDE" dropdown (v0.0.2).
- Inline edit / rollback of individual tool calls.
- Branching / "regenerate from here".
- Cost / token usage display (will live in a separate footer
  component).

---

## 11. File layout (Mozart-adapted)

```
apps/desktop/src/app/domains/llm-model/data/stream/
├── event.types.ts                      # StreamEvent union
├── anthropic.parser.ts                 # raw Anthropic stream → StreamEvent[]
├── anthropic.parser.spec.ts
├── reducer.ts                          # StreamEvent → TurnState
├── reducer.spec.ts
└── __fixtures__/
    ├── text-only.json
    ├── single-tool-call.json
    ├── multi-tool-with-thinking.json
    ├── error-mid-stream.json
    └── plan-proposal.json

libs/ui/src/agent-timeline/
├── turn-container.ts
├── turn-header.ts                      # collapsible summary + shimmer
├── timeline.ts
├── timeline-item.ts                    # base ; switches on renderer
├── done-marker.ts
├── file-chip.ts
├── diff-stats.ts
├── shimmer.css                         # §6.1
├── timeline.css                        # §6.2
└── renderers/                          # one per tool family (§3.3)
    ├── file-read-item.ts
    ├── file-edit-item.ts
    ├── file-create-item.ts
    ├── shell-item.ts
    ├── search-item.ts
    ├── thinking-item.ts
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
  `libs/ui/src/agent-timeline/renderers/` plus one line in the
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
   The reference UI streams character-by-character. For v0.0.1,
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
