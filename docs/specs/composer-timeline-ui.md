# Mozart — Composer & Timeline UI Specification

> **Scope** : v0.0.1 — Step 3.5 (companion `libs/ui` task) and its
> downstream consumers (Step 4 chat, Step 5 streaming).
> **Purpose** : specify the chat **Composer** (textarea + model
> picker + effort selector + plan-mode toggle + context menu + send)
> and the **Timeline** (refactored to be parser-driven), both shipped
> as **dumb composed components** in `libs/ui`.
>
> **Architectural placement** : both live in `libs/ui`. No facade
> import, no store, no Tauri. Inputs in, outputs out. Smart wrappers
> in domain steps (Step 4 for the composer, Step 5 for the timeline)
> connect them to the chat facade.
>
> **Companion spec** : visual specs of the timeline (shimmer, icons,
> file chips, diff stats, geometry) are owned by
> [`llm-stream-parser.md`](./llm-stream-parser.md). This document
> defines the **component surface and behavior** ; it never
> re-specifies visuals already in the parser spec — it points at
> them.

---

## 1. Why this is a dedicated `libs/ui` task

The Composer and Timeline are rich UI surfaces with their own UX
micro-decisions (keyboard handling, dropdown shapes, plan-mode
visual treatment, sticky-bottom scroll, expand/collapse, shimmer).
Building them inline with Step 4 (persistence) or Step 5 (streaming)
would tangle dumb UI with state + IPC and slow both down.

Same pattern as `WorkspaceTabBar` and `ChatEmptyState`, already
shipped to `libs/ui` : ship the dumb UI first ; domain steps mount it
later.

Out of this step :

- No facade wiring
- No real LLM connection
- No file picker / command palette logic (events out, no handlers in)
- No persistence

---

## 2. Composer

### 2.1 Positioning

`position: absolute` relative to the **middle shell column** (the
content column between sidebar and aside). Anchored to the bottom of
that column, full width minus the column's gutter padding.

The chat message list above it scrolls under the composer (the
composer floats on top with a subtle backdrop / blur to soften the
visual transition).

### 2.2 Textarea

- **Placeholder** :
  `ask to make changes, @mention file, reference PR with #, run /commands`
- **Autosize** : `cdkTextareaAutosize` from `@angular/cdk/text-field`.
  Min 1 row, max 8 rows ; beyond 8 rows the textarea scrolls
  internally without growing further.
- **Keyboard** :
  - `Enter` → send (emits `(send)` with the trimmed value)
  - `Shift+Enter` → newline, do not send
  - `Cmd+Enter` / `Ctrl+Enter` → send (alias for power users)
  - `Esc` → clear focus (do not clear content)
- **Whitespace** : an empty or whitespace-only message never sends ;
  the send button stays disabled.
- **Disabled state** : while a message is streaming in the current
  chat (host passes `disabled` input), the textarea is dimmed and
  read-only, the send button is replaced by a stop button (optional
  in v0.0.1 — see §2.10).

### 2.3 Layout — bottom-left cluster

Left to right, anchored to the bottom-left of the composer :

#### `+` button → "Add context" menu

- **Tooltip** : _"Add context"_
- **Icon** : a `+` glyph from the wired icon library
- **Open** : `HlmDropdownMenu`
- **Menu items** (each with icon + label) :
  1. _"Add attachment"_ — icon : paperclip. On click, emits
     `(addContext)` with payload `{ kind: 'attachment' }`. Step 3.5
     does NOT open the OS file picker — that's the host's job in a
     later step.
  2. _"Link issue (GitHub or Linear)"_ — icon : link.
     Emits `(addContext)` with `{ kind: 'issue' }`. The host will
     later present a sub-dialog or sub-menu prompting for an issue
     URL.
  3. _"Link workspace"_ — icon : folder. Emits `(addContext)` with
     `{ kind: 'workspace' }`. The host will later open an
     `HlmCommand` palette ("search workspace") seeded with the
     user's workspace list.

#### Model selector

- **Component** : `HlmSelect` (NOT `HlmDropdownMenu`), styled with
  the **content structure** of the dropdown sample provided by the
  user (groups, labels, separators, indicators).
