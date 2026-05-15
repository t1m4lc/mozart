# Phase 6 — Critical functional scenarios (e2e)

Source of truth for the v0.0.1 / Phase 6 user-visible behaviors that
**must** keep working between commits. Until a real e2e suite exists,
treat this as the manual smoke-test checklist for any PR that touches
`/welcome`, `/onboarding`, `/tour`, the auth guard, the onboarding
guard, the notification preferences, or the Get-started bundled
project. When `e2e` is wired (post v0.0.1), each scenario gets a
Playwright spec ; the section IDs are stable so the spec name can
mirror them (`s6_welcome_signin.spec.ts`, etc.).

> Run `pnpm reset-db ; pnpm dev` before the first scenario so the
> harness starts from a fresh keyring + DB state.

---

## S6.1 — First launch (no token, no onboarding flag)

1. `/welcome` is the only reachable route. `/`, `/workspaces/:id`,
   `/onboarding`, `/tour`, `/settings` all redirect back to
   `/welcome`.
2. Welcome page renders Mozart logo + "Start composing" heading +
   "Sign in to continue" subtitle + `Sign in` primary button.
3. Click `Sign in` → default OS browser opens at
   `https://app.mozart.build/` (or the mock-web local URL). Button
   relabels "Opening browser…" and disables. Cancel + "Finish sign
   in in the browser window" sub-copy appear.
4. After ~5 minutes with no deep-link, banner flips to a
   "timed-out" message ; `Cancel` returns the page to idle.

## S6.2 — Sign in (new user → onboarding)

1. From the mock `/login` on apps/web, click "Continue with GitHub".
2. Mock Clerk simulates the OAuth round-trip (~600 ms), JWT is
   minted with `onboarding: false`.
3. `/dashboard` renders "Happy to see you again, Octocat 👋" +
   `Launch Mozart desktop` button.
4. Click `Launch Mozart desktop` → deep-link
   `mozart://auth?token=…&state=…` fires.
5. Desktop receives the deep-link, validates `state` against the
   pending nonce, decodes the JWT, persists the session to the OS
   keyring, navigates to `/onboarding` (because the claim says
   `onboarding === false`).

## S6.3 — Sign in (returning user → dashboard)

1. With a JWT carrying `onboarding: true` (mock the user as
   onboarded), same flow as S6.2 lands the user on `/`.
2. Alternatively : if `db/config.onboarding_completed === true`,
   even a JWT with `onboarding: false` is treated as completed —
   the local mirror wins. Verify by manually flipping the row to
   `true`, re-running sign-in : land on `/`.

## S6.4 — Onboarding step 1 (Welcome)

1. Land on `/onboarding`. Progress pill shows `1 / 4`.
2. Card reads "Welcome to Mozart" + 4-step intro copy + "This takes
   ~2 minutes." + `Let's go` button.
3. Back button is disabled on step 1.
4. Click `Let's go` → step 2 mounts, pill advances to `2 / 4`.

## S6.5 — Onboarding step 2 (Git check)

1. With git on PATH : on mount, card reads `Git X.Y.Z detected`
   inside an emerald box. Continue is enabled.
2. With git NOT on PATH (rename binary or PATH= empty) : on mount,
   `Git not found on this machine` in red ; OS-specific install
   copy block appears (mac → `brew install git`, linux →
   `sudo apt install git`, windows → installer URL).
3. Click `Verify` → re-runs the probe. State flips correctly when
   git is added / removed mid-session.
4. Continue is disabled when state ≠ `found`.

## S6.6 — Onboarding step 3 (LLM provider — Claude Code)

1. Step 3 mounts with 4 cards : Claude Code (actionable), OpenAI /
   OpenRouter / Local (disabled, "Coming soon" badge).
2. 🔒 disclosure card ("Your keys never leave this computer…")
   visible below the list.
3. Continue is disabled until at least one provider is connected.
4. With `claude` binary present + no prior session : click
   `Configure` on Claude Code. The embedded xterm mounts and runs
   `claude login` inside `$HOME`. The user sees the URL prompt,
   pastes it in their browser, finishes login.
5. PTY exits → step re-probes `ProfileFacade.tryConnect()` →
   resolves to `claude_code` → sub-step closes → green ✅ on the
   card → Continue enabled.

## S6.7 — Onboarding step 3 (API-key fallback)

1. Click `Configure` on Claude Code. In the sub-step, click `Use
   an API key instead`.
2. Existing `UiConnectDialog` opens. Paste a valid Anthropic API
   key → dialog probes → succeeds → ✅ on the card.
3. Pasting an invalid key surfaces the dialog's inline error ; the
   key is **not** persisted to keyring (verify with
   `keyring get mozart anthropic_token`).

## S6.8 — Onboarding step 4 (GitHub — connect)

1. Step 4 mounts with bulleted intro + `Skip for now` + `Connect
   GitHub` + `Finish`.
2. Click `Connect GitHub` → existing `UiGithubConnectDialog` opens.
3. Paste a valid PAT → dialog succeeds → step flips to "Connected
   as <login>" in an emerald box.
4. Click `Finish` → `set_onboarding_completed(true)` runs →
   navigate to `/tour`.

## S6.9 — Onboarding step 4 (GitHub — skip)

1. Click `Skip for now` → step flips to a muted "Skipped — you can
   connect later from Settings".
2. Click `Finish` → same path as S6.8 ; navigate to `/tour`.

## S6.10 — Tour bootstrap

