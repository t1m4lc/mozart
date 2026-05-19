# Telemetry Implementation Plan

> **Status**: spec — incrementally implemented.
> **Last updated**: 2026-05-19
> **Aligned with**: `plan-v0.1.0-beta.1.md` §Domain `telemetry` (lines 2066-2074) and Phase 9.4 (line 1841); `mozart-product-architecture-specs.md` (lines 92, 245); `mozart-operating-system-vision.md:130`.

## Why

We need to answer four questions about Mozart's beta:

1. **Where do users come from?** organic / blog / docs / direct / referral
2. **What's the conversion of intent to install?** download CTA click → desktop app open
3. **What's the activation rate?** install → auth → first workspace
4. **Do users come back?** week-over-week retention, requires identified auth

PostHog (already named in `mozart-architecture.md:973` and Phase 9.4) is the chosen tool. It auto-captures pageviews like Google Analytics, plus supports custom events, funnels, retention cohorts, and **cross-subdomain identity** so an anonymous landing visit can be linked to an authenticated app session once login happens.

This spec covers the `telemetry` domain only. The separate **`metrics`** domain (`plan-v0.1.0-beta.1.md:2062` — user-facing token/usage dashboard) is out of scope here.

## Scope — three surfaces, one PostHog project

| Surface | Host | Auth model | Identity |
|---|---|---|---|
| **Landing** | `mozart.build` | always anonymous | PostHog auto `distinct_id` (cookie) |
| **Web (auth)** | `app.mozart.build` | OAuth login screen | inherits landing cookie via `cross_subdomain_cookie` |
| **Desktop** | local (Tauri) | OAuth via deep-link callback | `install_id` (anon) → `posthog.identify(userId)` after auth |

### Identity bridging

- **Landing → Web**: PostHog initialized with `{ cross_subdomain_cookie: true }` (cookie domain `.mozart.build`). Visiting `mozart.build` and then `app.mozart.build` keeps the same `distinct_id`.
- **Web → Desktop**: on successful auth, both web and desktop call `posthog.identify(userId)` with the same `userId`. PostHog merges the anonymous landing/web session AND the desktop `install_id` session into one identified user across devices.
- **Tally gap (current)**: the Tally beta-signup form sits between "Download click" and "actual install". We forward PostHog's `distinct_id` as a `dl_id` query param on the Tally URL so when a real installer link exists later, it can carry `dl_id` through to install-time. Until that's wired, the funnel will show an explicit gap between `download_tally_redirected` and `app_opened`. That gap is real, not a tracking bug.

### Consent model

- **Landing**: default PostHog cookie persistence (no explicit opt-in banner v1). Revisit before EU public launch (Phase 9.8 — Privacy/ToS hardening).
- **Desktop**: **opt-in mandatory** at onboarding per `plan-v0.1.0-beta.1.md:2069`. A `telemetry_opt_in` flag in the config KV table (alongside `onboarding_completed`) gates every desktop `capture()` call.
- **Web**: inherits landing cookie; no separate banner.

## The funnel

```
[$pageview /]                ← acquisition: referrer, UTM, source
   ↓ (or from /docs/*, /blog/*, /changelog/*)
[download_cta_clicked]       ← intent — source: 'hero' | 'header'
   ↓
[download_tally_redirected]  ← proxy for "download started"
   ⤵   ⤴ (Tally form fill + email + binary delivery — out-of-band)
[app_opened]                 ← desktop first launch → "installed"
   ↓
[non_auth_login_clicked]
   ↓ (browser opens app.mozart.build/login)
[login_page_viewed]          ← apps/web
   ↓
[login_clicked]              ← apps/web — initiates OAuth
   ↓ (deeplink back to desktop)
[auth_user_completed]        ← desktop → posthog.identify(userId)
   ↓
[workspace_created]          ← first workspace milestone (activation)
   ↓
[app_opened, day N]          ← retention cohort
```

## Event catalog

### Landing (`mozart.build`)

| Event | Trigger | Properties |
|---|---|---|
| `$pageview` | every Angular `NavigationEnd` | `$current_url`, `$referrer`, `$referring_domain`, UTM params |
| `doc_viewed` | `/docs/<slug>` renders | `slug`, `title`, `section` |
| `blog_post_viewed` | `/blog/<slug>` renders | `slug`, `title`, `authors[]`, `has_hero` |
| `download_cta_clicked` | Download button click (hero or header) | `source: 'hero' \| 'header'`, `section: 'home' \| 'blog' \| 'docs' \| 'changelog' \| 'download' \| 'other'`, `os`, `path` |
| `download_tally_redirected` | primary/secondary CTA click or Enter key inside dialog | `source`, `section`, `os`, `cta`, `dl_id` |

