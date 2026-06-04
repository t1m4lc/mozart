# Analytics Roadmap — Lean Implementation Plan

> **Status**: actionable plan
> **Date**: 2026-06-04
> **Companion docs**: [`ANALYTICS_AUDIT.md`](./ANALYTICS_AUDIT.md) (why) · [`ANALYTICS_REFERENCE.md`](./ANALYTICS_REFERENCE.md) (the target schema) · [`ANALYTICS_POSTHOG_FUNNELS.md`](./ANALYTICS_POSTHOG_FUNNELS.md) (how to build the funnels in PostHog)

The audit found a good foundation with almost no coverage. This roadmap closes the gap in priority
order. The guiding principle: **wire the identity spine first, then instrument the surfaces that are
currently dark, then harden.** Don't add a single event that isn't in the reference catalog.

---

## Priority order at a glance

| # | Work | Unlocks | Effort | Status |
|---|---|---|---|---|
| **P0** | Wrapper hardening: queue `identify()` until init + add `reset()` | makes every merge below actually fire (not silently drop) | S | ✅ done |
| **P0** | Wire `identify(userId)` on web + `reset()` on logout | every cross-surface funnel + per-user retention, no identity bleed | S | ✅ done |
| **P0** | Web auth events (`signup_completed` / `login_completed`) | Funnel 1→2 handoff, Signup Rate | S | ✅ done |
| **P1** | Desktop analytics service + `install_id` + `identify` + consent gate | Funnels 2/3/4, activation, retention | M | ✅ done |
| **P1** | Desktop activation events (`desktop_authenticated`, `onboarding_completed`, `workspace_created`, `agent_completed`) | Activation Rate, TTV, WAU/MAU | M | ✅ done |
| **P2** | Value + config events (`project_added`, `pr_created`, `provider_connected`) | Funnel 4, North-Star | S | ⬜ |
| **P2** | Rename `download_started` → `downloaded` (landing) | clean canonical download metric | XS | ⬜ |
| **P2** | Add explicit dev-mode init guard + standardize host on `t.mozart.build` | no dev pollution, host consistency | XS | ⬜ |
| **P2** | Event-name constants + base-property registration | data quality, no typos | S | ⬜ |
| **P3** | Staging PostHog project + validation lane | safe schema changes | S | ⬜ |
| **P3** | Resolve `dl_id` (wire through installer or drop) | clean cross-machine bridge | S | ⬜ |
| **P3** | Desktop telemetry opt-in toggle | consent compliance | S | ⬜ |

---

## P0 — Identity spine + web auth (highest leverage, smallest effort)

Without this, nothing past "download" is measurable. The wrapper already has `identify()`, but it has
two correctness bugs that must be fixed first (eng review, 2026-06-04), and the web auth facade
already holds the Clerk `userId`.

### 0a. Wrapper hardening (do first — it's the foundation for every merge below)
- [ ] **0.1** **Queue `identify()` until init.** Today `identify()` is `this.posthog?.identify(...)` — a silent no-op if called before the lazy `init()` resolves (`analytics.service.ts:56`). `capture()` already queues; `identify()` must too. Store a pending `{ userId, props }` and apply it when PostHog loads (or have `identify()` await `initPromise`). Web OAuth is redirect-based, so without this the callback-page `identify()` races init and the merge silently drops. One wrapper change covers **both** P0 (web) and P1 (desktop).
- [ ] **0.2** **Add `reset()` to the wrapper.** No `reset()` exists anywhere. Expose `reset()` that calls `posthog.reset()` (and clears any pending identify). Required so logout doesn't merge the next person on a shared browser into the previous user.

### 0b. Web auth wiring
- [ ] **0.3** In `apps/web` `auth.facade.ts`, on successful auth, call `analytics.identify(userId)` using the Clerk user id. With 0.1 in place this is safe regardless of init timing.
- [ ] **0.4** Call `analytics.reset()` in web `signOut()` (`auth.facade.ts:134`, right before/after `clerk.signOut()`).
- [ ] **0.5** Fire **separate** `signup_completed` (new Clerk user) and `login_completed` (returning) events — confirmed decision, do not collapse into one. Properties: `userId`, `provider: 'github' | 'google'`, `surface: 'web'`. **Pin the exact Clerk field first**: confirm how the OAuth result distinguishes a just-created user from a returning one (e.g. `signUp` resource / `createdSessionId` vs `signIn`, or `user.createdAt` within N seconds). If the signal isn't cleanly available, raise it before building — don't guess and mislabel.
- [ ] **0.6** Confirm the cross-subdomain cookie is doing its job: a landing visit then a web signup should show **one** person in PostHog, not two. Verify in the Activity/Persons view.