1. `/tour` shows "Preparing your tour…" while
   `create_get_started_project` materializes
   `~/Mozart/get-started/` with `README.md` + `hello.js` + a git
   repo (`main` branch, two commits : "Initial commit" then "Add
   Mozart get-started starter files").
2. Sidebar refreshes : "Get started" project + `welcome-1`
   workspace under it.
3. Page redirects to `/workspaces/<welcome-1.id>?tour=on` ;
   AppShell mounts `<app-feature-tour>` over the workspace UI.

## S6.11 — Tour walkthrough (5 steps)

1. Step 1 highlights the sidebar Projects group `<ul>`. Tooltip
   reads "Your projects live here". Skip + Next buttons visible.
2. Click Next → step 2 highlights the active workspace row (the
   `welcome-1` row).
3. Click Next → step 3 highlights the composer wrapper (the
   `data-tour="composer-mode"` div above `<hlm-composer>`).
4. Click Next → step 4 highlights the Files tab button in the
   right aside.
5. Click Next → step 5 highlights the aside header buttons block
   (Open in IDE / Commit / PR).
6. Click Next on step 5 (button label flips to `Finish`) → closing
   card replaces the overlay : "You're all set 🎉" + Finish button.
7. Click Finish → `?tour=on` is stripped ; user stays on
   `/workspaces/<welcome-1.id>` with normal workspace UI restored.

## S6.12 — Tour dismiss paths

1. Press `Esc` at any step → `?tour=on` stripped immediately ;
   user stays on the workspace.
2. Click `Skip` button → same.
3. ResizeObserver tracks the target : resize the window mid-tour →
   the punch-hole and tooltip both follow the target's new
   `getBoundingClientRect()`.

## S6.13 — Settings

1. Open `/settings` from the AppShell footer gear → page renders
   five sections in order : Connections, Git, Notifications,
   Onboarding, Account.
2. `Connections` — existing `FeatureConnections` (LLM provider +
   GitHub cards).
3. `Git` — re-runs `git_version` on mount ; shows the detected
   version or the missing state.
4. `Notifications` — two switches (Desktop, Sound) + Send-test
   button. Toggling persists immediately (verify : restart app
   and re-open settings).
5. `Onboarding` — `Replay tour` button → navigates to `/tour`,
   which is idempotent ; reuses the existing `welcome-1` workspace.
6. `Account` — `Sign out` clears the keyring and routes to
   `/welcome`.

## S6.14 — Notifications

1. Trigger an agent turn in `welcome-1`. Switch focus to another
   workspace **OR** another OS window before the turn ends.
2. On `message_end` (or `error`) : the active OS notification
   surface shows a "Mozart" toast with the chat title. Audio chime
   plays.
3. Toggle Desktop off in Settings → re-run the agent turn →
   notification suppressed ; chime still plays.
4. Toggle Sound off (with Desktop on) → re-run → notification
   appears silently.
5. Both off → no popup, no sound.
6. `Send test notification` from Settings respects the toggles
   exactly the same way.

## S6.15 — Interrupted-message recovery

1. Send a prompt in any workspace. While the assistant is still
   streaming (status `streaming` in DB), kill the app forcibly
   (Cmd-Q / Alt-F4 / task manager).
2. Restart the app. Navigate back to the same workspace.
3. The last assistant message is rendered as an `error` state ;
   the DB row shows `status='error'`. Verify the flip persists
   across a second restart.

## S6.16 — Offline banner

1. Disable network (toggle wifi / ethernet) → top-of-screen banner
   appears within ~30 s : "You're offline. Hosted features
   (sign-in, hosted LLMs) are paused."
2. Re-enable network → banner disappears after the next probe.
3. The banner does NOT block clicks on the underlying UI.

## S6.17 — Auth + onboarding guards

1. While signed in but `onboarding_completed === false`, manually
   navigate to `/`, `/workspaces/:id`, `/settings` → all redirect
   to `/onboarding`.
2. `/welcome`, `/onboarding`, `/tour` are reachable.
3. While signed out, navigating to any route except `/welcome` →
   `authGuard` redirects to `/welcome`.
4. Sign out via Settings → land on `/welcome` ; keyring entry
   removed (`auth_load_session` returns null on next boot).

---

## Coverage map (atom ↔ scenarios)

| Atom | Scenarios |
| ---: | --- |
| 0 (JWT decode + routing) | S6.2, S6.3 |
| 1 (domain shell + routes) | S6.1, S6.17 |
| 2 (Welcome + Git) | S6.4, S6.5 |
| 3 (LLM provider + PTY) | S6.6, S6.7 |
| 4 (GitHub + finish) | S6.8, S6.9 |
| 5 (HighlightOverlay primitive) | S6.11, S6.12 |
| 6 (tour route + bundled project) | S6.10 |
| 7 (tour content) | S6.11, S6.12 |
| 8 (Settings) | S6.13 |
| 9 (polish) | S6.15, S6.16 |
| 10 (notifications) | S6.14 |

## Notes for the Playwright wiring

- **Mock Clerk** in apps/web means tests can drive `/login` →
  `/dashboard` without external auth. The deep-link side needs a
  Tauri-aware harness (WebdriverIO + `tauri-driver` is the official
  path).
- **`~/Mozart/get-started/` cleanup** : the create command is
  idempotent, but tests should reset this folder between runs to
  avoid drift from prior agent edits.
- **PTY testing** (S6.6) is the trickiest scenario : the
  `claude login` CLI is interactive. Recommend stubbing
  `spawn_claude_login` in test mode to emit a canned token-paste
  then exit 0, or skipping S6.6 and only running S6.7 (API-key
  fallback) in CI.
- **Notifications** (S6.14) : CI test runners typically don't
  surface OS notifications. The Test button + asserting the call
  reached `commands.emitMessageEndNotification` is enough for the
  spec ; visual verification is manual.

_End of Phase 6 e2e scenarios._
