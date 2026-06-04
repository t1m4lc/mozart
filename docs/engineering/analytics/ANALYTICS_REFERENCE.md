# Analytics Reference — Single Source of Truth

> **Status**: canonical — this file wins over any other analytics doc when they disagree.
> **Date**: 2026-06-04
> **Companion docs**: [`ANALYTICS_AUDIT.md`](./ANALYTICS_AUDIT.md) (current state) · [`ANALYTICS_ROADMAP.md`](./ANALYTICS_ROADMAP.md) (how to get there) · [`ANALYTICS_POSTHOG_FUNNELS.md`](./ANALYTICS_POSTHOG_FUNNELS.md) (build the funnels in PostHog)

This document defines **every approved event**, the **four official funnels**, and the **PMF
metric formulas**. If an event isn't here, it isn't approved. If a dashboard contradicts a formula
here, the dashboard is wrong.

---

## 1. Identity model — the spine

Everything below depends on one rule:

> **A user is a `distinct_id` that becomes a Clerk `userId` the moment they authenticate.**

| Transition | Mechanism | Status |
|---|---|---|
| Landing → Web (same browser) | `cross_subdomain_cookie: true`, cookie domain `.mozart.build` | ✅ already works |
| Anonymous → Identified (web) | `analytics.identify(userId)` on signup/login | ⚠️ **must be wired** |
| Web → Desktop (same person, maybe diff machine) | both call `identify(userId)` with the **same Clerk `userId`**; PostHog merges the anonymous `install_id` session into the identified user | ⚠️ **must be wired** |
| Desktop pre-auth | anonymous `install_id` (v4 UUID, stored in Rust config KV) as `distinct_id` | ⚠️ **must be built** |
| Logout (any surface) | `analytics.reset()` so the next person on a shared browser/install is a **new** anonymous id, not merged into the previous user | ⚠️ **must be wired** |

**Non-negotiable**: `userId` is always the **Clerk user id** on every surface. Never invent a
per-surface id. This is what lets one human be one row in every funnel and retention cohort.

**Wrapper contract (correctness, eng review 2026-06-04)**: `identify()` must be **init-safe** — if
called before PostHog finishes lazy-loading it queues and applies on init, exactly like `capture()`
(it did not, originally — silent no-op). `reset()` must exist and be called on every logout. Without
both, the merge silently drops and shared-machine logins corrupt per-user metrics.

### 1.1 Init & environment rules (non-negotiable)

- **Host**: PostHog is reached through the reverse proxy **`https://t.mozart.build`** on every
  surface (landing, web, desktop) — not `eu.i.posthog.com` directly. This is the canonical host
  (ad-blocker resilient, same EU project behind it).
- **Dev mode**: **never init PostHog and never send events in dev.** Guard init on a dev check (e.g.
  `import.meta.env.DEV` / non-prod build) in addition to the empty-key guard, so a stray key in a
  local env can't pollute the project. Local wiring checks use an explicit `POSTHOG_FORCE_ENABLE`
  override pointed at the staging project only.
- **Internal users**: every metric and funnel **filters out `is_internal_device=true`**. The
  mechanism already exists (super-property + person-property set at init, opt-in via `?internal=`
  token, resolved server-side). Keep it — it's how the team stays out of the numbers.

---

## 2. Approved event catalog

Conventions (enforced — see roadmap §naming):
- `snake_case`, format `object_action`, action in **past/observable tense** (`workspace_created`, not `create_workspace`).
- Reserved: PostHog `$`-prefixed events.
- **Every event carries these base properties** (registered as super-properties where possible):
  `surface` (`landing`\|`web`\|`desktop`), `app_version`, `is_internal_device` (already a super-prop).
- After `identify()`, PostHog attaches the person to every event via the `distinct_id` — so an explicit `userId` property is redundant and omitted on most events (kept only where it aids debugging, e.g. `desktop_authenticated`). Desktop pre-auth events ride the anonymous `install_id`.

### 2.1 `Acquisition`

| Event | Fires when | Key properties | Anchor (file) |
|---|---|---|---|
| `landing_viewed` | any landing `$pageview` (this is `$pageview` scoped to `surface=landing`) | `$current_url`, `$referrer`, `$referring_domain`, UTM, `section` | auto via `capture_pageview` |
| `download_cta_clicked` | download dialog opens (intent) | `source` (`hero`\|`header`), `section`, `os`, `path` | `hero.component.ts`, `site-header.component.ts` |
| `downloaded` | gated R2 URL returned, binary fetch begins — **success download, the canonical "download"** | `source`, `section`, `os`, `target`, `cta`, `dl_id`† | `download-dialog.component.ts:261`, `download.page.ts:161` |

† `dl_id` is **deprecated unless** the installer/first-run is wired to carry it (see audit G4). Until then, ignore it in analysis.

### 2.2 `Authentication`

