# Phase 3 — Agent stream + parser + scroll

Scenarios covering the LLM stream parser/reducer output, the
Claude-style turn timeline (Phase 3b), the raw `MessageBody` fallback
(Phase 3a baseline), and the cross-cutting `autoFollowChat` scroll
plumbing already exercised in Phase 2.

---

### Scenario : Single text-only assistant turn renders progressively

**Priority** : MUST

**Preconditions** :
- A workspace + chat, composer focused.
- LLM adapter wired (real or fake — for tests, the fake LLM adapter
  drives a deterministic event stream).

**Steps** :
1. Send "Say hello".
2. Observe the assistant bubble as it streams.

**Expected** :
- A new assistant bubble appears with `status = streaming`.
- Text accumulates token by token (or chunk by chunk).
- On `done` event, `status` flips to `done`.
- Composer is refocused immediately after stream ends.
- If `turnState` is null (3a fallback), `<hlm-message-body>` renders ;
  otherwise `<hlm-turn-container>` renders the timeline.

**Edge cases** :
- Stream interrupted mid-text by app kill → on next launch, the
  assistant message that was `streaming` flips to `error`
  (interrupted-message recovery, per `chat.facade.ts:211-221`).
- Network error mid-stream → message flips to `error` with the error
  body as `errorMessage`.

---

### Scenario : Tool-call event creates a timeline item

**Priority** : MUST

**Preconditions** :
- Same as above, but the stream contains a `tool_call` event for the
  `view` tool (file read).

**Steps** :
1. Send "Read README.md".
2. Observe the timeline.

**Expected** :
- A new timeline item appears with the `file-read` kind, the title
  `view` (or the agent-provided title), and an `active` state.
- After the corresponding `tool_result` arrives, the item flips to
  `done` (or `error` if `tool_result.ok === false`).

**Edge cases** :
- Multiple tool calls in sequence : items append in event order,
  previous active items demote to `done`.

---

### Scenario : Thinking block accumulates and collapses by default

**Priority** : SHOULD

**Preconditions** :
- Stream contains a `thinking` event with multiple deltas.

**Steps** :
1. Send a prompt that triggers reasoning.
2. Click the thinking-item's title to expand.

**Expected** :
- A `thinking` item appears with a clock icon.
- Default state : collapsed, showing only the title "Thinking".
- After expand : a reasoning body becomes visible, with the streamed
  text accumulating live.
- When `thinking_end` arrives, the item state moves to `done`.

**Edge cases** :
- Multiple thinking blocks within a turn → each is its own item.
- Reasoning text longer than ~200 px → fade-out gradient + "Show more"
  affordance.

---

### Scenario : Done marker appears at end of turn

**Priority** : MUST

**Preconditions** :
- Same as the text-only scenario.

**Steps** :
1. Send a prompt that completes successfully.

**Expected** :
- After all events stream and `done` arrives, a green check
  `lucideCircleCheck` icon with the label "Done" appears as the final
  timeline item.
- The shimmer animation on the active item stops.
- `turnState.outcome === 'done'`, `status === 'done'`.

**Edge cases** :
- Stream ends with `error` outcome → DoneMarker is replaced by an
  `ErrorMarker` (`lucideCircleX` in destructive color).
- Stream stops via user Stop → status `stopped`, no DoneMarker, no
  ErrorMarker (a muted "Stopped" indicator if implemented).

---

### Scenario : File-chip click copies path to clipboard (v0.1.0-beta.1)

**Priority** : COULD

**Preconditions** :
- A completed assistant turn that included a file-edit tool call with
  a file chip rendered (e.g. `apps/desktop/src/foo.ts`).

**Steps** :
1. Click the file chip.

**Expected** :
- The absolute path is copied to the OS clipboard.
- A toast appears : "Path copied" with the path as description.

**Edge cases** :
- Clipboard write fails (permissions) → toast "Could not copy path".
- v0.1.0 wires the same click to route the right-aside diff panel
  ; the toast goes away.

---

### Scenario : Notification + sound fire when message ends off-focus

**Priority** : MUST

**Preconditions** :
- Two workspaces : `A` (current, focused) and `B` (background).
- Notifications + sound prefs both enabled.

**Steps** :
1. Send a message in `B`'s chat (e.g. by routing to `B`, sending,
   then navigating away to `A` mid-turn).
2. Wait for `B`'s assistant turn to finish.

**Expected** :
- OS desktop notification appears : "B" title (workspace name), body =
  first line of the assistant's reply.
- Notification sound plays (`message-done.ogg`).
- The sidebar row for `B` becomes bold (unread).

**Edge cases** :
- Window is focused AND user is on workspace `B` → no notification.
- Prefs `desktop = false` → no popup, sound still plays if enabled.
- Prefs `sound = false` → popup but no audio.
- Window focused but on a different workspace → both fire.

---

### Scenario : Auto-follow disengages on user scroll up

**Priority** : MUST

(Cross-link : same as the Phase 2 scenario "Composer scroll-to-bottom
button appears on user scroll up". Listed here because the parser
events drive the scroll updates and Phase 3 is where the plumbing
becomes load-bearing.)

---

### Scenario : Interrupted assistant message flips to error on restart

**Priority** : MUST

**Preconditions** :
- A workspace with at least one chat. The user has just sent a prompt
  and the assistant is mid-stream (DB row `status = 'streaming'`).

**Steps** :
1. Force-quit the app (Cmd-Q, Alt-F4, or `kill -9` — anything that
   skips the graceful shutdown path).
2. Re-launch the app.
3. Navigate back to the same workspace + chat.

**Expected** :
- The last assistant message is rendered with `status = 'error'`.
- The DB row reflects `status = 'error'` (verify via SQLite query).
- The flip persists across a second restart — the recovery is
  idempotent.

**Edge cases** :
- Graceful shutdown (window close) finishes the in-flight write and
  may leave the message in `done` or `stopped` — out of scope here.
- The user can re-send the prompt from the composer ; no special
  "retry" UI is provided in v0.1.0-beta.1.

---

### Scenario : Parser is pure (regression test)

**Priority** : MUST

**Preconditions** :
- Build tooling executes
  `domains/llm-model/data/stream/reducer.spec.ts`.

**Expected** :
- Reducer is invoked with a sequence of events and produces the
  same `TurnState` regardless of how many times it's called.
- No `window`, `document`, `setTimeout`, `setInterval`, or
  Angular/Tauri imports in `reducer.ts` or `event.types.ts`.
- Grep `import` in `domains/llm-model/data/stream/*.ts` excluding the
  adapter shows only `./event.types` (and other in-folder pure
  modules).

**Edge cases** :
- A future fixture in `__fixtures__/` for `error-recovered.json` /
  `queued-prompt.json` should also pass without code changes (drift
  with `llm-stream-parser.md` §A is tracked separately).
