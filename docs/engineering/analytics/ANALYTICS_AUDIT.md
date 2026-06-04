# Analytics Audit — Current PostHog State

> **Status**: audit snapshot
> **Date**: 2026-06-04
> **Scope**: Landing (`mozart.build`), Web Cloud (`app.mozart.build`), Desktop (Tauri)
> **Companion docs**: [`ANALYTICS_ROADMAP.md`](./ANALYTICS_ROADMAP.md) · [`ANALYTICS_REFERENCE.md`](./ANALYTICS_REFERENCE.md)
> **Supersedes the narrative in**: `docs/engineering/specs/telemetry.md` (now partially stale — see §6)

---

## 1. TL;DR

Mozart has a clean, well-built analytics **foundation** but almost no **coverage**. A shared
`posthog-js` wrapper is correctly configured (privacy-conscious, lazy, SSR-safe, internal-traffic
tagging). But only the **Landing** surface emits product events. **Web sends nothing but
`init()`**, **Desktop has no analytics at all**, and the one method that makes cross-platform
measurement possible — `identify()` — **is defined but never called anywhere in the codebase**.

The net effect: today you can answer *"how many people clicked download"* and nothing past that.
The entire journey from install → auth → activation → retention is dark.

| Surface | PostHog init | Product events | Identity stitching |
|---|---|---|---|
| **Landing** | ✅ yes | ✅ `download_cta_clicked`, `download_started`, `$pageview` | anonymous cookie only |
| **Web** | ✅ yes (`init()` only) | ❌ none | ❌ `identify()` never called |
| **Desktop** | ❌ none | ❌ none | ❌ none |

---

## 2. Architecture

### 2.1 Shared wrapper — `libs/shared-util-analytics`

A single Angular `util` lib wraps `posthog-js` (`^1.373.5`) and is consumed by both `apps/landing`
and `apps/web`. This is the right shape — one wrapper, one config, no per-app drift.

| File | Role |
|---|---|
| `analytics.service.ts` | `AnalyticsService` — `init()`, `capture()`, `identify()`, `distinctId()`. Lazy-imports `posthog-js`, queues pre-init captures, browser-only guard. |
| `analytics-core.ts` | Pure config: `buildPostHogConfig()`, `resolvePostHogKey()`, internal-device URL token parsing. |
| `tokens.ts` | `POSTHOG_KEY` / `POSTHOG_HOST` injection tokens (default empty → disabled). |
| `internal-device.service.ts` | Resolves `is_internal_device` via `/api/analytics/is-internal-device` + `?internal=<token>` opt-in. |
| `cookie.service.ts` | Minimal cookie reader. |

**Strengths (keep these):**
- **Lazy load** — `posthog-js` is dynamically imported, off the critical path.
- **Pre-init queue** — `capture()` before `init()` resolves is buffered and flushed; no dropped events on cold load.
- **SSR/prerender safe** — `isPlatformBrowser` guard; landing prerenders with no `posthog` strings leaking into HTML.
- **Privacy-conscious config** — `autocapture: false`, `disable_session_recording: true`, `capture_performance: false`, `capture_pageleave: false`. Single Pageview per nav (`capture_pageview: 'history_change'`). No heatmaps, no recordings.
- **Internal-traffic tagging** — `is_internal_device` is set as both a **super-property** and **person-property**, resolved server-side via a Cloudflare Pages function + cross-subdomain cookie, opted-in with a `?internal=<token>` URL param. This lets all dashboards exclude the team. Genuinely good and rare to see this early.
- **Cross-subdomain cookie** — `cross_subdomain_cookie: true` + cookie domain `.mozart.build` means an anonymous visitor keeps the same `distinct_id` from `mozart.build` → `app.mozart.build`.

### 2.2 Initialization points

- **Landing**: `apps/landing/src/app/app.ts` → `afterNextRender(() => analytics.init())`.
- **Web**: `apps/web/src/app/app.ts` → `afterNextRender(() => analytics.init())`.
- Both register `POSTHOG_KEY` / `POSTHOG_HOST` providers in `app.config.ts` from their `environment.ts`.

### 2.3 Keys, hosts, and environment separation