| Event | Fires when | Key properties | Anchor |
|---|---|---|---|
| `signup_completed` | first successful auth for a brand-new Clerk user (web) → **call `identify(userId)` here** | `userId`, `provider` (`github`\|`google`), `surface=web` | `apps/web` `auth.facade.ts` / `auth-callback.page.ts` |
| `login_completed` | returning user authenticates (web) → **call `identify(userId)`** | `userId`, `provider` (`github`\|`google`) | same |
| `desktop_authenticated` | desktop deep-link OAuth success → **call `identify(userId)`** | `userId`, `install_id`, `provider`, `onboarding_required` | `auth.facade.ts:onDeepLink()` success path (~line 228) |

> **Signup and login are separate events** (confirmed decision). Distinguish by whether the Clerk
> user was created in this flow (new → `signup_completed`) or already existed (returning →
> `login_completed`). Both carry `provider` so we can see the GitHub-vs-Google split at acquisition.
> The `provider` claim is available from Clerk on the auth result.

### 2.3 `Onboarding` & `Activation`

| Event | Fires when | Key properties | Anchor |
|---|---|---|---|
| `onboarding_completed` | onboarding wizard finished | `userId`, `github_connected: boolean` | `onboarding.facade.ts:complete()` |
| `project_added` | a project is registered | `is_first: boolean`, `source` (`add`\|`open`) | `project.facade.ts` `add()` + `bootstrap()` |
| `workspace_created` | a workspace is created **by the user** | `is_first: boolean`, `is_get_started: boolean` | `workspace.facade.ts:createForPrompt()` |
| `agent_completed` | an agent run finishes — **the "Aha!" moment** | `workspace_id`, `provider` (`claude`\|`codex`\|…), `success: boolean` | `chat.facade.ts` terminal handler — `success = status === 'done'` |

> **Deliberately lean** (decision 2026-06-04). One boolean — `success` — is the activation signal:
> the run reached `done`. No 3-way outcome, no `produced_changes` turn-state scan, no duration. A
> started-but-never-completed run isn't tracked either (no separate `agent_started`).
>
> **`is_get_started` matters.** Onboarding **pre-creates** a bundled "Get started" project + welcome
> workspace (`onboarding.facade.ts:complete()`). These auto-created entities must be flagged so
> activation metrics can **exclude** them — otherwise every user looks "activated" the instant they
> finish onboarding, which is false.

### 2.4 `Product Usage` / Value

| Event | Fires when | Key properties | Anchor |
|---|---|---|---|
| `pr_created` | a pull request is successfully opened — **the end of the value loop for the user today** | `workspace_id`, `draft: boolean` | `workspace.facade.ts:createPr()` success |

`pr_created` is the deepest success outcome we ship right now: the user took an agent's work all the
way to a real PR. It is both the terminal step of Funnel 4 and a key value/retention signal.

### 2.5 `Configuration`

| Event | Fires when | Key properties | Anchor |
|---|---|---|---|
| `provider_connected` | an agent/credential provider connects successfully | `provider` (`claude`\|`codex`\|`github`) | `profile.facade.ts` `connectWithKey` / `connectCodexWithKey` / `connectGithub`(`ViaClerk`) |

