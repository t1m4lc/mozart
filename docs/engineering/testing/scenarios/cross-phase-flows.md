# Cross-phase end-to-end flows

The most valuable scenarios for Phase 8 : true user journeys that span
multiple phases. Each one is a candidate for the highest-coverage,
most-realistic regression test.

---

### Scenario : Fresh user — install to first PR

**Priority** : MUST

**Preconditions** :
- Fresh install, no auth session, no projects, no GitHub connected.

**Steps** :
1. Launch Mozart → routed to `/welcome`.
2. Click Sign in → browser opens at apps/web `/login`.
3. Sign in with GitHub on apps/web → routed to `/dashboard`.
4. Click Launch Mozart desktop → handoff succeeds → desktop routes to
   `/onboarding`.
5. Step through Welcome → Git check → Provider (Claude Code via PTY)
   → GitHub (connect or skip) → Finish.
6. Land in `welcome-1` workspace of the Get-started project.
7. Send a prompt in the composer : "Add a docstring to hello.js".
8. Watch the assistant turn stream and edit the file.
9. Open the Files tab to see the diff.
10. Click Commit → write message → Commit.
11. Click Create PR → fills title and body → Create.

**Expected (end state)** :
- A PR exists on GitHub against the Get-started repo's main branch.
- The workspace's branch is pushed.
- The Files tab shows zero changed files (post-commit).
- Sidebar shows the Get-started project + workspace.

**Edge cases** :
- Network drops during the PTY login step → user can retry without
  re-doing earlier steps.
- GitHub connect fails on step 5 → user skips ; later, the Create PR
  click triggers the just-in-time connect.

---

### Scenario : Returning user — open app with valid token

**Priority** : MUST

**Preconditions** :
- A previously-set-up user. Token + Anthropic key in the keyring.
  At least one project + workspace exist.

**Steps** :
1. Quit the desktop app cleanly.
2. Launch it again.

**Expected** :
- No `/welcome` shown.
- App routes directly to `/` (dashboard).
- Sidebar hydrates with the projects + workspaces.
- Workspace activity timestamps + unread state restore from the DB.

**Edge cases** :
- Token expired since last launch → routed to `/welcome` with a
  "session expired" hint (if implemented).
- DB integrity broken (corrupted SQLite) → app surfaces an inline
  error banner ; user can still sign in (offline mode for local
  features).

---

### Scenario : Multi-workspace switching preserves per-workspace state

**Priority** : MUST

**Preconditions** :
- A user with 1 project containing 2 workspaces : `bowie-1` and
  `prince-2`. Each has its own active chat with non-default mode
  (Plan for `bowie-1`, Ask for `prince-2`) and 5+ messages.

**Steps** :
1. Open `bowie-1`. Confirm Plan mode + last chat title.
2. Click on `prince-2` in the sidebar. Confirm Ask mode + its chat
   title.
3. Click back on `bowie-1`. Confirm Plan mode and the same chat title.

**Expected** :
- Each workspace remembers its active chat, mode, model, effort,
  scroll position, and right-aside tab.

**Edge cases** :
- Tab bar reorder for one workspace doesn't reorder the other's.

---

### Scenario : Mid-stream send queues correctly across navigation

**Priority** : SHOULD

**Preconditions** :
- A workspace with an active streaming turn.

**Steps** :
1. While streaming, type "follow-up" in the composer and press Enter.
2. Navigate to the dashboard.
3. Wait for the stream to finish.
4. Navigate back.

**Expected** :
- "follow-up" appears queued in the chat.
- During step 2-3 : the stream continues in the background.
- After step 3 : the queued message is auto-promoted and a new
  assistant turn streams.
- Step 4 : the chat shows both turns ; auto-follow brings the user to
  the bottom.
- Notification fired (window unfocused or user on dashboard) for the
  first turn end.

**Edge cases** :
- User clicks Stop while still on the dashboard → both the running
  turn cancels and the queued user message flips to `stopped`. No
  auto-promotion happens.

---

### Scenario : Tour can be replayed without affecting onboarding flag

**Priority** : SHOULD

**Preconditions** :
- Authenticated, onboarding complete.

**Steps** :
1. Visit `/settings` → click Replay tour.
2. Complete or skip the tour.
3. Quit and relaunch the app.

**Expected** :
- `onboarding_completed` stays true.
- App routes to `/` (or wherever the route restores).
- The tour does NOT re-launch automatically.

**Edge cases** :
- User deleted the Get-started project before clicking Replay tour →
  Replay re-creates it silently.

---

### Scenario : Offline mode keeps local actions working

**Priority** : COULD

**Preconditions** :
- Authenticated, network unreachable, but the agent provider is
  configured (e.g. a future Ollama path).

**Steps** :
1. Open a workspace. Send a prompt.
2. Click Open in IDE.
3. Try to Create PR.

**Expected** :
- Step 1 : works if a local-only provider is configured ; otherwise
  the composer surfaces an offline banner.
- Step 2 : works (IDE launch is local).
- Step 3 : surfaces "GitHub unreachable" or the offline banner.

**Edge cases** :
- Connectivity returns mid-session → banner disappears, hosted
  features re-enable.

---

### Scenario : Offline banner appears when network drops

**Priority** : MUST

**Preconditions** :
- Authenticated, on any route (`/`, `/workspaces/:id`, `/settings`).
- Network reachable at start.

**Steps** :
1. Disable network (wifi or ethernet).
2. Wait up to ~30 s.
3. Re-enable network.

**Expected** :
- Step 2 : a top-of-screen banner appears : "You're offline. Hosted
  features (sign-in, hosted LLMs) are paused.".
- The banner does NOT block clicks on the underlying UI.
- Step 3 : the banner disappears after the next connectivity probe.

**Edge cases** :
- Connectivity flapping (on / off / on) → the banner debounces ;
  brief outages under the probe interval do not flash the banner.
- On `/settings` Connections section : an additional amber-tinted
  inline banner notes hosted LLMs are unreachable (cross-link :
  Phase 6 "Empty state on /settings → Connections shows offline
  banner", COULD priority).

---

### Scenario : Sign-out + sign-in-again preserves the local data

**Priority** : SHOULD

**Preconditions** :
- Authenticated with at least one project + workspace + chat history.

**Steps** :
1. From `/settings`, click Sign out → routed to `/welcome`.
2. Click Sign in → complete the browser handoff.

**Expected** :
- The same projects + workspaces + chat history are visible after
  sign-in.
- API keys still in the keyring (sign-out doesn't touch them).
- onboarding_completed still true → routed to `/`, not `/onboarding`.

**Edge cases** :
- Token in the keyring is gone but onboarding_completed remains true
  → next sign-in routes to `/`, NOT `/onboarding`.
