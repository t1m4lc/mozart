# Mozart — Composer & Timeline UI Specification (v2)

> **Scope** : v0.1.0-beta.1 MVP — companion `libs/spartan-ui` task for Phase 2
> (Composer surface) and Phase 3 (Timeline + scroll plumbing).
> **Purpose** : specify the chat **Composer** (textarea + mode
> segmented control + model + effort + send + scroll-to-bottom +
> next-unread) and the **Timeline** (raw text in 3a, full
> Claude-style in 3b), both shipped as **dumb composed
> components** in `libs/spartan-ui`.
>
> **Architectural placement** : both live in `libs/spartan-ui`. No facade
> import, no store, no Tauri. Inputs in, outputs out. Smart
> wrappers in domain steps (Phase 2 for the composer, Phase 3 for
> the timeline) connect them to the chat facade.
>
> **Companion specs** :
>
> - `llm-stream-parser.md` owns the parser + reducer + `TurnState`
>   contract + visual specs for the Claude-style timeline (Phase
>   3b reference). The Composer + Timeline implementation consume
>   the `TurnState` produced there.
> - `plan.md` owns the cross-cutting tech conventions (Signal
>   Forms, Lucide, `prefers-reduced-motion`, `dayjs`) — they apply
>   to everything in this doc.

---

## 1. Why this is a dedicated `libs/spartan-ui` task

The Composer and the Timeline are rich UI surfaces with their own
UX micro-decisions (keyboard handling, dropdown shapes, plan-mode
visual treatment, sticky-bottom scroll, expand/collapse, shimmer).
Building them inline with Phase 2 (persistence) or Phase 3
(streaming) would tangle dumb UI with state + IPC and slow both
down.

Same pattern as `WorkspaceTabBar` and `ChatEmptyState`, already
shipped to `libs/spartan-ui` : ship the dumb UI first ; domain steps
mount it later.

Out of this task :

- No facade wiring
- No real LLM connection
- No `/` skills, no `@` context attachments (those are post-MVP
  per `plan.md`)
- No persistence

---

## 2. Composer

### 2.1 Positioning

`position: absolute` relative to the **middle shell column** (the
content column between sidebar and aside). Anchored to the bottom
of that column, full width minus the column's gutter padding.

The chat message list above it scrolls under the composer. The
composer floats on top with a subtle backdrop / blur to soften
the visual transition.

The composer is **hidden when no workspace is selected** (state
coherence rule from `plan.md` Phase 1).

### 2.2 Textarea

- **Placeholder** (changes by mode) :
  - Agent : `"Ask Mozart to make a change, run a command, or anything else"`
  - Plan : `"Describe the change — Mozart will plan before touching files"`
  - Ask : `"Ask anything — read-only mode, no file edits"`
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
  read-only, the send button is replaced by a stop button (see
  §2.4).
- **Focus management** : after a successful `(send)`, focus
  returns to the textarea automatically.

### 2.3 Layout — bottom-left cluster

Left to right :

#### Mode segmented control

Three options, always visible : `Agent | Plan | Ask`. Spartan
`HlmToggleGroup` (or `HlmTabs` rendered as a segmented control —
Phase B decides per actual API).

- **Always visible** so the user sees the current mode at a
  glance
- **One-click switch** between modes
- **Changeable before every message** (not locked after first
  send)
- Inputs : `mode: InputSignal<ChatMode>`
- Output : `(modeChange: ChatMode)`

Visual treatment per mode (applies to the **whole composer
container**, not just the textarea) :

| Mode  | Border                     | Background tint | Label                                     | Placeholder               |
| ----- | -------------------------- | --------------- | ----------------------------------------- | ------------------------- |
| Agent | default                    | none            | none                                      | (Agent placeholder above) |
| Plan  | 1px solid accent           | 4% accent       | none (segmented control already shows it) | (Plan placeholder)        |
| Ask   | 1px solid muted-foreground | none            | `Read-only` at top-left                   | (Ask placeholder)         |

```ts
type ChatMode = 'agent' | 'plan' | 'ask';
```

#### Model selector

`HlmSelect` (NOT `HlmDropdownMenu`), styled with the content
structure of the user's dropdown sample (groups, labels,
separators, selected indicators).