**Acceptance**:
- Fresh browser → visit `mozart.build` → sign in on `app.mozart.build` produces a **single** PostHog person whose timeline shows the landing `$pageview` **and** `signup_completed`.
- `identify()` called immediately on the callback page (before init resolves) still lands — verified by the person being identified, not anonymous.
- Sign out, then sign in as a different user on the same browser → **two distinct** PostHog persons, not a merged one.

---

## P1 — Desktop instrumentation (the dark continent)

All activation and value events live in desktop. This is the bulk of the value.

### 1a. Foundation
- [ ] **1.1** Generate a stable `install_id` (v4 UUID) on first Rust `setup` hook; store in the config KV table (`apps/desktop/src-tauri/src/db/config.rs`), alongside `onboarding_completed`.
- [ ] **1.2** Expose `getInstallId()` via a Tauri command + Angular adapter (`libs/desktop-core-tauri`).
- [ ] **1.3** Add `posthog-js` to desktop; reuse `AnalyticsService` from `@mozart/shared-util-analytics` (do **not** fork a second wrapper). Initialize after auth/onboarding bootstrap. Set `distinct_id = install_id` pre-auth. Register base super-properties: `surface: 'desktop'`, `app_version`, `install_id`.
- [ ] **1.4** **Build the consent system technically now; defer the UX to P3** (eng review decision, 2026-06-04). Concretely:
  - Add a `telemetry_opt_in` flag to the config KV table with a storage + read path (Tauri command + Angular adapter), alongside `install_id` / `onboarding_completed`.
  - Route **every** desktop `capture()` through a single helper that checks the flag — no `capture()` ever touches PostHog directly. This is the one chokepoint, so flipping the default later is a one-line change.
  - **Default `telemetry_opt_in = true` for the private beta** so we collect usage and can validate the product.
  - **Do not** add the onboarding consent screen or settings toggle in P1 — structure the code so P3 only has to surface the switch and (if desired) flip the default.
  - **Release guard (mandatory):** add a `// TODO(public-launch): surface telemetry consent in onboarding + settings before GA; default may need to flip to opt-in` at the gate, and a matching line in P3.3 below. Beta-by-default must not silently ship to GA.

### 1b. The critical merge
- [ ] **1.5** In `auth.facade.ts:onDeepLink()` success path (~line 228, after `saveSession`), fire `desktop_authenticated { userId, install_id, provider, onboarding_required }` **and** call `analytics.identify(userId, { install_id })`. This merges the anonymous install into the same identified user as web/landing — the keystone of cross-platform measurement. Relies on the queued `identify()` from **0.1**. Also call `analytics.reset()` in desktop `signOut()` (same reason as web 0.4).

### 1c. Activation events
- [ ] **1.6** `onboarding_completed` in `onboarding.facade.ts:complete()` (line 115). Property `github_connected`.
- [ ] **1.7** `workspace_created` in `workspace.facade.ts:createForPrompt()` (line 230). **Set `is_get_started` and `is_first`** — the onboarding-precreated workspace must be flagged so it's excluded from activation (see reference §2.3 warning).
- [ ] **1.8** `agent_completed` — **fire from a higher-level facade, not `run-registry` directly** (eng review decision, 2026-06-04). `run-registry` knows the run status + `exitCode` but has zero knowledge of changed files, and both Activation Rate and the North-Star are defined on *change-producing* runs. Emit from a facade that sees **both**:
  - `outcome` — derive from `run-registry`'s `exitCode` signal (`run-registry.service.ts:49`) + whether `stopRun()` was called: `code === 0 → 'succeeded'`, `code !== 0 → 'failed'`, user stop → `'stopped'`.
  - `produced_changes` — read the workspace's changed-file state (file-views / repositories domain) after exit.
  - Other props: `duration_ms`, `provider`, `workspace_id`, `is_get_started`.
  - **Respect module boundaries** — the emitting facade may already depend on both `runs` and `repositories` data-access; if not, put the orchestration in a `feature`-layer coordinator rather than reaching across `data-access` libs. **This is the activation "Aha!" event — get its properties right.** (No separate `agent_started` — KISS decision, see reference §2.6.)

**Acceptance**:
- Fresh install → sign in → `desktop_authenticated` + identify merges the anonymous landing session → create a workspace → run an agent → `agent_completed` fires with correct `outcome` **and** `produced_changes`, and the whole journey is **one person** in PostHog.
- **Consent gate (1.4):** default beta config → `telemetry_opt_in = true` → events are captured. Manually set `telemetry_opt_in = false` → events are skipped. `capture()` never bypasses the flag directly (verified by the single-chokepoint helper).

---

## P2 — Value, config & data quality

