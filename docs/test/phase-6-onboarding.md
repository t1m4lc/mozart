# Phase 6 — Onboarding + tour + polish

Scenarios covering the 4-step onboarding wizard, the Get-started
project bootstrap, the on-demand `/tour`, and the polish items
(notification prefs, settings replay-tour, empty + error states).

---

### Scenario : First-time auth lands on /onboarding

**Priority** : MUST

**Preconditions** :
- Desktop app, fresh install. User just signed in with a JWT carrying
  `onboarding: false`.

**Steps** :
1. Deep-link arrives, session is saved.

**Expected** :
- App routes to `/onboarding`.
- Step 1 (Welcome) is the current step.
- Progress pill shows `1 / 4` (or the 4-dot strip with dot 1 active).

**Edge cases** :
- JWT carries no `onboarding` claim → default `false` → still routed to
  `/onboarding`.
- JWT `onboarding: true` → app skips onboarding and routes to `/`.

---

### Scenario : Step 2 — Git check

**Priority** : MUST

**Preconditions** :
- On `/onboarding`, step 2 active.
- `git` is installed on the system.

**Steps** :
1. Observe the status row.
2. Click Continue.

**Expected** :
- ✅ "Git X.Y.Z detected" (X.Y.Z = actual version).
- Continue button is enabled.
- Clicking advances to step 3.

**Edge cases** :
- `git --version` fails (not installed) → ❌ "Git not found" + OS-specific
  install copy + a "Verify installation" button (re-runs the check).
- Continue is disabled until git is detected.

---

### Scenario : Step 3 — LLM provider via `claude login` PTY

**Priority** : MUST

**Preconditions** :
- On step 3.
- Claude Code CLI is installed.

**Steps** :
1. Click "Configure" on the Claude Code card.
2. A sub-step opens with an embedded PTY running `claude login`.
3. Follow the prompts (open the URL, authenticate, paste back).
4. PTY exits with code 0.

**Expected** :
- The step flips to ✅ "Connected".
- Continue is enabled.

**Edge cases** :
- `claude login` not found → fallback "Use an API key instead"
  surfaces a password-masked input. The key is verified by one test
  call and stored via the credentials adapter.
- PTY exit non-zero → status flips back to "not connected" with the
  error visible.
- User cancels the sub-step → returns to step 3, status unchanged.

---

### Scenario : Step 4 — GitHub optional connect or skip

**Priority** : SHOULD

**Preconditions** :
- On step 4.

**Steps** :
1. Click Connect GitHub.
2. Complete OAuth.
3. (Alternative) Click Skip for now.

**Expected** :
- On Connect : step flips to ✅, Continue enabled.
- On Skip : step flips to ⊘ (skipped), Continue enabled, a local flag
  notes GitHub isn't configured.

**Edge cases** :
- OAuth fails / cancelled → step stays at "not connected", Connect
  button still available.

---

### Scenario : Onboarding ends, user lands in Get-started workspace

**Priority** : MUST

**Preconditions** :
- All 4 onboarding steps marked done or skipped.

**Steps** :
1. Click Continue / Finish on step 4.

**Expected** :
- `onboarding_completed` is persisted to true.
- The Get-started project is created (idempotent ;
  `~/Mozart/get-started/` with `README.md` + `hello.js` + initial
  commit).
- A `welcome-1` workspace is auto-created and routed to.
- The tour does NOT auto-launch.
- The composer is focused.

**Edge cases** :
- `complete()` fails for the flag write → user is still routed to
  the workspace ; the flag will be retried at next bootstrap.
- Get-started project already exists → reused, no duplicate.

---

### Scenario : Replay tour from Settings

**Priority** : SHOULD

**Preconditions** :
- Authenticated, onboarding complete.

**Steps** :
1. Navigate to `/settings`.
2. Click "Replay tour".

**Expected** :
- App routes through `/tour`, which ensures the Get-started project
  exists, then redirects to
  `/workspaces/<welcome-1.id>?tour=on`.
- The `AppShell` sees `?tour=on` and mounts
  `<app-feature-tour>` overlay.
- The 5 highlights play in order : sidebar Projects → workspace row →
  composer modes → Files tab → aside header buttons.

**Edge cases** :
- Esc anywhere during the tour → dismisses the overlay (strips
  `?tour=on`).
- Skip button → same as Esc.
- Finish (after the 5th highlight) → shows the closing card ; Done
  dismisses.
- Get-started project was deleted by the user → recreated silently.

---

### Scenario : Notification + sound prefs in Settings

**Priority** : MUST