- **Tooltip on trigger** : _"Change model"_
- **Trigger** : provider icon + short model name
- **Content** :
  - Models grouped **by provider** using
    `hlm-select-group` + `hlm-select-label` (Anthropic, OpenAI,
    OpenRouter, Local…)
  - Each model row : provider icon + model name + optional
    `HlmBadge` _"New"_ + a check indicator on the selected one
    (right-aligned, via `hlm-select`'s built-in selected mark)
- **Inputs** : `models: ModelOption[]`, `selectedModelId: string`
- **Output** : `(modelChange: string)`

#### Effort selector

- **Component** : `HlmSelect`, same content pattern
- **Tooltip on trigger** : _"Adjust effort"_
- **Trigger** : graduation icon (scales with current level) + the
  current effort label
- **Content** : five rows, each row's graduation icon scales with
  the level :
  - _low_ · _medium_ · _high_ · _xhigh_ · _max_
- **Inputs** : `effort: EffortLevel`
- **Output** : `(effortChange: EffortLevel)`

#### "Enter plan mode" toggle button

- **Component** : `HlmButton` (toggle behavior managed by host via
  input)
- **Idle visual** : plan icon + label _"Plan"_
- **Tooltip when OFF** : _"Enter plan mode"_
- **Tooltip when ON** : _"Exit plan mode"_
- **When ON** :
  - Icon highlighted (accent color from theme)
  - Textarea visual treatment changes (see §2.5)
  - Label still _"Plan"_
- **Output** : `(planModeChange: boolean)`

### 2.4 Layout — bottom-right cluster

#### Send button

- **Component** : `HlmButton`, primary variant
- **Disabled when** :
  - Textarea is empty or whitespace-only
  - `disabled` input is true (chat is streaming)
- **On click** : emits `(send: string)` with the trimmed value ;
  the host clears the input on success (composer never clears on
  its own — keeps optimistic clearing under host control)

### 2.5 Plan mode — visual treatment

When `planMode` is `true` :

- The textarea border switches to the accent / violet theme token
- A subtle accent background tint on the textarea (e.g. 4% tint)
- An inline label appears at the top-left of the textarea :
  _"Plan mode"_ in muted accent color
- The placeholder text changes to :
  `describe the change you want to plan — Mozart will draft a step-by-step plan before touching files`

The visual treatment is reversed atomically when `planMode` flips
back to `false`.

### 2.6 Public surface (signal-based)

```ts
// Inputs
value: InputSignal<string>;
disabled: InputSignal<boolean>;
models: InputSignal<ModelOption[]>;
selectedModelId: InputSignal<string>;
effort: InputSignal<EffortLevel>;
planMode: InputSignal<boolean>;

// Output emitters
(valueChange: string)            // two-way binding of textarea
(send: string)                   // user pressed Enter or Send
(modelChange: string)
(effortChange: EffortLevel)
(planModeChange: boolean)
(addContext: AddContextAction)
```

```ts
type ModelOption = {
  id: string;
  name: string;
  provider: string;           // group key
  providerIcon: string;       // icon name in the wired library
  isNew?: boolean;
};

type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

type AddContextAction =
  | { kind: 'attachment' }
  | { kind: 'issue' }
  | { kind: 'workspace' };
```

### 2.7 Component structure

```
<Composer>                       // single public component, dumb
  ├── <ComposerContextMenu />    // the + button + dropdown
  ├── <ComposerTextarea />       // the actual textarea
  ├── <ComposerModelSelect />    // hlm-select wrapper
  ├── <ComposerEffortSelect />   // hlm-select wrapper
  ├── <ComposerPlanToggle />     // plan mode button
  └── <ComposerSend />           // send button
```

Sub-components are **private** to `Composer` — they are not
re-exported from `libs/ui`. They communicate via inputs/outputs only ;
no shared service inside `Composer`.

### 2.8 Primitives used (from `libs/ui` + CDK)

- `HlmButton` (send, plan toggle, context menu trigger)
- `HlmSelect` (model + effort selectors)
- `HlmDropdownMenu` (`+` context menu)
- `HlmTextarea` (composer textarea base)
- `HlmTooltip` (every button)
- `HlmBadge` (the _"New"_ badge on model rows)
- `HlmIcon` + chosen icon library (Lucide via `@ng-icons/lucide`)
- `@angular/cdk/text-field` (`cdkTextareaAutosize`)

### 2.9 Accessibility

- Every button has a discernible accessible name (the tooltip text
  doubles as `aria-label` when there's no visible label).
- `Enter` vs `Shift+Enter` keyboard hints live in the placeholder
  copy (per §2.2). Power-user `Cmd+Enter` is not advertised.
- The plan-mode toggle is `role="switch"` with
  `aria-checked` reflecting `planMode`.
- Focus management : after `send`, focus returns to the textarea.

### 2.10 Open question — stop button (TBD in Phase B)

While a message is streaming, the send button could be replaced by
a **stop** button that emits `(stop)`. v0.0.1 might keep this simple
and just disable the send button. Phase B of Step 3.5 confirms.

---

## 3. Timeline

### 3.1 Refactor of the existing implementation

A Timeline already exists in the codebase. Step 3.5 reviews it and
chooses one of :

- **Refactor in place** — preferred if the existing API is close to
  the target shape.
- **Rebuild side by side** — preferred if the existing API leaks
  domain concerns or fights signals. Old timeline gets deprecated
  with a migration window.

Phase A of Step 3.5 documents the choice with rationale.

### 3.2 Public surface

```ts
// Inputs
state: InputSignal<TurnState>;   // the only state in, from llm-model reducer
collapsed: InputSignal<boolean>; // host can force collapsed
// Outputs
(collapsedChange: boolean)       // user toggled the chevron
(approvePlan)                    // user clicked Approve on a plan
(cancelPlan)                     // user clicked Cancel on a plan
(fileChipClick: { path: string }) // user clicked a file chip
```

`TurnState` is the shape produced by the reducer in
`domains/llm-model/data/stream/`. It is the contract between the
provider-agnostic parser and the dumb Timeline.

### 3.3 Component tree (recap of parser spec §4)

```
<TurnContainer>
  ├── <TurnHeader>           // shimmer summary + chevron
  └── <TurnBody>             // collapsible
        ├── <MessageBody>    // streaming assistant text
        └── <Timeline>
              ├── <TimelineItem /> (× N)
              └── <DoneMarker /> | <ErrorMarker />
```

Each `TimelineItem` switches on `item.kind` (or `item.toolName`) and
picks a renderer via the registry (parser spec §3.3, §11).

### 3.4 Renderers

The available renderers (parser spec §3.3) :

- `FileReadRenderer` — file-text icon + file chip
- `FileEditRenderer` — file-pen icon + file chip + diff stats
- `FileCreateRenderer` — file-plus icon + file chip
- `ShellRenderer` — terminal icon + stdout/stderr collapsible
- `SearchRenderer` — search icon + query summary
- `ThinkingRenderer` — clock icon + collapsible reasoning
- `GenericToolRenderer` — wrench icon + JSON input collapsible
- `DoneMarker` — check-circle, label _"Done"_
- `ErrorMarker` — x-circle, label _"Error"_

Adding a new renderer = one file in `libs/ui/timeline/renderers/`
plus one line in `tool-renderers.registry.ts`. The parser is never
touched.

### 3.5 Plan mode rendering

When the `TurnState` contains a `planProposal` (parser spec §7.2) :

- Render the plan steps as PENDING `TimelineItem`s, immediately.
- Render two action buttons at the bottom of the timeline :
  _"Approve"_ (primary) and _"Cancel"_ (ghost).
- On click, emit `(approvePlan)` or `(cancelPlan)` (no state change
  inside Timeline ; the host updates `TurnState` based on user
  decision).
- Once approved, subsequent tool calls flip the PENDING items to
  ACTIVE → DONE as they correspond (via `planStepId` matching ; the
  host has already done this work via the reducer).

### 3.6 Loaders

- **Text loader** : while the streamed text portion is being emitted
  (i.e. `<MessageBody>` is receiving `text_delta`), a subtle
  pulsing dot appears at the cursor position. CSS animation,
  `prefers-reduced-motion` removes it.
- **Spinner** : `HlmSpinner` on a `TimelineItem` in ACTIVE state
  **only when no shimmer applies** (e.g. shell command running with
  no text output yet). Shimmer is the default ACTIVE indicator (per
  parser spec §6.1) ; spinner is the fallback for renderers that
  don't show text.

### 3.7 Visual specs

Visual specs (shimmer animation timing, timeline geometry, icon
sizes, file chip styling, diff stats colors) are owned by
[`llm-stream-parser.md`](./llm-stream-parser.md) §6. This spec does
not duplicate them. Step 3.5 implements those visuals exactly as
specified there.

### 3.8 Sticky-bottom auto-scroll

Per parser spec §5.4. The Timeline does not implement scroll itself
— it's just a list. The smart wrapper in `domains/chat/` (Step 5)
or the host page handles the scroll container via `cdkScrollable` +
the sticky-bottom pattern.

### 3.9 Primitives used (from `libs/ui` + CDK)

- `HlmButton` (Approve / Cancel plan buttons)
- `HlmCollapsible` (per-item expand/collapse)
- `HlmSpinner` (timeline ACTIVE fallback)
- `HlmBadge` (renderer-specific accents)
- `HlmIcon` + Lucide icons
- `@angular/cdk/scrolling` (sticky-bottom — managed by host, not
  Timeline)
- `@angular/cdk/a11y` `LiveAnnouncer` (announces ERROR state to
  screen readers)

---

## 4. File layout in `libs/ui`

```
libs/ui/
├── composer/
│   ├── composer.component.ts            # public
│   ├── composer-textarea.component.ts   # private
│   ├── composer-model-select.component.ts
│   ├── composer-effort-select.component.ts
│   ├── composer-plan-toggle.component.ts
│   ├── composer-context-menu.component.ts
│   ├── composer-send.component.ts
│   ├── composer.types.ts                # ModelOption, EffortLevel, AddContextAction
│   └── composer.spec.ts
│
└── timeline/                             # (also detailed in parser spec §11)
    ├── turn-container.component.ts
    ├── turn-header.component.ts          # shimmer summary + chevron
    ├── turn-body.component.ts
    ├── message-body.component.ts
    ├── timeline.component.ts
    ├── timeline-item.component.ts
    ├── done-marker.component.ts
    ├── error-marker.component.ts
    ├── file-chip.component.ts
    ├── diff-stats.component.ts
    └── renderers/
        ├── file-read-renderer.component.ts
        ├── file-edit-renderer.component.ts
        ├── file-create-renderer.component.ts
        ├── shell-renderer.component.ts
        ├── search-renderer.component.ts
        ├── thinking-renderer.component.ts
        ├── generic-tool-renderer.component.ts
        └── tool-renderers.registry.ts
```

Public exports from `libs/ui` :

- `Composer` (the composer surface, with its types)
- `TurnContainer` (the timeline surface, with `TurnState` type
  imported from `@mozart/llm-model`)

All sub-components are **private** — not re-exported. Smart wrappers
in domains only import the public surfaces.

---

## 5. Sandbox / demo

Step 3.5's Definition-of-done requires a way to demonstrate both
components with mock data, without any domain wiring. Two options
(Phase B of Step 3.5 picks one) :

1. **Storybook setup in `libs/ui`** if not already configured.
2. **A dev route** in the app (`/__sandbox/composer`,
   `/__sandbox/timeline`) gated to non-production builds. The route
   feeds mock `ModelOption[]` and mock `TurnState` to demo all
   renderers.

The sandbox covers :

- Composer in all states (idle, plan mode, disabled, with various
  models + efforts)
- Timeline with each renderer family
- Timeline in plan-proposal state with Approve / Cancel
- Reduced-motion mode (shimmer + pulses replaced by static)

---

## 6. Anti-regression checks

1. **No domain imports.** `grep -rn "from '@mozart/" libs/ui/composer
libs/ui/timeline` returns zero matches (except, if applicable, an
   import of `TurnState` type from `@mozart/llm-model` which is
   acceptable — it's a type, not state).
2. **No Tauri.** `grep -rn "@tauri-apps/api" libs/ui` returns zero
   matches.
3. **Public surface stable.** Inputs and outputs of `Composer` and
   `TurnContainer` are signal-based (no `@Input()` decorators, no
   `EventEmitter`). The contract is the same shape on both ends of
   v0.0.1 → v0.0.2 (no breaking changes).
4. **Reduced motion.** With `prefers-reduced-motion: reduce`, no
   shimmer, no pulses, no transitions ; expand / collapse stays
   functional (instantaneous).
5. **Sub-components private.** Only `Composer` and the timeline
   public components are re-exported from `libs/ui`'s entry point.

---

## 7. Out of scope (deferred)

- Real file-picker logic for _"Add attachment"_ — host wires it in
  the step that needs it.
- Real `HlmCommand` palette for _"Link workspace"_ — same.
- Issue-URL parser for _"Link issue"_ — same.
- Per-chat persistence of selected model / effort / plan mode — this
  is the host's concern (Step 4 Phase B decides whether to persist
  in the chat row or to keep them transient).
- Stop button replacing send during streaming — TBD (§2.10).
- Inline edit / rollback of past timeline items — v1.0.0+.
- Streaming response replay for review panel — v1.0.0+ (Timeline is
  designed to support it as a future capability).

---

## 8. Open questions for arbitration

1. **HlmSelect vs HlmDropdownMenu for model / effort selectors.**
   Spec says `HlmSelect` with the content structure of the dropdown
   sample. Confirm that `HlmSelect` supports : groups with labels,
   row icons, right-aligned check indicator, badges in rows. If
   not, fall back to `HlmDropdownMenu` and add the radio-indicator
   pattern from the dropdown sample.

2. **Composer position : truly absolute or sticky ?**
   Spec says `position: absolute` relative to middle column. An
   alternative is `position: sticky; bottom: 0` inside the column's
   scroll container. Both achieve the floating-at-bottom effect ;
   sticky is friendlier with the message list's scroll. Phase B
   confirms.

3. **Plan mode placeholder copy.**
   Default proposed : _"describe the change you want to plan — Mozart
   will draft a step-by-step plan before touching files"_. Adjust
   for tone in Phase B.

4. **Effort default.**
   Spec doesn't fix a default. Recommend `medium`. The selected
   value lives in the host ; Composer is just a dumb display.

5. **`+` menu submenus.**
   Three patterns possible : cascading submenu (native dropdown
   nested), sequential dialog ("Add attachment" closes the menu then
   opens a file picker), or full-screen command palette. Phase B
   picks per item ; the menu just emits the event.
