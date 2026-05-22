# Mozart — Existing UI Polish Plan

> **Scope:** Incremental polish only. No new large features. Reuse existing components.
> **Performance / loading time items** (virtual scroll, lazy-loading, defer placeholders) are tracked in [`docs/perf-backlog.md`](./perf-backlog.md) — do not duplicate work here.

---

## Implementation order

1. Routing / onboarding guard
2. Left sidebar fixes
3. Shell middle layout + chat / composer fixes
4. Right sidebar — file, run, terminal
5. Settings page polish
6. Tauri window controls + drag regions
7. Final visual QA pass

---

## 1 · Left sidebar — fixed width

**Remove** the resizable behavior entirely.

- Fixed width, close to the Settings left sidebar width (can be slightly wider if it improves readability).
- Delete broken / unstable resize logic and any related state.

---

## 2 · Settings — window controls

| Platform  | Placement                                 |
| --------- | ----------------------------------------- |
| macOS     | Left sidebar, **above** "Back to the top" |
| non-macOS | Top-right of the Settings content area    |

---

## 3 · Settings > Connection / Git cards

Bring cards visually in line with the onboarding cards.

- Keep existing content (Anthropic status indicator, GitHub logos/icons).
- Improve: spacing, layout, status indicators, visual hierarchy, card shape.
- Do **not** redesign; align style only.

---

## 4 · Broken test actions

`Send test feature` and `Test modification` are currently broken.

- Fix them so they work correctly, **or** disable / hide them until they are ready.
- No broken clickable UI may remain in the release build.

---

## 5 · Settings > Account section

- Keep the existing `Sign out` button.
- Add an `Account` button that opens the user's web account page (route or external URL).

---

## 6 · Onboarding route guard

**Problem:** the app can navigate to `/onboarding` even after onboarding has been completed.

**Solution:** add an Angular `CanActivate` guard on the onboarding route.

```
if (onboardingCompleted === true) → redirect to home / welcome
else                              → allow
```

- Keep existing persisted onboarding state logic untouched.
- Clerk metadata remains the source of truth if already wired.
- Guard must not trigger false redirects during sign-in flow.

---

## 7 · Workspace unread state

**Rules:**

| Event                                     | Effect                                |
| ----------------------------------------- | ------------------------------------- |
| LLM run finishes while chat is not viewed | chat → **unread**                     |
| User opens / views the chat tab           | chat → **read**                       |
| All chats inside a workspace are read     | workspace → **read** (no longer bold) |

**Current bug:** workspace stays bold after the user opens the relevant chat.

Fix the read-marking logic so it fires reliably when the chat tab becomes active.

---

## 8 · Workspace branch icon

In the left sidebar workspace list:

- Always show the small **branch icon** next to the workspace name.
- While the workspace is loading / running → replace with the **dot loader**.
- Once done → restore the branch icon.

---

## 9 · Shell middle layout

### 9a · Breadcrumb / tab alignment

- Align the first tab with the `Get started` breadcrumb horizontally.
- Add small left padding to the tab strip if needed.

### 9b · Action button order

Invert `Run with tools` and `Commit`:

```
[ Run with tools ]  [ Commit ]   →   desired visual order (confirm with design)
```

Add extra horizontal padding to `Run with tools` so it reads as the primary action.

### 9c · New chat tab button

- `New chat` button stays **fixed on the right**, outside the scrollable tab area.
- Other tabs remain horizontally scrollable.

---

## 10 · Start tab — dynamic values

- **Branch field:** display the actual current workspace branch name (not a placeholder).
- **From main / base branch:** show the real detected base branch (default `main`).

---

## 11 · Virtual scrolling

> ⚠️ See [`docs/perf-backlog.md`](./perf-backlog.md) for context and decisions.

- If the fix is not straightforward, **remove virtual scrolling** for now.
- Correct scroll behavior takes priority over this optimization.

---

## 12 · Chat content / textarea alignment

- Add small **horizontal padding** to chat content so text aligns with the textarea's inner visual edge.
- **No extra gap** between chat content and the textarea area.
- When scrolling up, content should disappear naturally behind the textarea border (tight transition).

---

## 13 · Scroll-to-bottom button