**Preconditions** :
- On `/settings`.
- (After IMP-002) The Send test notification button works on first
  click regardless of permission state.

**Steps** :
1. Toggle Desktop notifications off.
2. Click Send test notification.
3. Toggle Desktop notifications on.
4. Click Send test notification again.

**Expected** :
- After step 2 : no OS popup ; if reduced affordance exists, an inline
  hint may appear.
- After step 4 (with permission granted) : OS popup appears with the
  Mozart icon + "Test notification" body. Sound plays if Sound toggle
  is on.
- (After IMP-002) The first-ever click triggers an OS-level
  notification permission prompt if needed.

**Edge cases** :
- Sound toggle off → popup but no audio.
- Both off → button is a no-op (or surfaces a hint).
- Permission denied at the OS → next test fires nothing ; document the
  state.

---

### Scenario : Empty state on /settings → Connections shows offline banner

**Priority** : COULD

**Preconditions** :
- On `/settings`, network unreachable.

**Steps** :
1. Wait for connectivity probe to settle.

**Expected** :
- An amber-tinted banner appears above the connection cards : "No
  internet connection. Hosted LLMs (Anthropic, OpenAI…) are
  unreachable. Connect once you're back online, or use a local model."

**Edge cases** :
- Coming back online → banner disappears within the next probe.

---

### Scenario : Onboarding step 1 — Welcome card progresses to step 2

**Priority** : SHOULD

**Preconditions** :
- On `/onboarding`, step 1 (Welcome) just mounted.

**Steps** :
1. Observe the progress pill.
2. Try clicking Back.
3. Click `Let's go`.

**Expected** :
- Step 1 : progress pill shows `1 / 4`.
- Step 2 : Back is disabled on step 1.
- Card reads "Welcome to Mozart" + intro copy + "This takes ~2 minutes."
- Step 3 : step 2 (Git check) mounts ; pill advances to `2 / 4`.

**Edge cases** :
- Pressing Enter while focused on `Let's go` advances the same way.
- The progress pill format may show a 4-dot strip instead of `1 / 4` —
  both are acceptable as long as step 1 is visually distinguished.

---

### Scenario : Onboarding ends — Get-started bundled project materializes

**Priority** : MUST

**Preconditions** :
- Step 4 complete. About to click Finish.

**Steps** :
1. Click Finish on step 4.
2. Observe the transient "Preparing your tour…" state on `/tour`.
3. Wait for the redirect to the workspace.

**Expected** :
- `set_onboarding_completed(true)` runs.
- `create_get_started_project` materializes `~/Mozart/get-started/`
  containing `README.md` + `hello.js` + a git repo (`main` branch
  with two commits : "Initial commit" then "Add Mozart get-started
  starter files").
- Sidebar refreshes : "Get started" project + `welcome-1` workspace
  appear under it.
- The route advances to `/workspaces/<welcome-1.id>?tour=on` (the
  tour overlay launches — see Scenario : Replay tour from Settings).
- Composer is focused.

**Edge cases** :
- Re-running the flow is idempotent : `~/Mozart/get-started/` is not
  re-created, the existing `welcome-1` workspace is reused.
- If `set_onboarding_completed` fails for any reason, the user is
  still routed to the workspace ; the flag retries at next bootstrap.
- The user deleting `~/Mozart/get-started/` between runs triggers a
  silent re-creation on the next Replay tour.

---

### Scenario : Settings page renders 5 sections with the correct ordering

**Priority** : SHOULD

**Preconditions** :
- Authenticated, onboarding complete.

**Steps** :
1. Open `/settings` from the AppShell footer gear.
2. Scroll through the page.
3. Trigger each section in turn (toggle a notification, click Replay
   tour, click Sign out).

**Expected** :
- Sections render in this order : Connections / Git / Notifications /
  Onboarding / Account.
- Connections : the existing FeatureConnections card (LLM provider +
  GitHub).
- Git : `git_version` re-runs on mount ; shows the detected version
  or the missing state.
- Notifications : two switches (Desktop, Sound) + Send test button.
  Toggling persists immediately (restart and re-open → values stick).
- Onboarding : `Replay tour` button → navigates to `/tour` (idempotent ;
  reuses the existing `welcome-1` workspace).
- Account : `Sign out` clears the keyring and routes to `/welcome`.

**Edge cases** :
- Sign out also clears `AuthFacade.isAuthenticated` ; the next launch
  lands on `/welcome` (no auto re-sign-in).
- Replay tour mid-tour is a no-op (the overlay is already mounted).
