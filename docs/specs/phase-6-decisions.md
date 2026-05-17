# Phase 6 — Decisions, Q&A log, and next steps

> Phase 6 (Polish + Onboarding tour) closes v0.1.0-beta.1 MVP. This doc
> captures the Q&A locked at planning time, the implementation
> outcome per atom, and the work explicitly deferred. Companion
> documents :
>
> - `onboarding-and-auth.md` — the source spec for §7 onboarding and
>   §8 tour.
> - `plan.md` Phase 6 — atomized delivery plan.
> - `phase-6-e2e.md` (under `docs/test/`) — e2e test scenarios to
>   wire post-MVP.

---

## 1. Decisions locked at planning time

The plan was reviewed against four open questions. The answers
chosen here drove the atom boundaries and the file layout.

### 1.1 Onboarding flag — source of truth

**Question** : where should the `onboarding=true|false` flag live ?

**Decision** : **JWT claim + local mirror**.

- The mocked Clerk JWT carries an `onboarding: boolean` claim
  (`apps/web/.../util-mock-jwt.ts`). Phase 5 atom 6 (this phase's
  Atom 0) decodes it on the desktop side.
- A local mirror lives in `db/config.onboarding_completed` (key /
  value row, default missing = `false`). Written when the user
  finishes step 4 of the wizard ; read on every app boot by the
  `onboardingGuard`.
- Routing on deep-link callback : JWT claim drives the initial
  `/welcome → /onboarding` vs `/welcome → /` decision. Routing on
  every subsequent navigation : the local mirror wins via the guard.

**Why** : the mock Clerk token resets the claim on every fresh
sign-in. Without the local mirror, a user who completes onboarding
on this machine would be sent back through the wizard on next
sign-in. The local mirror is the desktop's persistent truth ; the
JWT claim is the seed.

**Companion file changes** :

- `apps/desktop/src/app/domains/auth/util-decode-jwt.ts` (new pure
  helper + .spec.ts).
- `apps/desktop/src/app/domains/auth/data/auth.facade.ts` — JWT
  decoding inside `onDeepLink`.
- `apps/desktop/src/app/domains/onboarding/` (new domain).
- `apps/desktop/src-tauri/src/commands/mod.rs` —
  `get_onboarding_completed` / `set_onboarding_completed` commands.

### 1.2 HighlightOverlay — primitive location

**Question** : where should the punch-hole-and-tooltip primitive
live, given `libs/ui/**` is read-only by CLAUDE.md ?

**Decision** : **`libs/ui/highlight-overlay/`** (user-approved
touch).

- Pure presentational dumb component. Zero `@mozart/*` domain
  imports beyond the sibling `@mozart/ui/button`.
- Inputs : `steps` (readonly `HighlightStep[]`), `currentIndex`.
- Outputs : `(advance)`, `(skip)`, `(complete)`. `complete` fires
  when the last-step "Finish" button is clicked.
- Implementation : full-screen SVG with a `<mask>` punching the
  target's `getBoundingClientRect()` ; tooltip card positioned
  manually next to the target with side picked from
  `step.position` (or `auto` → most-room side).
- ResizeObserver + window `resize` / `scroll` keep the hole tracking
  layout changes via `requestAnimationFrame`.
- `Esc` emits `(skip)` via a `@HostListener('document:keydown.escape')`.

**Why** : the spec (§8.3) explicitly asks for a libs/ui primitive
that future guided-tour content can reuse. A domain-local override
would land the component in onboarding ; promoting it later would
mean a breaking move. Doing it right once keeps libs/ui semantically
clean and matches the established pattern (cf. popover, sheet).

**Note** : the rule blocks `finish` as an output name
(`@angular-eslint/no-output-native`), so the final emission is
`complete` instead.

### 1.3 "Get started" project — materialization

**Question** : how should the bundled tour project ship ?

**Decision** : **bundled template via `include_str!`**.

- `apps/desktop/src-tauri/src/get_started/README.md` and
  `hello.js` are embedded at compile time.
- New Tauri command `create_get_started_project` materializes
  `~/Mozart/get-started/` (idempotent), runs `git_query::init_repo`
  + a follow-up `git add . && git commit` for the bundled files,
  registers the repo via `add_repo_impl`, then ensures a
  `welcome-1` workspace exists on `main`.
- Re-entry from Settings → Replay tour reuses the existing
  repo + workspace ; no duplicates.