- Fix missing / non-rendering icon.
- Keep behavior unchanged.

---

## 14 · Next unread workspace button

| Property | Value                               |
| -------- | ----------------------------------- |
| Tooltip  | `Next unread workspace`             |
| Label    | Remove "in this project"            |
| Style    | Normal button (not round icon-only) |
| Content  | Arrow icon only, no text label      |

Priority: unread chats in current workspace context first, then global.

---

## 15 · Composer layout

- Move bottom controls to the **very bottom** of the composer: tools / plus, medium, agent mode, change model, submit.
- Reduce excessive height / spacing — composer should feel compact and tight.

---

## 16 · Lazy-loading / defer cleanup

> ⚠️ See [`docs/perf-backlog.md`](./perf-backlog.md) — loading time issue is tracked there.

- Remove excessive `@defer` around core chat / workspace content.
- Keep `@defer` only for: terminal, file tree (if useful), secondary panels not always open.

---

## 17 · Defer placeholders

> ⚠️ Linked to item 16 — see [`docs/perf-backlog.md`](./perf-backlog.md).

For every remaining `@defer`:

- Add `@loading` and `@placeholder` blocks.
- Placeholder occupies the full available panel area.
- Use a skeleton / loading background — never an empty white void.
- Terminal panel especially needs this treatment.

---

## 18 · Non-macOS window controls

- Current style is too large and Chrome-like.
- Target: **VS Code-like** — smaller icons, more compact, top-right positioned.

---

## 19 · Right sidebar tab bar alignment

- `All files` / `Changes` tab bar height must match the middle shell tab bar.
- Fix visible height mismatch.

---

## 20 · Remove extra file toolbar

- Keep only the `All files` / `Changes` tabs.
- File list appears directly below — no extra `File` toolbar / header row.

---

## 21 · File preview / diff

- Clicking a file **opens a tab in the main middle tab area** (same level as chat tabs).
- Tab displays either file preview or file diff.
- **Remove** the preview / diff section from the right sidebar.
- Right sidebar: file navigation and changes list only.

---

## 22 · Right sidebar — Run panel

- Remove editable run mode / status controls (run config moves to Mozart settings later).
- Remove the `Idle / No run` style block.
- Replace with the existing `EmptyState` component: run-related icon + short message.
- Future: when a run is active, show results / ports / logs / status.

---

## 23 · Run button placement

- Move `Run` button into the `Setup / Run / Terminal` toolbar row, **right side**.
- Move the collapse panel button to the **far left** of that same row.

---

## 24 · Bottom panel collapse

**Bug:** panel does not collapse all the way; top border missing when collapsed.

Expected collapsed state — only the toolbar row is visible:

```
[ ← collapse ]  Setup  Run  Terminal  [ Run → ]
```

- Add `border-top` so the collapsed toolbar is visually separated from the content above.

---

## 25 · Terminal styling

- Remove full-black terminal background; use a surface color close to the chat / app default.
- If a long UID / session identifier is shown, shorten it or reduce its visual prominence.

---

## 26 · Tauri window drag regions

- Restore the **draggable region on the middle shell toolbar / header**.
- Drag behavior must be consistent across the entire top shell area.

---

## 27 · Window border / shadow

- Evaluate whether a subtle border can be added around the Tauri window when resized.
- If OS limitations prevent it, document the decision and leave as-is.

---

## 28 · Tauri splash screen (optional)

- Evaluate a minimal Tauri splash screen to avoid showing a half-loaded UI on startup.
- Add only if it improves perceived quality without meaningful complexity overhead.
- Local app — keep it fast.

---

## Acceptance criteria

- [ ] No broken clickable UI elements
- [ ] Onboarding route is inaccessible after completion
- [ ] Workspace unread state clears correctly when the chat is viewed
- [ ] Chat / workspace content loads immediately (desktop UX — no perceptible lazy delay)
- [ ] All remaining `@defer` blocks have proper `@loading` / `@placeholder`
- [ ] Shell, right sidebar, and bottom panel are visually aligned
- [ ] File previews / diffs open in main tabs, not inside the right sidebar
- [ ] Tauri window drag regions are consistent across the top area
