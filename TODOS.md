# TODOS

Deferred work captured during reviews. Each entry: what / why / how to apply / depends on. Delete an entry when it's done or stops being valuable.

---

## Landing — replace Coming-soon install instructions

**What:** `apps/landing/src/content/docs/getting-started.md` ships with `### Install` marked "Coming soon — public download not yet available." Replace with real one-liner install instructions once the desktop binary distribution pipeline exists.

**Why:** Marketing site is the discovery surface. A reader who lands on `/docs/getting-started` and can't actually install Mozart bounces.

**How to apply:** When the desktop release pipeline ships (GitHub Releases or similar), edit `apps/landing/src/content/docs/getting-started.md` `### Install` section. Replace "Coming soon" with the actual install command(s). Consider also updating the homepage CTA copy if "Read the docs" becomes "Download Mozart".

**Depends on:** Desktop binary distribution pipeline (not in this repo today). Not blocking for landing v0.1.0-beta.1 launch.

---

## Landing — replace placeholder legal copy (LAUNCH GATE)

**What:** `/privacy` and `/terms` ship with placeholder banner + `<meta robots noindex,nofollow>`. Production launch must replace with real legal copy from counsel.

**Why:** "Placeholder — not final legal text" is fine for preview but cannot ship publicly. Once real copy lands:
1. Remove the placeholder banner.
2. Remove the `noindex,nofollow` meta tag.
3. Add `/privacy` and `/terms` to `sitemap.xml` (currently excluded by Phase 12).

**How to apply:** Counsel drafts real privacy/terms. Apply text to `apps/landing/src/app/pages/privacy.page.ts` and `terms.page.ts`. Remove the three placeholder-gating things above. Update "Last updated" date.

**Depends on:** Counsel review. **Blocks production launch to mozart.build.**

---

## Landing — consider a conversion path before public launch

**What:** Plan §6 lists "payments, accounts, dashboards" as out of scope. Codex's outside-voice review flagged that the v0.1.0-beta.1 landing has zero conversion CTAs — no waitlist, no contact form, no download CTA (the binary doesn't exist), no email capture. Strategically thin for a marketing site.

**Why:** A marketing site without a conversion path is a brochure. If Mozart's pre-launch goal includes building an interested-user list, a waitlist or "notify me when downloads open" CTA is the cheapest way to capture intent.

**How to apply:** Run `/plan-ceo-review` on the question "Should v0.1.0-beta.1 landing include a conversion CTA (waitlist / contact / pre-signup)?" before the public launch decision. Eng work is small (form → email service like Loops/ConvertKit, or a Cloudflare Worker → KV store) IF the product decision says yes. **Do not build first; decide first.**

**Depends on:** Product/strategy decision. Not an eng decision.

---

## apps/sandbox — finish migrating timeline.sandbox (blocked on llm-model lib)

**What:** `apps/sandbox` now hosts the composer + index pages. `timeline.sandbox.ts` still lives in `apps/desktop/src/app/pages/sandbox/` because it depends on the `llm-model` domain (3 JSON fixtures + `applyAgentEvent` reducer + `AgentEvent` type), and apps can't import from apps under the module-boundary rule.

**Why:** One sandbox host is cleaner than two. Today `pnpm nx serve sandbox` shows composer-only; you have to `pnpm nx serve desktop` and navigate to `/sandbox/timeline` to dogfood the agent timeline.

**How to apply:** Promote the relevant slice of `apps/desktop/src/app/domains/llm-model/data/stream/` (event.types, reducer, fixtures) into a new lib — e.g. `libs/llm-model-stream` tagged `scope:shared` (pure functions + types, no UI). Then move `timeline.sandbox.ts` into `apps/sandbox/src/app/`, add it to `apps/sandbox/src/app/app.routes.ts`, delete `apps/desktop/src/app/pages/sandbox/`, delete `apps/desktop/src/app/sandbox.routes.{ts,prod.ts}`, and drop the `fileReplacements` entry for sandbox from `apps/desktop/project.json`.

**Depends on:** llm-model stream slice extracted to a lib. Real domain work — likely a half-day on its own.

---