**Why** : zero network. Deterministic across machines. No moving
parts (no remote repo to maintain, no auth surface, no rate-limit
risk on first run). Tradeoff : updating the template requires a new
desktop release.

### 1.4 Secret storage

**Question** : keep keyring or migrate to Stronghold for v0.1.0-beta.1 ?

**Decision** : **keep the existing OS keyring** (`keyring` crate).

- Cargo.toml has a comment recording the abandoned Stronghold
  attempt : the plugin's IPC bridge (v2.3.1) was leaving snapshot
  writes mid-rename on Linux, causing persistence to silently fail.
- Both Anthropic API key and GitHub PAT use the keyring already
  (Phase 4f). The Phase 6 LLM-provider step reuses that path as-is
  via the existing `CREDENTIALS_ADAPTER`.

**Why** : working & shipped is better than re-engineering a known
fragile boundary in MVP polish. Stronghold migration deferred ; not
on the v0.1.0-beta.1 path.

---

## 2. Atom outcomes

| Atom | What landed | Notes |
| ---: | --- | --- |
| 0 | JWT decode + AuthFacade routing | New pure `util-decode-jwt.ts` (+ 4 unit tests). Decodes header.payload.signature, defaults `onboarding` to `false`. AuthFacade routes to `/onboarding` vs `/` based on the claim. |
| 1 | `domains/onboarding/` shell + `/onboarding` route | OnboardingFacade (bootstrap, advance/back/markStep/complete/reset). Adapter port + Tauri impl. Two new Rust commands. `onboardingGuard` redirects non-tour/non-welcome routes back to the wizard while the flag is false. |
| 2 | Welcome + Git check steps | `git_version` Rust command (argv form, no shell). `GitCheckAdapter` + Tauri impl. OS-specific install copy via a `Record<OS, GitInstallInstruction>` dictionary keyed by the existing `OsService`. |
| 3 | LLM provider step + embedded `claude login` PTY | New `spawn_claude_login` command reusing `terminal::spawn_command` + the existing `TerminalRegistry` under a synthetic id. `ProviderSetupAdapter` + Tauri impl bridging the TerminalEvent DTO onto the front-end model. Continue gated on `ProfileFacade.connection().status === connected / connected_via_claude_code`. Fallback to existing `UiConnectDialog`. |
| 4 | GitHub step + finish wiring | Reuses existing Phase 4f PAT dialog. Skip-for-now flips status to `skipped`. Finish calls `complete()` → sets flag + navigates `/tour`. |
| 5 | `libs/ui/highlight-overlay/` primitive | Full-screen SVG mask + auto-positioned tooltip card. CDK-free (no overlay primitives needed — punch-hole is just SVG). Esc → skip. ResizeObserver tracks layout. |
| 6 | `/tour` route + bundled Get started project | Rust : `get_started` module + `create_get_started_project` command. Angular : `GetStartedProjectAdapter` port + Tauri impl mapping the DTO to Project + Workspace models. TourPage bootstraps + redirects to `/workspaces/<welcome-1.id>?tour=on`. |
| 7 | Tour content (5 steps + closing card) | `feature-tour` owns the step array + cursor. AppShell mounts `<app-feature-tour>` when `?tour=on`. Selectors point at `data-tour="..."` attributes added to existing sidebar / aside / composer-wrapper elements. Skip/Esc/Finish strip the query param. |
| 8 | Settings entry points | Extended `pages/settings.page.ts` with Connections / Git / Notifications / Onboarding (Replay tour) / Account (Sign out) sections. `feature-git-status` reuses `GitCheckAdapter`. |
| 9 | Polish empty/error states | Interrupted-message recovery on hydrate (DB-backed flip from `streaming` to `error`). Top-level offline banner driven by `ConnectivityService` in AppShell. |
| 10 | Notifications + sound preferences | `NotificationPreferences { desktop, sound }` + 3 new Rust commands. UI surfaces two switches + a Send-test button. NotificationService caches prefs and gates both the desktop notification and the audio chime ; settings UI pushes new prefs into the cache for no-DB-roundtrip updates. |

---

## 3. Verification — Phase 6 demoable milestone

Run on a fresh machine state (wipe keyring + `~/.mozart/` DB) :

1. Launch app → `/welcome`.
2. Sign in → mock Clerk JWT returns with `onboarding: false` → desktop
   lands on `/onboarding` step 1.
3. Walk through 4 steps in < 2 min : Welcome → Git ✅ → Claude Code
   PTY login (or API key fallback) → GitHub (PAT) or Skip.