- **Tooltip on trigger** : _"Change model"_
- **Trigger** : provider icon + short model name
- **Content** :
  - Models grouped **by provider** using
    `hlm-select-group` + `hlm-select-label` (Anthropic, OpenAI,
    OpenRouter, Local…)
  - Each model row : provider icon + model name + optional
    `HlmBadge` _"New"_ + a check indicator on the selected one
    (right-aligned)
- **Inputs** : `models: ModelOption[]`, `selectedModelId: string`
- **Output** : `(modelChange: string)`

```ts
type ModelOption = {
  id: string;
  name: string;
  provider: string;           // group key
  providerIcon: string;       // icon name in the wired library
  isNew?: boolean;
};
```

Default model resolution : when a fresh chat is opened, the host
picks the `defaultModel` property of the user's configured
provider (from `providers.config.ts`, see `plan.md`).

#### Effort selector

`HlmSelect`, same content pattern.

- **Tooltip on trigger** : _"Adjust effort"_
- **Trigger** : Lucide `Signal` graduation icon (scales with the
  level) + the current effort label
- **Content** : five rows, each row's `Signal` icon scales with
  the level, plus the text :
  - _Low_ · _Medium_ · _High_ · _XHigh_ · _Max_
- **Inputs** : `effort: EffortLevel`
- **Output** : `(effortChange: EffortLevel)`

```ts
type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
```

> Lucide icon ladder : `signal-zero` (low), `signal-low`,
> `signal-medium`, `signal-high`, `signal` (max). Confirm exact
> names against the installed `@ng-icons/lucide` version in
> Phase A.

### 2.4 Layout — bottom-right cluster

#### Send button / Stop button

- **Default** : `HlmButton` with `Send` Lucide icon, primary
  variant. Disabled when textarea is empty or whitespace-only,
  or when `disabled` input is true with `streaming = false`.
- **Streaming** : the same button slot renders a **Stop** button
  (square icon, destructive variant). On click, emits `(stop)`.

Inputs that drive the slot : `disabled`, `streaming`.

### 2.5 Two absolute-positioned overlay buttons

These sit **above** the composer (visually overlapping the
message list bottom), absolute-positioned :

#### Top-left — `scroll-to-bottom` button

- **Visible** when the user has scrolled away from the bottom of
  the chat (i.e. `autoFollowChat = false`, see §3).
- **Hidden** when the user is following the stream
  (`autoFollowChat = true`).
- **Icon** : `arrow-down` Lucide.
- **Click** : emits `(scrollToBottom)`. Host re-engages
  `autoFollowChat = true` and scroll-jumps to the anchor.

#### Top-right — `next-unread-workspace` button

- **Visible** when the host signals
  `hasNextUnreadInProject = true`.
- **Hidden** otherwise.
- **Icon** : Lucide `bell` (subtle) or `arrow-right` — Phase B
  picks based on visual balance with scroll-to-bottom.
- **Tooltip** : _"Next unread workspace in this project"_.
- **Click** : emits `(nextUnreadWorkspace)`. Host navigates.

Both buttons :

- Anchored absolutely to the composer top edge, offset upward so
  they sit above the composer visually (a few pixels of overlap
  with the message list bottom)
- `HlmButton` with `outline` variant and rounded-full (pill)
- Subtle fade transition on appear / disappear

### 2.6 Public surface (signal-based)

```ts
// Inputs
value:                  InputSignal<string>;
disabled:               InputSignal<boolean>;        // hard disable
streaming:              InputSignal<boolean>;        // turns Send into Stop
mode:                   InputSignal<ChatMode>;
models:                 InputSignal<ModelOption[]>;
selectedModelId:        InputSignal<string>;
effort:                 InputSignal<EffortLevel>;
autoFollowChat:         InputSignal<boolean>;        // drives scroll-to-bottom btn
hasNextUnreadInProject: InputSignal<boolean>;        // drives next-unread btn

// Outputs (output emitters, not EventEmitter)
(valueChange:           string)
(send:                  string)                       // user pressed Enter or Send
(stop:                  void)                         // user clicked Stop mid-stream
(modeChange:            ChatMode)
(modelChange:           string)
(effortChange:          EffortLevel)
(scrollToBottom:        void)
(nextUnreadWorkspace:   void)
```

### 2.7 Component structure

```
<Composer>                       // single public component, dumb
  ├── <ComposerScrollOverlay />  // the two absolute-positioned buttons
  ├── <ComposerTextarea />       // the actual textarea + autosize
  ├── <ComposerModeControl />    // segmented control
  ├── <ComposerModelSelect />    // hlm-select wrapper
  ├── <ComposerEffortSelect />   // hlm-select wrapper
  └── <ComposerSend />           // Send / Stop button
```