| Surface / env | `posthogKey` | `posthogHost` | Sends events? |
|---|---|---|---|
| Landing dev (`environment.ts`) | `''` | `https://eu.i.posthog.com` | ❌ empty key → disabled |
| Landing prod (`environment.prod.ts`) | injected from `vars.POSTHOG_KEY` | injected from `vars.POSTHOG_HOST` | ✅ if vars set |
| Web dev (`environment.ts`) | `''` | `https://t.mozart.build` | ❌ empty key → disabled |
| Web prod (`environment.prod.ts`) | injected from `vars.POSTHOG_KEY` | injected from `vars.POSTHOG_HOST` | ✅ if vars set |

- Prod env files are **generated at build time** by `deploy-landing.yml` / `deploy-web.yml` from GitHub repo `vars`. They are not edited by hand (header comment says so).
- **One PostHog project across all surfaces** — landing and web are fed the *same* `POSTHOG_KEY`/`POSTHOG_HOST` vars. This is intentional (the cross-subdomain identity model requires it) and correct.
- **No dev/staging project.** Dev is "silenced" by an empty key, not routed to a separate project. There is **no staging environment** at all (`develop`/PR previews also get an empty key per `deploy-web.yml:105`). Validation therefore has nowhere to happen except production. See gaps §5.

---

## 3. Events actually implemented

Verified by grepping every `.capture(` / `.identify(` call site.

### Landing (`mozart.build`) — the only instrumented surface

| Event | Call site | Properties |
|---|---|---|
| `$pageview` | auto (`capture_pageview: 'history_change'`) | `$current_url`, `$referrer`, UTM (auto) |
| `download_cta_clicked` | `hero.component.ts:103`, `site-header.component.ts:175` | `source` (`hero`/`header`), `section`, `os`, `path` |
| `download_started` | `download-dialog.component.ts:261`, `download.page.ts:161` | `source`, `section`, `os`, `target`, `cta`, `dl_id` |

### Web (`app.mozart.build`)

- **Only `analytics.init()`**. Zero `capture()` calls. Zero `identify()` calls.
- Yet the pages that *should* be instrumented already exist: `login.page.ts`, `auth-callback.page.ts`, `dashboard.page.ts`, `account.page.ts`, and a full `auth.facade.ts` (Clerk-backed, has the authenticated `User`). The hooks are sitting there unused.

### Desktop (Tauri)

- **Nothing.** No `posthog-js` dependency, no analytics service, no `install_id`. Telemetry-spec Phase C never started.

---

## 4. Funnels you can build *today*

Exactly one, and it stops at the download click:

```
$pageview (/)  →  download_cta_clicked  →  download_started
```

Everything after the download button is unmeasured:
- Did the binary get installed and launched? **Unknown.**
- Did they authenticate? **Unknown.**
- Did they create a workspace / run an agent / open a PR? **Unknown.**
- Do they come back next week? **Only measurable as anonymous landing re-visits** — device-bound, no auth linkage, effectively useless for product retention.

---

## 5. Tracking gaps (ranked by impact)

### 🔴 G1 — `identify()` is dead code
`AnalyticsService.identify()` exists but **has zero callers**. The cross-subdomain cookie gives you
anonymous landing↔web continuity, but the anonymous→identified **merge never fires**. Consequences:
- You cannot tie a signup to the visitor who downloaded.
- You cannot measure activation or retention per *user* (only per anonymous device).
- Desktop (a different machine, no shared cookie) is **completely unlinkable** to the web/landing session.

This single gap blocks every funnel past "download" and every retention metric. **It is the
highest-leverage fix in the entire system.**

### 🔴 G2 — Web emits no events
No `signup_completed`, no `login_*`, no `$pageview`-driven funnel entry on the auth surface. The auth
facade already holds the Clerk `User` (and thus a stable `userId`) — the identify call and signup
event have an obvious home and are not wired.

### 🔴 G3 — Desktop has no analytics
The entire activation and value story (auth, onboarding, workspace, agent run, diff review, PR
creation) lives in desktop and is **100% dark**. No `install_id`, no `app_opened`, nothing.