- [ ] **2.1** `project_added` in `project.facade.ts:add()` (line 241). `is_first`, `source`.
- [ ] **2.2** `pr_created` in `workspace.facade.ts:createPr()` success (line 485). `draft`, `provider`. **End of the value loop for the user today.** (No `diff_reviewed` — cut, see reference §2.6.)
- [ ] **2.3** `provider_connected` in `profile.facade.ts:connectFor()` / GitHub / Codex paths. `provider`, `is_first`, `connected_count`. **Provisional** — kept only to answer *which providers do users use, and do they use more than one?* Drop if the answer turns out to be boring.
- [ ] **2.4** Rename landing `download_started` → `downloaded` at `download-dialog.component.ts:261` and `download.page.ts:161`. Keep all existing props.
- [ ] **2.5** Add an **explicit dev-mode guard** to `AnalyticsService.init()` (skip init in dev/non-prod regardless of key; `POSTHOG_FORCE_ENABLE` → staging override only), and **standardize `posthogHost` on `https://t.mozart.build`** in landing dev env (currently `eu.i.posthog.com`).
- [ ] **2.6** **Centralize event names + base props.** Add an exported `ANALYTICS_EVENTS` const map (and a small `captureEvent()` helper that auto-attaches `surface`/`app_version`) in `shared-util-analytics`. No more raw string literals at call sites — kills typos and makes the catalog greppable. Matches the reference doc 1:1.

**Acceptance**: all four reference funnels build in PostHog with non-zero data; North-Star insight
(WAU with ≥1 change-producing `agent_completed`) renders.

---

## P3 — Hardening

- [ ] **3.1** **Staging project.** Create a second PostHog project; route `develop`/PR-preview deploys to it via `vars.POSTHOG_KEY` (staging) so schema changes are validated against a non-prod project before merge. Today there is **no validation lane** — prod is the only place events land.
- [ ] **3.2** **Resolve `dl_id`.** Either wire it through the installer → desktop first-run (so a cross-machine download links to its install) or **drop it** from `downloaded`. Currently orphaned.
- [ ] **3.3** **Full telemetry consent UX (RELEASE GUARD — must land before public launch).** The technical gate + storage ship in P1 (1.4); P3 adds the human-facing layer: onboarding consent copy, a settings toggle, preferences management, and `reset()` on opt-out. **Decide the GA default here** — beta runs `telemetry_opt_in = true` by default; public launch may need to flip to opt-in depending on the consent stance. Clear the `TODO(public-launch)` guard left at the gate in 1.4. **Do not ship GA with beta-by-default telemetry and no consent surface.**
- [ ] **3.4** Update/retire `docs/engineering/specs/telemetry.md` — it references the removed Tally flow and `download_tally_redirected`. Point it at these three docs.

---

## Implementation standards

### Naming
- `snake_case`, `object_action`, past/observable tense. (`workspace_created` ✅, `createWorkspace` ❌, `WorkspaceCreated` ❌.)
- Names come from [`ANALYTICS_REFERENCE.md`](./ANALYTICS_REFERENCE.md) §2 — that catalog is authoritative. Adding an event = edit the reference doc **first**.
- Properties `snake_case`. `userId` is always the **Clerk user id**, identical across surfaces.

### Environment separation
- **Host**: all surfaces use **`https://t.mozart.build`** (reverse proxy to EU PostHog). Standardize landing dev on it too.
- **One prod project** across landing/web/desktop (required by the cross-subdomain + identify model).
- **One staging project** for `develop`/previews (P3.1).
- **Dev**: **never init PostHog in dev.** Guard `init()` on a dev/non-prod check, not just the empty key. `POSTHOG_FORCE_ENABLE` (staging only) is the sole override for local wiring checks; never point dev at the prod project.
- **Internal users**: all dashboards/metrics filter `is_internal_device=true` out. Mechanism already exists (super + person property, `?internal=` opt-in, server-resolved) — keep it intact on every surface, including desktop.

### Staging validation (definition of done for any event PR)
1. Event appears in the **staging** project's Live/Activity view with all required base + event props.
2. The relevant funnel step increments in staging.
3. `is_internal_device` is set correctly (true for team devices via `?internal=` opt-in).
4. Only then promote to prod via merge.

### Keep it lean
- The bar for any new event: *a funnel or PMF metric in the reference doc requires it.* Nothing speculative.
- Prefer filtering `$pageview` over new page-view events.
- One wrapper (`shared-util-analytics`), reused on all three surfaces. No per-app analytics code.

---

## Dependency graph

```
P0.1/0.2 wrapper (queue identify + reset)   ← do FIRST, everything below silently drops without it
   └─> P0 web auth (identify, reset, signup/login)
          └─> P1 desktop (install_id, consent gate, identify merge, activation events)
                 └─> P2 value/config events ──> P2.6 constants
   └─> (Funnel 1 already works today)
P3 hardening parallel once P0 lands. EXCEPTION: 3.3 consent UX is a hard release guard before GA.
```

P0 is the unlock for everything. Do it first, even alone — it converts the existing landing data and
the soon-to-exist web/desktop data from "anonymous device noise" into "one human across the journey".