Sub-components are **private** to `Composer` — they are not
re-exported from `libs/spartan-ui`. They communicate via inputs / outputs
only ; no shared service inside `Composer`.

### 2.8 Primitives used (from `libs/spartan-ui` + CDK)

- `HlmButton` (send / stop / scroll-to-bottom / next-unread)
- `HlmSelect` (model + effort selectors)
- `HlmToggleGroup` or `HlmTabs` rendered as segmented control
  (Phase B picks the closer fit for `ChatMode` toggle)
- `HlmTextarea` (composer textarea base)
- `HlmTooltip` (every button)
- `HlmBadge` (the _"New"_ badge on model rows)
- `HlmIcon` + Lucide icons via `@ng-icons/lucide`
- `@angular/cdk/text-field` (`cdkTextareaAutosize`)

### 2.9 Accessibility

- Every button has a discernible accessible name (the tooltip
  text doubles as `aria-label` when there's no visible label).
- The mode segmented control uses `role="radiogroup"` with
  `aria-checked` per option.
- `Enter` vs `Shift+Enter` keyboard hints live in the placeholder
  copy. Power-user `Cmd+Enter` is not advertised.
- The scroll-to-bottom and next-unread buttons have `aria-live`
  attached to their visibility changes so screen readers
  announce them when they appear.

### 2.10 Form handling

The composer uses **Signal Forms**
(https://angular.dev/essentials/signal-forms), per `plan.md`'s
cross-cutting tech conventions. Even though the surface is small
(just the textarea), the form provides validation (whitespace-
only rejection), submit handling (Enter + Cmd+Enter), and
typed state out of the box.

---

## 3. Scroll & autoFollowChat pattern

This is the structurally-clean replacement for the current broken
ad-hoc scroll patches in the codebase. Phase 3a implementation
strips out the existing patches and ships this pattern instead.

### 3.1 Concept

The chat message list scrolls inside a container. After the last
message, a single `<div #anchor></div>` is rendered. The host
signal `autoFollowChat` tracks whether the user is "following the
stream" (default `true`) or has scrolled up to read (becomes
`false`).

Logic :

- **`autoFollowChat = true`** (default) :
  - On every content update (new chunk during streaming, new
    message), `requestAnimationFrame` → scroll the anchor into
    view smoothly.
  - The composer's `scroll-to-bottom` button is **hidden**.
- **User scrolls up** (detected via the chat container's
  `scroll` event, debounced) :
  - `autoFollowChat` flips to `false`.
  - The user can read freely without being interrupted.
  - The composer's `scroll-to-bottom` button **appears** as soon
    as the anchor is no longer visible (intersection observer).
- **User clicks `scroll-to-bottom`** :
  - `autoFollowChat` flips back to `true`.
  - Smooth scroll to the anchor.
- **User sends a new message via the composer** :
  - `autoFollowChat` resets to `true` (the user is implicitly
    re-engaging with the stream).
  - Smooth scroll to the anchor.

### 3.2 Implementation primitives

The smart wrapper around `<MessageList>` + `<Composer>` (in
`domains/chat/feature-chat-area`) owns this concern. It uses :

- **`@angular/cdk/scrolling`** for `cdk-virtual-scroll-viewport`
  on the message list — avoids keeping a 1000-message DOM around
  when chats grow long. Use the autosize virtual scroll strategy
  if available in the installed CDK version (Phase A confirms).
- **`@angular/cdk/observers`** for `cdkObserveContent` on the
  message list, so content mutations during streaming trigger
  the re-scroll logic.
- **`IntersectionObserver`** on the anchor (`viewChild('anchor')`
  to grab it) — emits visible / not-visible. Drives both
  `autoFollowChat` updates and the scroll-to-bottom button.
- **`viewChild('anchor')`** — access pattern. No service, no
  view-model class needed.

### 3.3 Pseudo-code sketch (Phase 3a implementation reference)

```ts
@Component({...})
export class FeatureChatArea {
  private readonly anchor = viewChild<ElementRef<HTMLDivElement>>('anchor');
  private readonly scroller = viewChild<CdkScrollable>('scroller');

  protected readonly autoFollowChat = signal(true);
  protected readonly anchorVisible = signal(true);

  ngAfterViewInit() {
    // Observe anchor visibility
    const io = new IntersectionObserver((entries) => {
      this.anchorVisible.set(entries[0].isIntersecting);
    });
    io.observe(this.anchor()!.nativeElement);

    // User scrolling up disengages autoFollow
    this.scroller()!.elementScrolled().pipe(
      debounceTime(50),
    ).subscribe(() => {
      if (!this.anchorVisible() && this.autoFollowChat()) {
        this.autoFollowChat.set(false);
      }
    });
  }

  protected onContentMutation() {
    if (this.autoFollowChat()) {
      requestAnimationFrame(() => {
        this.anchor()!.nativeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'end',
        });
      });
    }
  }

  protected scrollToBottom() {
    this.autoFollowChat.set(true);
    this.anchor()!.nativeElement.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }

  protected onSend(text: string) {
    this.facade.sendMessage(text /* + mode */);
    this.autoFollowChat.set(true);  // re-engage
  }
}
```

This is illustrative, not authoritative — Phase 3a's Phase B
plan refines it.

### 3.4 Reduced motion

When `prefers-reduced-motion: reduce` is set, smooth scrolling
falls back to instantaneous (`behavior: 'auto'`). The
`autoFollowChat` logic itself doesn't change.

### 3.5 Composer wires the buttons via inputs

The Composer dumb component receives :

- `autoFollowChat: InputSignal<boolean>` — drives visibility of
  `scroll-to-bottom`
- `hasNextUnreadInProject: InputSignal<boolean>` — drives
  visibility of `next-unread-workspace`

And emits :

- `(scrollToBottom)` — the host re-engages `autoFollowChat` and
  scrolls
- `(nextUnreadWorkspace)` — the host navigates

This keeps the Composer truly dumb : it doesn't know how scroll
works, just whether to show a button.

---

## 4. Timeline

### 4.1 Phase 3a vs Phase 3b

Per `plan.md` Phase 3, the Timeline ships in two sub-phases :

- **Phase 3a** : remove the visually broken existing Timeline.
  Render assistant messages as **raw text only** (clean
  paragraph) inside a `cdk-virtual-scroll-viewport`. No
  collapsible turn header, no timeline items, no shimmer. The
  scroll pattern from §3 is wired in.
- **Phase 3b** : after 3a is stable, bring back the Claude.ai-
  style UI (collapsible turn header with shimmer summary +
  vertical timeline of items + file chips + diff stats +
  plan-mode UI). Done with **reference HTML / CSS snippets
  captured from Claude.ai's browser inspector and pasted into
  `llm-stream-parser.md` v2 §6** before starting implementation.

This doc describes the **3b end state**. Phase 3a is just _"a
plain `<MessageBody>` rendering `turnState.text`, mounted inside
the scroll plumbing from §3."_

### 4.2 Phase 3b — refactor of the existing implementation

A Timeline already exists in the codebase. Its current state is
visually broken (collapse arrows misaligned, ugly styling). Phase
3a starts by **removing the broken UI** (keep the parser +
reducer in `domains/llm-model/data/stream/` — those are pure and
reusable).

Phase 3b rebuilds the Timeline UI cleanly in `libs/spartan-ui/timeline/`
per the structure below.

### 4.3 Public surface (Phase 3b)

```ts
// Inputs
state:                InputSignal<TurnState>;        // from llm-model reducer
collapsed:            InputSignal<boolean>;          // host can force collapsed
// Outputs
(collapsedChange:     boolean)                        // user toggled the chevron
(approvePlan:         void)                           // plan mode approve
(cancelPlan:          void)                           // plan mode cancel
(fileChipClick:       { path: string })               // user clicked a file chip
```

`TurnState` is the shape produced by the reducer in
`domains/llm-model/data/stream/`. It is the contract between the
provider-agnostic parser and the dumb Timeline. Import as a
**type only** from `@mozart/llm-model` :

```ts
import type { TurnState } from '@mozart/llm-model';
```

Type-only import is allowed by Convention #1 (UI imports a type,
not state). Runtime imports from `@mozart/llm-model` are still
forbidden.

