# TODOS

Deferred work captured during reviews. Each entry: what / why / how to apply / depends on. Delete an entry when it's done or stops being valuable.

---

## Landing — replace Coming-soon install instructions

**What:** `apps/landing/src/content/docs/getting-started.md` ships with `### Install` marked "Coming soon — public download not yet available." Replace with real one-liner install instructions once the desktop binary distribution pipeline exists.

**Why:** Marketing site is the discovery surface. A reader who lands on `/docs/getting-started` and can't actually install Mozart bounces.

**How to apply:** When the desktop release pipeline ships (GitHub Releases or similar), edit `apps/landing/src/content/docs/getting-started.md` `### Install` section. Replace "Coming soon" with the actual install command(s). Consider also updating the homepage CTA copy if "Read the docs" becomes "Download Mozart".

**Depends on:** Desktop binary distribution pipeline (not in this repo today). Not blocking for landing v0.0.1 launch.

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

**What:** Plan §6 lists "payments, accounts, dashboards" as out of scope. Codex's outside-voice review flagged that the v0.0.1 landing has zero conversion CTAs — no waitlist, no contact form, no download CTA (the binary doesn't exist), no email capture. Strategically thin for a marketing site.

**Why:** A marketing site without a conversion path is a brochure. If Mozart's pre-launch goal includes building an interested-user list, a waitlist or "notify me when downloads open" CTA is the cheapest way to capture intent.

**How to apply:** Run `/plan-ceo-review` on the question "Should v0.0.1 landing include a conversion CTA (waitlist / contact / pre-signup)?" before the public launch decision. Eng work is small (form → email service like Loops/ConvertKit, or a Cloudflare Worker → KV store) IF the product decision says yes. **Do not build first; decide first.**

**Depends on:** Product/strategy decision. Not an eng decision.

---

## libs/mozart-ui — rename `hlm-*` selectors to `mz-*`

**What:** Components moved into `libs/mozart-ui` (composer, highlight-overlay, timeline) inherit Spartan's `hlm-` Angular selector prefix and `prefix: "hlm"` in their `project.json`. Rename selectors to `mz-*` (e.g. `<hlm-composer>` → `<mz-composer>`) and update `prefix: "mz"`.

**Why:** `hlm` is Spartan NG's brand prefix. Once a component is Mozart-owned, the `hlm-` selector in templates lies about ownership and makes future cleanup harder. The composer lib also has pre-existing inconsistency (`hlm-composer` next to `composer-scroll-overlay`).

**How to apply:** After the mozart-ui refactor (PR 1) is merged and soaked. Sequence: update `prefix` in each moved `project.json`, rename `selector` in every component decorator under `libs/mozart-ui/*/src/lib/`, sweep all template usages across `apps/desktop` (~71 files), `apps/landing`, `apps/web`, run `nx affected -t lint build`, manual smoke composer/timeline/onboarding tour.

**Depends on:** PR 1 (libs/mozart-ui extraction) merged.

---

## apps/sandbox — extract dev-only sandbox into a dedicated Nx app

**What:** Today the sandbox lives at `apps/desktop/src/app/pages/sandbox/` (3 routes: `/sandbox`, `/sandbox/composer`, `/sandbox/timeline`). After PR 1 these routes are wrapped in `isDevMode()` and dropped from prod chunks. The follow-up is to extract them into a dedicated `apps/sandbox` Nx app with its own routes and Tauri/web build target.

**Why:** Physical separation removes any risk of sandbox code leaking into production. Gives a place to grow component dogfooding (Storybook-style) without contaminating the product app's bundle or route surface.

**How to apply:** `nx g @nx/angular:app sandbox`. Move the 3 files in. Decide deployment target (web-only via `apps/web`-style config, or Tauri). Update CLAUDE.md to point readers at it for component dogfooding. Remove the env-guarded routes from `apps/desktop/src/app/app.routes.ts`.

**Depends on:** PR 1 (libs/mozart-ui extraction) merged, since composer/timeline live there.

---
