# Phase 5 — Auth + Foundations

Scenarios covering `/welcome` on the desktop, the apps/web `/login`
and `/dashboard`, the deep-link handshake (`mozart://auth?…` + HTTP
loopback fallback), and the token / API-key storage rules.

---

### Scenario : Fresh install lands on /welcome

**Priority** : MUST

**Preconditions** :
- No prior auth session on this machine (OS keyring empty for the
  Mozart entry).

**Steps** :
1. Launch the desktop app.

**Expected** :
- The app routes to `/welcome`.
- The card shows the Mozart logo + "Start composing" + "Sign in to
  continue" + Sign in button.
- No sidebar, no dashboard cards.

**Edge cases** :
- Existing session in the keyring → app skips `/welcome` and routes
  to `/` (or `/onboarding` if `onboarding_completed` is false).

---

### Scenario : Sign in opens the browser at app.mozart.build

**Priority** : MUST

**Preconditions** :
- On `/welcome`. No active sign-in flow.

**Steps** :
1. Click Sign in.

**Expected** :
- The default OS browser opens at
  `https://app.mozart.build/login?state=<nonce>&port=<port>`.
- The welcome card flips to the "Opening browser…" sub-state with
  the Sign in button disabled and a Cancel button visible.
- A 5-minute timeout arms ; after 5 min without deep-link, the state
  flips to "timed-out".

**Edge cases** :
- User clicks Cancel during the wait → state returns to idle, button
  re-enabled.
- User clicks "Try again" link under the spinner → re-fires
  `shell.open` against the SAME URL (preserves nonce).
- `shell.open` itself throws (no default browser) → state returns to
  idle ; error is logged.

---

### Scenario : Deep-link arrives, token is stored, app routes to / or /onboarding

**Priority** : MUST

**Preconditions** :
- On `/welcome`, signing in.
- apps/web has just synthesized a `mozart://auth?token=<jwt>&state=<nonce>`
  call.

**Steps** :
1. The desktop receives the deep-link (either via OS scheme handler
   or via the HTTP loopback callback at `127.0.0.1:<port>/auth`).

**Expected** :
- The `state` is validated against the pending nonce.
- On success, the JWT is decoded for `exp` + `onboarding`.
- The session is saved to the OS keyring.
- App routes to `/` if `onboarding === true`, else `/onboarding`.
- `AuthFacade.isAuthenticated` becomes true.

**Edge cases** :
- State mismatch → the deep-link is ignored, sign-in is cancelled,
  welcome card returns to idle.
- Token expired at arrival → routed to `/welcome` again ; user has
  to start over.
- Save to keyring fails → sign-in is cancelled ; user can retry.

---

### Scenario : Logout clears the session

**Priority** : SHOULD

**Preconditions** :
- Authenticated, on `/settings`.

**Steps** :
1. Click Sign out.

**Expected** :
- Keyring entry is deleted.
- `AuthFacade.isAuthenticated` becomes false.
- App routes to `/welcome`.

**Edge cases** :
- Deletion fails (transient keyring error) → in-memory session still
  cleared ; navigation still happens. The keyring entry will be
  overwritten on next sign-in.

---

### Scenario : apps/web /login surfaces Clerk providers

**Priority** : SHOULD

**Preconditions** :
- Visit `https://app.mozart.build/login` (or local dev URL).
- A valid `state` + `port` query param present (e.g. opened from
  desktop Sign in).

**Steps** :
1. Page mounts.

**Expected** :
- Logo + "Start composing" + GitHub button + Google button.
- The `state` + `port` are persisted in localStorage so a new tab
  opened by a second `shell.open` shares them.

**Edge cases** :
- No state / port present → page still mounts, but the post-auth
  handoff will surface the "no-handoff" state.

---

### Scenario : apps/web /dashboard handoff "Launch Mozart desktop"

**Priority** : MUST

**Preconditions** :
- Authenticated on apps/web. State + port + token available.
- Desktop app is running and bound the HTTP callback port.

**Steps** :
1. Visit `/dashboard`.
2. Click "Launch Mozart desktop".

**Expected** :
- The button flips to "Connecting to Mozart…" with a spinner.
- A `fetch http://127.0.0.1:<port>/auth?token=<jwt>&state=<state>`
  fires.
- On HTTP 200 : ✓ icon + "You're signed in 🎉" + "Switch back to
  Mozart" sub-line + "You can close this tab now."
- The desktop side receives the synthesized `mozart://auth` URL and
  performs the sign-in flow as in the earlier scenario.

**Edge cases** :
- Desktop NOT running (`fetch` fails) → ⚠ icon + "Mozart desktop
  isn't responding" + Retry button + Download link.
- Mobile UA → a different layout : "Mozart is desktop-only" + Download
  link, no Launch button.
- No state/port in URL → "No Mozart handoff for this tab" state.

> TODO clarify (auto-fire vs explicit click) : spec §4.3 said
> auto-fire on mount, code chose explicit click. Tests should match
> whichever wins in product.

---

### Scenario : Unauthenticated routes redirect to /welcome

**Priority** : MUST

**Preconditions** :
- No active session (keyring empty, no in-memory token).

**Steps** :
1. Launch the app.
2. Attempt to navigate to `/`, `/workspaces/<any-id>`, `/onboarding`,
   `/tour`, `/settings` via direct URL manipulation (e.g. devtools
   or relaunch with a saved URL).

**Expected** :
- All non-`/welcome` routes redirect back to `/welcome`.
- `/welcome` remains reachable.
- No flash of protected UI before the redirect.

**Edge cases** :
- Token in keyring but expired → routed to `/welcome` with a
  "session expired" hint (if implemented).
- Token valid but `onboarding_completed === false` → see Scenario :
  Auth and onboarding guards redirect mid-onboarding users.

---

### Scenario : Auth and onboarding guards redirect mid-onboarding users

**Priority** : MUST

**Preconditions** :
- Signed in. `onboarding_completed === false`.

**Steps** :
1. Manually navigate to `/`, `/workspaces/<any-id>`, `/settings` via
   direct URL.
2. Manually navigate to `/welcome`.
3. Manually navigate to `/onboarding`, `/tour`.

**Expected** :
- Step 1 : all redirect to `/onboarding`.
- Step 2 : remains on `/welcome` (no auto-redirect to `/onboarding`).
- Step 3 : reachable.

**Edge cases** :
- Sign out via `/settings` → land on `/welcome` ; keyring entry
  removed (`auth_load_session` returns null on next boot).
- `db/config.onboarding_completed === true` and JWT carries
  `onboarding: false` → local mirror wins, user routes to `/`.

---

### Scenario : Token + API keys never hit localStorage on desktop

**Priority** : MUST

**Preconditions** :
- Build tooling runs a static grep / DOM inspection.

**Expected** :
- `grep -rn "localStorage|sessionStorage|indexedDB"
  apps/desktop/src/app/domains` returns matches only in comments
  explaining apps/web behavior — no actual storage writes.
- Anthropic API key stored via the credentials adapter (Stronghold or
  OS keyring), not in the SQLite database, not in localStorage.

**Edge cases** :
- apps/web SIDE may persist its own mock-Clerk user + state + port in
  localStorage (deliberate cross-tab share). The check excludes
  apps/web.
