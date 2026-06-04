# How to Build Mozart's Funnels in PostHog

> **Audience**: whoever sets up the PostHog insights/dashboards.
> **Date**: 2026-06-04
> **Source of truth for events/metrics**: [`ANALYTICS_REFERENCE.md`](./ANALYTICS_REFERENCE.md). This doc is the
> *click-by-click* for turning that schema into PostHog insights. If an event name here disagrees
> with the reference, the reference wins.

This is a practical guide. It assumes the events in the reference catalog are flowing (they are not
all wired yet — see [`ANALYTICS_ROADMAP.md`](./ANALYTICS_ROADMAP.md) for status). You can build the
funnels now against staging; steps past `download_cta_clicked` stay empty until the matching events
ship.

---

## 0. One-time setup (do this before building any funnel)

### 0.1 Pick the project
Use the **staging** project for validating a new insight, the **prod** project (EU, behind
`t.mozart.build`) for the real dashboards. Same event schema in both.

### 0.2 The internal-user filter — apply it to EVERY insight
Mozart tags team devices with `is_internal_device = true` (super-property, set at init). Every funnel,
trend, and retention insight must exclude them or your numbers are polluted by your own clicks.

> In any insight: **Add filter → `is_internal_device` → `is not` → `true`** (this also keeps people
> who never had the property set, i.e. real users for whom it's `null`/`false`).

Save it once as a **saved filter / cohort** named `Real users (exclude internal)` and reuse it. Better:
make a **static/dynamic cohort** `External users` = `is_internal_device is not true` and drop that
cohort into the "Filter by" slot on every insight.

### 0.3 Know your identity model (why steps "skip" people)
Funnels count **persons**, not events. A person is anonymous (`distinct_id`) until they authenticate,
then they become a Clerk `userId` (see reference §1). Consequences you will see in the UI:

- **Landing → Web** steps stitch automatically (shared `.mozart.build` cookie).
- **Anything → Desktop** only stitches **after** `identify()` fires on desktop auth. A landing
  download on a laptop and an install on a desktop are two anonymous persons until login merges them.
- So **Funnel 2 (Installation)** is best read as a **cohort/cross-section** ("of people who downloaded
  this week, how many authed"), not a strict same-person funnel — there's no client-side cross-machine
  bridge (the old `dl_id` was removed). PostHog will still draw it; just interpret the
  `downloaded → desktop_authenticated` step as approximate at the person level.

### 0.4 Funnel settings that matter
- **Conversion window**: the max time allowed between first and last step. Default 14 days. Set it per
  funnel (below) — too short undercounts, too long counts unrelated sessions.
- **Order**: use **"Sequential"** (steps must happen in order) for the value funnels. **"Any order"**
  is rarely what you want here.
- **Step counting**: "Unique users" (default) — one person counted once per step.
- **Exclusion steps**: optional, ignore for v1.

---

## 1. Funnel 1 — Acquisition (works today)

**Question**: of people who land, how many click download and actually download?

```
landing_viewed  →  download_cta_clicked  →  downloaded
```

**Build it:**
1. New insight → **Funnel**.
2. Step 1: `landing_viewed` (this is `$pageview` on the landing surface — if you don't have a
   dedicated `landing_viewed` event, use `$pageview` with a property filter `surface = landing`, or
   filter `$current_url` contains `mozart.build`).
3. Step 2: `download_cta_clicked`.
4. Step 3: `downloaded`.
5. Filter by cohort **External users** (0.2).
6. **Conversion window: 1 hour** (download intent is same-session).
7. **Breakdown** (the payoff): break down by `source` (`hero` / `header`), `os`, or `$referring_domain`
   to see which traffic and which button convert. Add UTM breakdowns for campaign analysis.

**Read it**: the `download_cta_clicked → downloaded` drop is your dialog-to-binary friction. A big
gap there means the access-code gate or platform picker is losing people.

---

## 2. Funnel 2 — Installation friction (cross-surface)

**Question**: of people who downloaded, how many launch, authenticate, and finish onboarding?

```
downloaded  →  desktop_authenticated  →  onboarding_completed
```

**Build it:**
1. New **Funnel**. Steps: `downloaded`, `desktop_authenticated`, `onboarding_completed`.
2. Cohort **External users**.
3. **Conversion window: 7 days** (people download, then install/sign in later).
4. Read the note in 0.3 — the first step is cross-machine, so treat it as approximate (no client-side
   bridge). Within desktop (`desktop_authenticated → onboarding_completed`) the same-person link is
   exact.

**Read it**: a large `downloaded → desktop_authenticated` gap is the real install + first-launch +
sign-in friction (the expected gap, not a bug). A gap at `desktop_authenticated → onboarding_completed`
means people bounce off the wizard — that's fixable UX.

---

## 3. Funnel 3 — Activation / time-to-value

**Question**: once someone is in, how many reach the "Aha" (an agent does the work), and how long does
it take?

```
desktop_authenticated  →  workspace_created  →  agent_completed
```

**Build it:**
1. New **Funnel**. Steps: `desktop_authenticated`, `workspace_created`, `agent_completed`.
2. Cohort **External users**.
3. **Exclude the bundled get-started workspace** — this is critical or activation is fake. On both
   `workspace_created` and `agent_completed`, add a step filter **`is_get_started` `is not` `true`**.
   (Onboarding pre-creates a "Get started" workspace; counting it makes everyone look activated the
   instant they finish onboarding.) On `agent_completed`, also filter **`success` `=` `true`** so a
   failed run doesn't count as activation.
4. **Conversion window: 7 days** (activation should happen in the first week).
5. **Time-to-value**: switch the funnel's right-hand metric to **"Time to convert"** (PostHog shows
   median + distribution between steps). The `desktop_authenticated → agent_completed` median is your
   **TTV**. You can also read it as a histogram to spot a long tail.

**Read it**: `workspace_created → agent_completed` is the core product moment. If people create a
workspace but never complete an agent run, the agent/run experience is where activation dies.

---

## 4. Funnel 4 — Product value (success outcome)

**Question**: of people who set up a project and run an agent, how many take it all the way to a PR?

```
project_added  →  workspace_created  →  agent_completed  →  pr_created
```

**Build it:**
1. New **Funnel**. Steps: `project_added`, `workspace_created`, `agent_completed`, `pr_created`.
2. Cohort **External users**; exclude `is_get_started = true` on the middle steps (as in Funnel 3).
3. **Conversion window: 14 days** (PR may come a few sessions later).
4. **Breakdown** by `provider` (`claude` / `codex`) on `agent_completed`/`pr_created` to compare
   which agent backend actually ships PRs.

**Read it**: `agent_completed → pr_created` is the value-realization step — the proof a user kept the
output. This is the end of the value loop we ship today.

---

## 5. Retention insight (D1 / D7 / D30) — anchored on activation

**Question**: once someone has felt the value, do they come back?

This is **not** a funnel — it's a **Retention** insight.

**Build it:**
1. New insight → **Retention**.
2. **Cohortize on ("Performed event")**: `agent_completed` filtered `success = true` — *first time*. (Anchor on activation, not
   signup; reference §4.3 explains why.)
3. **Returning event ("Performed event")**: set to **any active event** — in PostHog, add `agent_completed`
   **or** `pr_created`. If the UI only allows one returning event, create a **"Active" action** (PostHog
   Action = `agent_completed` OR `pr_created`) and use that.
4. Cohort filter **External users**.
5. **Retention type**: "Recurring". Period: **Day** for D1/D7/D30 (read columns 1, 7, 30) or **Week**
   for a cleaner weekly view.

**Read it**: row = the week a user first activated; columns = how many came back N days later. A curve
that flattens above zero is the PMF signal. A curve that decays to ~0 by D7 means people get one
result and leave.

---

## 6. WAU / MAU and the North-Star (Trends)

**WAU / MAU** — Trends insight:
1. New insight → **Trends**.
2. Series: the **"Active" action** (successful `agent_completed` OR `pr_created`), metric **"Unique users"**.
   Build the Action as `agent_completed` filtered on `success = true`, OR `pr_created`.
3. Cohort **External users**.
4. **Rolling window**: set the chart to a 7-day rolling unique count for WAU, 30-day for MAU (PostHog:
   "Unique users" + the rolling/`WAU`/`MAU` aggregation option).

**North-Star** — *Weekly active users with ≥1 successful agent run*:
1. Trends → series `agent_completed`, metric **Unique users**, **weekly**.
2. Add property filter **`success` `=` `true`** and **`is_get_started` `is not` `true`**.
3. Cohort **External users**.

> `success` is the single activation signal on `agent_completed` (a finished run that reached `done`).
> Kept deliberately lean — no `produced_changes`/diff inspection (reference §2.3, roadmap 1.8).

---

## 7. Put it on a dashboard

Create one dashboard **"Mozart PMF — beta"** and pin: the four funnels, the activation retention curve,
WAU/MAU, and the North-Star trend. Set the dashboard date range to **Last 28 days** and the global
filter to the **External users** cohort so every tile inherits it.

---

## 8. Gotchas checklist

- [ ] Every insight filters out `is_internal_device = true` (use the External users cohort).
- [ ] Activation/value funnels exclude `is_get_started = true` on workspace/agent steps.
- [ ] Conversion windows set intentionally (1h acquisition, 7d install/activation, 14d value).
- [ ] Retention is anchored on **first successful `agent_completed`** (`success=true`), not signup.
- [ ] "Active" = successful `agent_completed` OR `pr_created` (build it as a PostHog Action and reuse).
- [ ] Cross-machine funnel steps (`downloaded → desktop_authenticated`) read as approximate (no
      client-side bridge) — don't treat that drop as exact same-person conversion.
- [ ] Validate new insights in **staging** before pinning to the prod dashboard.