4. Land on `/tour` ; the bundled project materializes ;
   redirect into `/workspaces/<welcome-1.id>?tour=on` ; 5 highlights
   step through.
5. Closing card → Finish → `?tour=on` stripped, user stays on the
   workspace.
6. Restart app → straight to `/` (onboarding flag persists locally).
7. Trigger an agent turn from `welcome-1`, switch focus to another
   workspace → notification + sound at `message_end`.
8. `/settings` → see Connections, Git, Notifications, Onboarding
   (Replay tour), Account. Toggle sound off → next test
   notification is silent. Replay tour → `/tour` again.

---

## 4. Deferred / out of scope

Items explicitly punted from Phase 6 ; tracked here so they don't
get lost.

### 4.1 Audit-driven polish not delivered in Atom 9

The audit listed nine empty/error-state items. Two shipped
(interrupted-message recovery + offline banner). The rest are
defensible deferrals for v0.1.0-beta.1 :

- **Retry button on errored assistant messages** — needs a path to
  re-invoke `_runAssistantTurn` with the prior user prompt + cleanup
  of the failed row. Cross-domain plumbing inside `chat`.
- **Worktree creation failure toast** — `workspaces.facade` already
  rolls back the ghost row ; the user just doesn't see why. One-line
  add of a Sonner toast in the catch block, but no path-of-pain
  user reports yet to justify the polish.
- **Files tab empty copy** — the existing copy is acceptable ;
  bikeshed to defer.
- **Run tab no-command copy** — same.
- **Stream-error mid-turn copy** — the message flips to error but
  the rendered text is the raw error. Could be friendlier.
- **Agent crash toast** — covered by the stream-error path ; no
  separate handling.
- **Git init failure toast** — `add_repo_impl` returns AppError ;
  the dialog already surfaces it inline.

### 4.2 Phase B + post-MVP items

Carried over from `onboarding-and-auth.md` §11 :

- **Real Clerk integration** — the current `mockClerkAdapter` is a
  client-side mock. Swap for `@clerk/angular` post-MVP.
- **Token refresh** — silent refresh 24 h before expiry. Today the
  desktop stores the token until expiry and re-prompts at that
  point.
- **Stronghold migration** — see decision §1.4.
- **Multi-account support** — single account in MVP ;
  multi-account is post-MVP.
- **GitHub OAuth via Clerk** — Phase 6 ships the PAT path. Clerk's
  GitHub OAuth is post-MVP.
- **Real provider list (OpenAI, OpenRouter, Local)** — three cards
  are surfaced as "Coming soon" disabled. Wiring is post-MVP.
- **Sound picker + custom sounds** — current pref is a single
  desktop/sound boolean each. Choosing the chime file is post-MVP.

### 4.3 Tour content expansion

Spec §8.2 notes : add a 6th highlight on the `/` + `@` shortcuts in
the composer once those land. Not in MVP scope (Composer shortcuts
are post-MVP per `plan.md` §"Out of scope").

---

## 5. Anti-regression checks (run before merging Phase 6)

- `grep -rn "worktree\|HEAD\|refs/heads\|detached" apps/desktop/src/app/` →
  zero matches outside `core/_bindings.ts` + DTO comments.
- `grep -rn "@tauri-apps/api" apps/desktop/src/app/` → only in
  `*-tauri.adapter.ts` + `core/tauri-adapters.ts` +
  `core/window-controls/*`. The new `tauri-provider-setup.adapter.ts`
  uses `@tauri-apps/api/core` (Channel) ; in-bound.
- Every route except `/welcome` has `canActivate: [authGuard]`. Root
  routes also have `onboardingGuard`.
- `domains/onboarding/index.ts` re-exports features + facade + adapter
  tokens only ; no internal store / util / DTO leak.
- All new components declared with `ChangeDetectionStrategy.OnPush`.
- `libs/ui/highlight-overlay/**` does not import `@mozart/*` domains
  (only `@mozart/ui/button`).
- New Tauri commands (`git_version`, `spawn_claude_login`,
  `create_get_started_project`, `get_onboarding_completed`,
  `set_onboarding_completed`, `get_notification_preferences`,
  `set_notification_preferences`, `emit_message_end_notification`)
  all registered in `bindings_export.rs` ; bindings regenerated.
- DB-backed state for : `onboarding_completed`,
  `notifications_desktop`, `notifications_sound`, interrupted-message
  recovery.

_End of Phase 6 decisions log._