### Web (`app.mozart.build`) — gated on `apps/web` login page existence

| Event | Trigger | Properties |
|---|---|---|
| `$pageview` | route change | std |
| `login_page_viewed` | `/login` renders | `from?` (referrer path) |
| `login_clicked` | "Sign in with GitHub" clicked | `provider: 'github'` |

### Desktop (`apps/desktop`)

| Event | Trigger | Properties |
|---|---|---|
| `app_opened` | every Angular bootstrap, after `app.config.ts` initializer | `is_first_open`, `install_id`, `version`, `platform` |
| `non_auth_login_clicked` | welcome page CTA → `auth.facade.ts:signIn()` | `install_id` |
| `auth_user_completed` | `auth.facade.ts:onDeepLink()` success path | `userId`, `install_id`, `onboarding_required` |
| `workspace_created` | first successful `WorkspacesFacade.create*()` | `userId`, `is_first` |

Anonymous **`install_id`** = v4 UUID generated once on first Rust `setup` hook, stored in the existing config KV table (`apps/desktop/src-tauri/src/db/config.rs`). Used as PostHog `distinct_id` pre-auth. On `auth_user_completed`, `posthog.identify(userId, { install_id })` merges identities across surfaces.

## Implementation phases

### Phase A — Landing instrumentation (immediately buildable)

- [x] **A.1** Create PostHog Cloud project (EU region recommended for GDPR data residency). Add hidden `dl_id` field in Tally form `eq07lQ`. _(user action)_
- [x] **A.2** Install `posthog-js` in `apps/landing/`; add `VITE_POSTHOG_KEY` + `VITE_POSTHOG_HOST` env vars; commit `.env.example`; ensure `.env.local` is gitignored.
- [x] **A.3** Create `apps/landing/src/app/shell/analytics/analytics.service.ts` — browser-only wrapper (`isPlatformBrowser(PLATFORM_ID)` guard). Init with `{ cross_subdomain_cookie: true, persistence: 'localStorage+cookie', capture_pageview: 'history_change', capture_pageleave: false, autocapture: false, capture_performance: false, disable_session_recording: true, request_batching: false }` — GA-like single Pageview per nav, no Pageleave/click-heatmaps/session-recording/web-vitals, and `request_batching: false` so each capture is its own HTTP request (no batch delay; revisit if traffic justifies it). Methods: `init()`, `capture(event, props)`, `distinctId()`, `identify(userId, props)`. Internal queue flushes pre-init `capture()` calls once the SDK lazy-loads, so events fired right after page load don't drop.
- [x] **A.4** (removed — superseded by A.3 native pageviews; no manual page-tracker file).
- [x] **A.5** Hook `App` root (`apps/landing/src/app/app.ts:27`) to call `analytics.init()` inside `afterNextRender`. SSR/prerender stays untouched.
- [x] **A.6** Track `download_cta_clicked` from `hero.component.ts` and `site-header.component.ts` openers (with `source`, `section`, `os`, `path`). `section` is derived from the current path via `pageSection()` (home/blog/docs/changelog/download/other) — lets us slice header clicks by where the user was reading. Pass `source` + `section` via dialog context to `DownloadDialogComponent`. Share `detectOsTag(OsService)` and `pageSection(path)` as functional helpers under `apps/landing/src/app/shell/analytics/`.
- [x] **A.7** (removed — `download_dialog_opened` was redundant with `download_cta_clicked` since clicking a CTA always opens the dialog. Dropped to keep the funnel to three meaningful steps.)
- [x] **A.8** Track `download_tally_redirected` on primary/secondary anchor click + `onEnter()` in `download-dialog.component.ts` (with `source`, `section`, `os`, `cta`, `dl_id`).
- [x] **A.9** Append `dl_id = analytics.distinctId()` and `source` to Tally URL via `buildHref()` in `download-dialog.component.ts`, alongside existing `os` and `from`.
- [ ] **A.9** Append `dl_id = analytics.distinctId()` to Tally URL in `download-dialog.component.ts:buildHref()` (line 126-131), alongside existing `os` and `from`.
- [ ] **A.10** Track `doc_viewed` from existing `effect()` in `docs.page.ts:101-118` when `currentDetail()` changes.
- [ ] **A.11** Track `blog_post_viewed` from existing `effect()` in `blog.page.ts:119-135` when `currentPost()` changes.
- [ ] **A.12** Manual verification with PostHog Live tab — cold load `/`, click-through hero Download, navigate `/docs → /docs/install → /blog/hello-world`, confirm all events arrive with correct properties; confirm `pnpm nx build landing` still passes SSR prerender; no `posthog` strings in prerendered HTML.