> **Why keep it (it's borderline):** not for a funnel, but as the **only** way to answer *which agent
> providers do users actually use, and do they use more than one?* Just `provider` is enough —
> multi-provider adoption is `users with ≥2 distinct provider values` in PostHog (no `connected_count`
> property needed). A real question now that Codex landed alongside Claude. If after a few weeks
> everyone uses one provider and never switches, drop this event. Lean and provisional.

### 2.6 Explicitly **not** events (kept lean)

- `agent_started` — **cut.** At beta scale a started run with no completion is low-signal, and `agent_completed { outcome }` already covers failures/stops. Re-add only if start→complete drop-off becomes a question.
- `diff_reviewed` — **cut for now.** A user can be activated without opening the diff viewer; `pr_created` is the value signal we care about today. Revisit if review depth becomes a focus.
- Doc/blog reads → use `$pageview` filtered on `/docs/*`, `/blog/*`. No `doc_viewed`.
- Dialog-open micro-states beyond `download_cta_clicked`.
- `app_opened` per launch is **operational, not product value** — track it for install confirmation only, never as an "active user" signal (opening ≠ using). See §4.

---

## 3. The four official funnels

All four require the identity spine (§1) to be wired. Funnels 2–4 are cross-surface and **break
without `identify()`**.

### Funnel 1 — Acquisition (landing only, works today)
```
landing_viewed  →  download_cta_clicked  →  downloaded
```
Measures: intent → action on the landing page. Slice by `source`, `section`, `os`, UTM, `$referrer`.

### Funnel 2 — Installation (friction)
```
downloaded  →  desktop_authenticated  →  onboarding_completed
```
Measures: install + first-auth friction. The `downloaded → desktop_authenticated` step is the
real-world install+launch+sign-in gap. Cross-surface; needs identity stitching to connect a landing
download to a desktop auth (best-effort via `dl_id` if wired, otherwise measured at the cohort level).

### Funnel 3 — Activation (time-to-value)
```
desktop_authenticated  →  workspace_created  →  agent_completed
```
Measures: from "I'm in" to "the product did the thing". **Exclude `is_get_started=true`** at the
`workspace_created` / `agent_completed` steps. Report median time
`desktop_authenticated → first agent_completed` as **Time-To-Value (TTV)**.

### Funnel 4 — Product Value (success outcome)
```
project_added  →  workspace_created  →  agent_completed  →  pr_created
```
Measures: real work landing as a PR. This is the proof the product delivered an outcome a user keeps,
and `pr_created` is the end of the value loop we ship today.

---

## 4. PMF metrics — formulas (non-vanity)

All metrics **exclude `is_internal_device=true`** and are computed on **identified users** unless
stated. "Active event" is defined once, here, and reused everywhere:

> **Active event** = a **successful** `agent_completed` (`success = true`) **or** `pr_created`.
> (Deliberately **not** `app_opened` — opening the app is not using it. `agent_started` and
> `diff_reviewed` were cut, so the active set is just the two events that represent realized work.)

### 4.1 Acquisition

| Metric | Formula |
|---|---|
| **Unique Visitors** | unique `distinct_id` with ≥1 `landing_viewed` in period |
| **Download Clicks** | count of `downloaded` (canonical success download). `download_cta_clicked` = intent, reported separately as dialog-open rate |
| **Download Rate** | `unique users with downloaded` / `Unique Visitors` |
| **Signup Rate** | `unique users with signup_completed` / `Unique Visitors` |

### 4.2 Activation — the "Aha!" moment

**Aha! = the first **successful** `agent_completed` (`success=true`) in a user-created workspace (`is_get_started=false`).**

Why `agent_completed` and not the alternatives:

| Candidate | Verdict |
|---|---|
| Login | ❌ access, not value. Too early. |
| `workspace_created` | ❌ setup step. Also auto-created during onboarding → contaminated. |
| `agent_started` (cut) | ❌ *intent* to get value, not value realized — and not tracked as its own event. |
| **`agent_completed` (success)** | ✅ **the first moment Mozart's core promise — an agent does the work — is fulfilled.** First real payoff. `success=true` keeps out runs that errored out. |
| `diff_reviewed` (cut) | ◼ would be a secondary engagement signal, but a user can be activated without opening the diff viewer — not tracked for now. |
| `pr_created` | ❌ too deep for *activation*: gated on GitHub connection + review + confidence. It's the **value** milestone (Funnel 4); using it as activation understates the rate and inflates TTV. |

| Metric | Formula |
|---|---|
| **Activation Rate** | `users with ≥1 successful agent_completed (success=true, is_get_started=false)` / `users with signup_completed`, measured within a **7-day window** of signup |
| **Time-To-Value (TTV)** | median( `first successful agent_completed` − `desktop_authenticated` ), excluding get-started |
| **Setup completion** | `onboarding_completed` / `desktop_authenticated` |

### 4.3 Usage & Retention

| Metric | Formula |
|---|---|
| **WAU** | unique identified users with ≥1 **active event** in trailing 7 days |
| **MAU** | unique identified users with ≥1 **active event** in trailing 30 days |
| **Stickiness** | DAU / WAU (DAU = active event, trailing 1 day) |
| **Returning Users** | users active in period *N* who were also active in period *N−1* |
| **D1 / D7 / D30 Retention** | PostHog Retention: **cohort entry = first successful `agent_completed`** (the activation event), **returning event = any active event** on day 1 / 7 / 30. Anchoring on activation (not signup) measures whether *activated* users form a habit — the truest PMF signal. |

> **Anchor choice rationale**: retention anchored on *signup* mixes in users who never activated and
> drags the curve down with noise. Anchored on *activation* (`agent_completed`), the D7/D30 curve
> answers the real PMF question: *once someone has felt the value, do they come back?*

### 4.4 Value (north-star candidates)

| Metric | Formula |
|---|---|
| **PR Conversion** | `users with ≥1 pr_created` / `activated users` |
| **Runs per active week** | successful `agent_completed` count / WAU — depth of usage |
| **North-Star (proposed)** | **Weekly Active Users with ≥1 successful agent run** (`agent_completed`, `success=true`) — couples breadth (WAU) with the core value event. |

---

## 5. Change control

- **Code source of truth**: `libs/shared-util-analytics/src/lib/events.ts` (`ANALYTICS_EVENTS`). `capture()`/`track()` are typed to `AnalyticsEventName`, so an event not in that map won't compile — the catalog above and that file must stay in sync.
- New events or property changes: edit `events.ts` **and** this file in the same PR, then the call site, then the PostHog funnel.
- Removing an event requires checking it isn't referenced by a saved PostHog insight/funnel.
- Keep it lean: the bar for a new event is *"a funnel or PMF metric here needs it"*. Curiosity is not a reason.
