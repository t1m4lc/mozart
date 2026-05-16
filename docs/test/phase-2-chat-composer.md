# Phase 2 — Chat + Composer + Modes

Scenarios covering the composer surface (mode segmented control,
model + effort selectors, send/stop button), the chat tab bar
(rename/close/4-cap), and the per-chat mode/model/effort persistence.

---

### Scenario : Composer textarea sends on Enter, newlines on Shift+Enter

**Priority** : MUST

**Preconditions** :
- A workspace is open with at least one chat and the composer focused.

**Steps** :
1. Type "Hello" then press Enter.

**Expected** :
- Message bubble appears with "Hello".
- Composer textarea is cleared and refocused.
- Assistant turn begins (streaming bubble appears).

**Edge cases** :
- Press Shift+Enter → newline added, no submit.
- Press Cmd+Enter / Ctrl+Enter → submits (alias).
- Type only whitespace → Send button stays disabled ; pressing Enter
  is a no-op.

---

### Scenario : Mode segmented control changes placeholder + container

**Priority** : MUST

**Preconditions** :
- Composer visible.

**Steps** :
1. Click each mode in turn : Agent → Plan → Ask → Agent.

**Expected** :
- Agent : default border, default bg, placeholder "Ask Mozart to make a
  change, run a command, or anything else".
- Plan : 1 px dashed accent border + 4 % accent tint, placeholder
  "Describe the change — Mozart will plan before touching files".
- Ask : 1 px muted border, "Read-only" label top-right, placeholder
  "Ask anything — read-only mode, no file edits".

**Edge cases** :
- Mode persists per chat ; switching to another chat shows that
  chat's last-selected mode.
- Mode is changeable before every message (no lock-in).

---

### Scenario : Model selector groups by provider

**Priority** : SHOULD

**Preconditions** :
- At least one provider is configured (Anthropic in MVP).
- Composer visible.

**Steps** :
1. Click the model selector pill.

**Expected** :
- Dropdown shows the providers as group labels ; models nested under
  each provider with their icon.
- Currently selected model has a check indicator.
- Tooltip on hovering the trigger reads "Change model".

**Edge cases** :
- A model carries a "New" badge → badge renders next to its name.
- Selecting a model persists per chat ; reopening the chat shows the
  same model.

---

### Scenario : Effort selector picks from 5 levels

**Priority** : SHOULD

**Preconditions** :
- Composer visible.

**Steps** :
1. Click the effort selector pill.

**Expected** :
- Dropdown lists Low / Medium / High / XHigh / Max with a "signal"
  icon that grows with the level.
- Tooltip on hovering the trigger reads "Adjust effort".
- Selecting a level persists per chat.

**Edge cases** :
- Default on a fresh chat is `medium`.

---

### Scenario : Sending while streaming queues the next message

**Priority** : MUST

**Preconditions** :
- A workspace with an active streaming assistant turn.

**Steps** :
1. Type "Second message" in the composer.
2. Press Enter.

**Expected** :
- "Second message" appears in the message list with a "queued" pill or
  italic styling.
- The current assistant turn continues unaffected.
- When the first turn ends, the second message is auto-promoted and
  its assistant turn starts.

**Edge cases** :
- Click Stop while a queued message exists → first turn cancels and
  the queued message flips to `stopped` (not auto-run).
- The Send button label/icon while streaming + non-empty text
  communicates "queue" (after IMP-013).

---

### Scenario : Stop button cancels in-flight turn

**Priority** : MUST

**Preconditions** :
- An assistant turn is streaming, composer empty.

**Steps** :
1. Click the Stop button (replaces Send when textarea empty + streaming).

**Expected** :
- Stream stops within ~500 ms.
- Assistant message status flips to `stopped`.
- Any queued user messages also flip to `stopped`.
- Composer regains focus.

**Edge cases** :
- If text is in the composer mid-stream, the Send slot shows Send (or
  Queue, per IMP-013), not Stop. Stop only appears when textarea is
  empty.

---

### Scenario : Chat tab bar caps at 4 chats per workspace

**Priority** : SHOULD

**Preconditions** :
- A workspace with 3 chats already open.

**Steps** :
1. Click the `+` button to create a 4th chat.
2. Try clicking `+` a 5th time.

**Expected** :
- Step 1 succeeds : a 4th chat tab appears, becomes active, composer
  focused with empty textarea.
- Step 2 : the `+` button is hidden (or disabled) ; clicking does
  nothing.

**Edge cases** :
- Closing one of the 4 chats re-enables the `+` button.

---

### Scenario : Chat rename via double-click

**Priority** : COULD

**Preconditions** :
- A workspace with at least one chat.

**Steps** :
1. Double-click the chat tab's label.

**Expected** :
- Label turns into an inline input, focused + text selected.
- Enter commits the new name (persists across restart).
- Esc cancels (reverts to previous name).
- Blur commits (same as Enter).

**Edge cases** :
- Empty name on commit → reverts without saving.

---

### Scenario : Active chat persists per workspace

**Priority** : MUST

**Preconditions** :
- A workspace with 2 chats : `Start` and `Custom`. `Custom` is active.

**Steps** :
1. Navigate to another workspace.
2. Navigate back to the original workspace.

**Expected** :
- The chat selection returns to `Custom`, not `Start`.
- Composer's mode / model / effort match what `Custom` was set to.

**Edge cases** :
- Across app restart, persistence holds (DB-backed).

---

### Scenario : Composer scroll-to-bottom button appears on user scroll up

**Priority** : MUST

**Preconditions** :
- A workspace chat with enough messages to scroll (≥10).
- Composer at default (`autoFollowChat = true`).

**Steps** :
1. Scroll up by ~3 rows.
2. Wait ~250 ms for settle debounce.
3. Click the round arrow-down button that appeared.

**Expected** :
- After step 2 : the round button is visible top-left above the
  composer ; auto-follow disengaged.
- After step 3 : view scrolls smoothly to the anchor ; auto-follow
  re-engages ; button disappears.

**Edge cases** :
- Sending a new message while the button is visible : send action
  re-engages auto-follow + scrolls.
- Reduced motion → scroll behavior is instantaneous.

---

### Scenario : Next-unread-workspace button surfaces when applicable

**Priority** : SHOULD

**Preconditions** :
- Two workspaces in the same project. The current one is selected.
  The OTHER one has an unread assistant turn waiting (its `unread`
  bit set).

**Steps** :
1. Observe the composer overlay (top-right pill).
2. Click the bell-icon button.

**Expected** :
- Step 1 : the bell button is visible at top-right above the composer.
  Tooltip reads "Next unread workspace in this project".
- Step 2 : route changes to the other workspace ; the bell button
  disappears (no more unread).

**Edge cases** :
- No unread sibling → button hidden.