### 4.4 Component tree (Phase 3b)

```
<TurnContainer>
  ├── <TurnHeader>           // shimmer summary + chevron
  └── <TurnBody>             // collapsible
        ├── <MessageBody>    // streaming assistant text
        └── <Timeline>
              ├── <TimelineItem /> (× N)
              └── <DoneMarker /> | <ErrorMarker />
```

Each `TimelineItem` switches on `item.kind` (or `item.toolName`)
and picks a renderer via the registry. See `llm-stream-parser.md`
§3.3 for the renderer registry and §6 for the visual specs.

### 4.5 Renderers (Phase 3b)

The available renderers per `llm-stream-parser.md` §3.3 :

- `FileReadRenderer` — file-text icon + file chip
- `FileEditRenderer` — file-pen icon + file chip + diff stats
- `FileCreateRenderer` — file-plus icon + file chip
- `ShellRenderer` — terminal icon + stdout/stderr collapsible
- `SearchRenderer` — search icon + query summary
- `ThinkingRenderer` — clock icon + collapsible reasoning
- `GenericToolRenderer` — wrench icon + JSON input collapsible
- `DoneMarker` — check-circle, label _"Done"_
- `ErrorMarker` — x-circle, label _"Error"_

Adding a new renderer = one file in `libs/spartan-ui/timeline/renderers/`
plus one line in `tool-renderers.registry.ts`. The parser is
never touched.