### 🟠 G4 — Orphan `dl_id` property
`download_started` carries `dl_id: this.analytics.distinctId()`. It was designed (per telemetry spec)
to ride a Tally form → installer → first-run so a cross-machine download could be stitched to an
install. **Tally is gone** (see §6) and no installer carries `dl_id` forward, so the property
currently feeds nothing. It is collected but unused — either wire it through the installer/first-run
or drop it.

### 🟠 G5 — No staging / no validation environment
Events can only be verified in production (dev is silenced by empty key). There is no staging PostHog
project to validate schema changes before they hit real-user data. Schema mistakes are discovered
live.

### 🟡 G6 — Dev host inconsistency
The canonical host is **`https://t.mozart.build`** (reverse proxy to the EU PostHog project,
ad-blocker resilient) and is what web dev already uses. **Landing dev still defaults to
`https://eu.i.posthog.com`** — standardize it on `t.mozart.build` so all surfaces agree. Both are
inert in dev today (empty key), so this is cosmetic, but it's a latent trap if a dev key is ever set.

### 🟡 G8 — Dev mode relies only on an empty key to stay silent
Init is gated solely on `resolvePostHogKey()` returning non-empty. There is **no explicit dev-mode
guard** — a stray key in a local `environment.ts`/`.env` would send dev traffic straight into the
prod project. Add a dev/non-prod check to `init()` so PostHog never initializes in dev regardless of
key, with an explicit `POSTHOG_FORCE_ENABLE` override (pointed at staging only) for wiring checks.

### 🟡 G7 — `download_cta_clicked` vs `download_started` overlap + rename
`download_cta_clicked` fires when the dialog opens; `download_started` fires when the gated R2 URL is
returned. Both are legitimate but the difference (intent vs. actual binary fetch) is undocumented and
easy to double-count. **Decision: rename `download_started` → `downloaded`** (clearer "success
download" semantics) and treat it as the canonical download metric; `download_cta_clicked` stays as
the intent/dialog-open signal. See [`ANALYTICS_REFERENCE.md`](./ANALYTICS_REFERENCE.md) §2.1.

---

## 6. Spec drift — `docs/engineering/specs/telemetry.md` is partially stale

The telemetry spec is a solid design doc but no longer matches the code. Reconcile before using it:

| Spec says | Reality in code |
|---|---|
| `download_tally_redirected` event | Event is named **`download_started`** in code → **renamed to `downloaded`** in the target schema |
| Download → Tally beta-signup form → out-of-band binary | Tally is **removed**. `/api/download` returns a **real gated R2 binary URL** (`apps/landing/functions/api/download.ts`). The download is now real and immediate. |
| "Funnel will show a visible gap between Tally redirect and app open… that gap is real" | The Tally gap **no longer exists**. The real gap is now `download_started → app_opened` (install + launch), which is the normal, expected install gap — not a Tally artifact. |
| `dl_id` bridges Tally → installer | No Tally, no installer carrying it → `dl_id` is currently orphaned (G4). |
| Phase A "done", B/C "blocked on login page existing" | Web login surface **now exists** (`login.page.ts`, `auth-callback.page.ts`) — Phase B is **unblocked** and should be built. |

The good news in this drift: the product got *better* (real download instead of an opaque form), which
**removes** the spec's biggest known-limitation. The reference doc adopts `download_started` as
canonical and retires the Tally narrative.

---

## 7. Data quality summary

- **Naming**: existing events are `snake_case`, past/observable tense, consistent — good baseline to standardize on.
- **Internal traffic**: cleanly separable via `is_internal_device` — dashboards can and should filter it.
- **Double-count risk**: `download_cta_clicked` vs `download_started` (G7).
- **Dead property**: `dl_id` (G4).
- **No schema enforcement**: events are raw string literals at call sites; no shared constants/enum, so typos won't be caught. (Addressed in roadmap.)
- **No validation lane**: no staging project (G5).

---

## 8. What this unlocks once fixed

The foundation is good enough that closing G1–G3 (identify + web events + desktop events) is mostly
*wiring*, not rebuilding. Once done, all four target funnels in
[`ANALYTICS_REFERENCE.md`](./ANALYTICS_REFERENCE.md) become buildable, and the activation /
retention questions in the roadmap become answerable for the first time.