**Acceptance**: cold-loading 4 pages + clicking the funnel produces ≥7 events visible in PostHog Live with correct `source`, `os`, `path`, `dl_id` properties.

### Phase B — Web auth events (gated on `apps/web` login page existence)

- [ ] **B.1** Install `posthog-js` in `apps/web/` once the login surface exists.
- [ ] **B.2** Initialize with the same `VITE_POSTHOG_KEY` and `cross_subdomain_cookie: true` so the landing `distinct_id` is reused.
- [ ] **B.3** Track `login_page_viewed` on `/login` mount.
- [ ] **B.4** Track `login_clicked` on the GitHub OAuth button.
- [ ] **B.5** On successful auth completion (web side, just before the deeplink-back-to-desktop), call `posthog.identify(userId)` to mark the same anonymous visitor as authenticated.

**Blocker**: requires `apps/web` to actually serve a login page (currently placeholder per `CLAUDE.md`).

### Phase C — Desktop telemetry

- [ ] **C.1** Generate stable `install_id` (v4 UUID) in `apps/desktop/src-tauri/src/db/config.rs` on first Rust `setup` hook; store alongside `onboarding_completed`.
- [ ] **C.2** Expose via Tauri command `getInstallId()`; add Angular adapter in `apps/desktop/src/app/core/tauri-adapters.ts`.
- [ ] **C.3** Install `posthog-js`; create `apps/desktop/src/app/core/analytics.service.ts`; initialize in `app.config.ts:28-55` initializer **after** `auth.bootstrap()` and `onboarding.bootstrap()`. Set `distinct_id = install_id` pre-auth. Gate every `capture()` behind `telemetry_opt_in` flag (per `plan-v0.1.0-beta.1.md:2069`).
- [ ] **C.4** Fire `app_opened` once per launch with `is_first_open` flag (derived from local "first_open_fired" boolean in config table, set to true after first event).
- [ ] **C.5** Wire `non_auth_login_clicked` in `auth.facade.ts:78-92` (`signIn()`).
- [ ] **C.6** Wire `auth_user_completed` + `posthog.identify(userId, { install_id })` in `auth.facade.ts:143-183` (`onDeepLink()` success path).
- [ ] **C.7** Wire `workspace_created` in the workspaces-facade creation flow (locate exact file under `apps/desktop/src/app/domains/workspaces/data/`).
- [ ] **C.8** Add a `telemetry_opt_in` toggle to the onboarding wizard (`docs/specs/onboarding-and-auth.md` may need a small update).
- [ ] **C.9** Manual verification — fresh install → `app_opened (is_first_open=true)` fires; click login → `non_auth_login_clicked` fires; complete OAuth → `auth_user_completed` fires with `userId` and `posthog.identify` merges the anonymous landing session (same browser) with this install.

**Blocker**: requires Phase A flowing first (verifies PostHog project + event schema before duplicating into desktop).

## Out of scope (separate plans)

- **Domain `metrics`** — user-facing usage dashboard (token spend, time per provider). Different audience, lifecycle, consent model. See `plan-v0.1.0-beta.1.md:2062`.
- **Consent banner UI on landing** — defer until EU traffic warrants. Part of Phase 9.8 privacy hardening.
- **Sentry crash reporting** — Phase 9.2, separate spec.
- **PostHog reverse proxy via Cloudflare Workers** — ad-blocker resilience, defer until events confirmed flowing.
- **Tally → PostHog webhook** — pull `dl_id` back into PostHog as an explicit `tally_submitted` event. Track manually until volume justifies.
- **Server-side events** — landing is fully client-rendered post-hydration; no server events needed.

## Known limitations

1. **Tally is opaque.** Clicking Download doesn't start a binary download today — it opens a beta signup form. We track `download_tally_redirected` as intent and deduce "installed" from desktop `app_opened`. The funnel will show a visible gap between Tally redirect and app open. That gap is real, not a tracking bug.
2. **Anonymous → identified linking fails across machines.** Browsing on laptop, installing on desktop = two unlinked anonymous sessions until login. The `dl_id` URL param mitigates this _only_ if Tally captures it AND the eventual installer link carries it forward.
3. **Cross-device retention requires auth.** Anonymous return visits on different devices look like different users.

## Verification

After Phase A:
```bash
pnpm nx serve landing
# open localhost:4200 with PostHog Live tab in another window
```
Click through funnel, confirm events.

After Phase C:
- Fresh desktop install fires `app_opened` once.
- OAuth completion merges anonymous + identified user in PostHog.
- Create first workspace → `workspace_created` event with `is_first: true`.

PostHog UI: build the funnel `$pageview → download_cta_clicked → download_tally_redirected → app_opened → auth_user_completed → workspace_created` to visualize the full acquisition → activation flow.