### 4.6 Plan mode rendering (Phase 3b)

When the `TurnState` contains a `planProposal` (parser spec
§7.2) :

- Render the plan steps as PENDING `TimelineItem`s, immediately.
- Render two action buttons at the bottom of the timeline :
  _"Approve"_ (primary) and _"Cancel"_ (ghost).
- On click, emit `(approvePlan)` or `(cancelPlan)` (no state
  change inside Timeline ; the host updates `TurnState` based on
  user decision).
- Once approved, subsequent tool calls flip the PENDING items to
  ACTIVE → DONE as they correspond (via `planStepId` matching ;
  the host has already done this work via the reducer).

### 4.7 Loaders (Phase 3b)

- **Text loader** : while the streamed text portion is being
  emitted (i.e. `<MessageBody>` is receiving `text_delta`), a
  subtle pulsing dot appears at the cursor position. CSS
  animation, `prefers-reduced-motion` removes it.
- **Spinner** : `HlmSpinner` on a `TimelineItem` in ACTIVE state
  **only when no shimmer applies** (e.g. shell command running
  with no text output yet). Shimmer is the default ACTIVE
  indicator (per parser spec §6.1) ; spinner is the fallback
  for renderers that don't show text.

### 4.8 Visual specs

All visual specs (shimmer animation timing, timeline geometry,
icon sizes, file chip styling, diff stats colors) are owned by
[`llm-stream-parser.md`](./llm-stream-parser.md) §6. This spec
does not duplicate them.

Phase 3b implementation : capture HTML / CSS reference snippets
from Claude.ai (via browser inspector) and paste them into
`llm-stream-parser.md` v2 §6 before starting implementation. The
reference resolves any ambiguity in the textual specs.

### 4.9 Primitives used (from `libs/spartan-ui` + CDK)

- `HlmButton` (Approve / Cancel plan buttons)
- `HlmCollapsible` (per-item expand / collapse)
- `HlmSpinner` (timeline ACTIVE fallback)
- `HlmBadge` (renderer-specific accents)
- `HlmIcon` + Lucide icons via `@ng-icons/lucide`
- `@angular/cdk/a11y` `LiveAnnouncer` (announces ERROR state to
  screen readers)

---

## 5. File layout in `libs/spartan-ui`

