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