```
libs/spartan-ui/
├── composer/
│   ├── composer.component.ts                    # public
│   ├── composer.types.ts                        # ChatMode, ModelOption, EffortLevel
│   ├── composer-textarea.component.ts           # private
│   ├── composer-mode-control.component.ts       # private
│   ├── composer-model-select.component.ts       # private
│   ├── composer-effort-select.component.ts      # private
│   ├── composer-send.component.ts               # private (Send + Stop variants)
│   └── composer-scroll-overlay.component.ts     # private (two absolute buttons)
│
└── timeline/                                     # Phase 3b ; not built in 3a
    ├── turn-container.component.ts
    ├── turn-header.component.ts                 # shimmer summary + chevron
    ├── turn-body.component.ts
    ├── message-body.component.ts                # text stream rendering — USED IN 3a
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

Public exports from `libs/spartan-ui` :

- `Composer` and its types (`ChatMode`, `ModelOption`,
  `EffortLevel`)
- `MessageBody` (Phase 3a) — to render raw streamed text
- `TurnContainer` (Phase 3b) — to render the full Claude-style turn

All sub-components are **private** — not re-exported.

---

## 6. Sandbox / demo

Step 3.5's Definition-of-done requires a way to demonstrate both
components with mock data, without any domain wiring. Pick one of :

1. **Storybook setup in `libs/spartan-ui`** if not already configured.
2. **A dev route** in the app (`/__sandbox/composer`,
   `/__sandbox/timeline`) gated to non-production builds. The
   route feeds mock `ModelOption[]` and mock `TurnState` to demo
   all renderers.

Phase B of the relevant phase decides.

The sandbox covers :

- Composer in all states : idle / streaming / disabled, all three
  modes, with various model + effort selections
- Composer overlay buttons appearing / disappearing on prop
  toggle
- Timeline with each renderer family (Phase 3b)
- Timeline in plan-proposal state with Approve / Cancel (Phase
  3b)
- Reduced-motion mode (shimmer + pulses replaced by static)

---

## 7. Anti-regression checks

1. **No domain imports** : `grep -rn "from '@mozart/"
libs/spartan-ui/composer libs/spartan-ui/timeline` returns only **type-only**
   imports of `TurnState` from `@mozart/llm-model`. No runtime
   imports from any `@mozart/` domain.
2. **No Tauri** : `grep -rn "@tauri-apps/api" libs/spartan-ui` returns
   zero matches.
3. **Public surface stable** : Inputs and outputs of `Composer`
   and `TurnContainer` / `MessageBody` are signal-based (no
   `@Input()` decorators, no `EventEmitter`).
4. **Reduced motion** : with `prefers-reduced-motion: reduce`,
   no shimmer, no pulses, no transitions ; expand / collapse
   stays functional (instantaneous).
5. **Sub-components private** : only `Composer`, `MessageBody`,
   `TurnContainer` are re-exported from `libs/spartan-ui`'s entry point.
6. **Signal Forms only** : `grep -rn "FormGroup\|FormControl\|FormBuilder"
libs/spartan-ui/composer` returns zero matches (Signal Forms per
   `plan.md` tech conventions).
7. **OnPush** : every component has
   `changeDetection: ChangeDetectionStrategy.OnPush`.

---

## 8. Out of scope (deferred per `plan.md` post-MVP)

Recap of what's NOT in this `libs/spartan-ui` task :

- `/` skills shortcut + chip rendering
- `@` context shortcut + chip rendering
- `+` add-context button (lives next to mode / model in the
  post-MVP version of the composer)
- `HlmCombobox` overlay at caret
- Multi-context warning at 5+ chips
- Web URL mini-input chip
- PR / Workspace / Chat chip variants
- `skills` table integration
- File tabs (in tab bar, not the composer — already designed in
  `WorkspaceTabBar` but not routed in MVP)

When these ship (post-MVP), the Composer gains a new private
sub-component `composer-context-row.component.ts` for the chip
rail, and `composer-shortcut-overlay.component.ts` for the
`HlmCombobox` overlay. The public surface gains
`(addContext: AddContextAction)` and `(applySkill: SkillId)`
outputs. No breaking change to existing inputs / outputs.

---

## 9. Open questions for Phase B (companion task)

1. **HlmToggleGroup vs HlmTabs for the mode segmented control.**
   The exact API in the installed Spartan version determines
   which renders best as 3-option pills. Phase A confirms,
   Phase B picks.
2. **Composer position : truly absolute or sticky ?**
   Spec says `position: absolute` relative to middle column. An
   alternative is `position: sticky; bottom: 0` inside the
   column's scroll container. Both achieve the floating-at-
   bottom effect ; sticky is friendlier with the message list's
   scroll. Phase B confirms.
3. **Stop button behavior mid-stream** — does it cancel
   immediately (SIGINT-style on the agent) or just stop the
   stream rendering ? Likely the former, but Phase B confirms
   with the chat facade contract.
4. **Effort `xhigh` icon** — Lucide's `signal-high` is the
   second-highest ; the gap to `signal` (full) doesn't naturally
   express _"xhigh"_. Phase B may pick a different mapping or a
   custom 5-bar SVG.
5. **Plan mode placeholder copy** — proposed default :
   _"Describe the change — Mozart will plan before touching
   files"_. Adjust for tone in Phase B.
6. **Default effort per chat** — the host picks. Plan.md
   leaves this open ; recommend `medium`.
