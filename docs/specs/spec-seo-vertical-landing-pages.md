# Spec: SEO Vertical Landing Pages (`/for/*`) + Waitlist

Status: v1 implemented (verticals only). Use-case pages and concept hubs deferred to phase 2.

## Goal

Test demand from non-developer, job-based audiences (Sales, Marketing, Recruiting, Product, Operations) and capture leads via a waitlist — purely by **adding** pages to `apps/landing`. The existing developer-facing landing (hero, home sections, routes, positioning) stays untouched.

## Architecture

### Routes (prerendered, in sitemap)

- `/for/sales`, `/for/marketing`, `/for/recruiting`, `/for/product`, `/for/operations`
- Registered in `apps/landing/vite.config.ts` (`prerender.routes`) and enforced by `apps/landing/scripts/check-seo.mjs` (`REQUIRED_SITEMAP_ROUTES`). Both lists must be updated for any new route.

### Page composition

- Thin route files: `apps/landing/src/app/pages/for/<slug>.page.ts` — SEO meta via `injectSeo()`, JSON-LD (`SoftwareApplication` + `FAQPage`) via `injectJsonLd()`.
- Shared template: `apps/landing/src/app/pages/for/_shared/` — `vertical-page.component.ts` composes hero → pains → workflows → roadmap → positioning → faq → waitlist → other-verticals.
- **All per-vertical copy lives in data files** (`_shared/data/*.data.ts`, typed by `_shared/vertical-config.ts`). This keeps the 5 pages genuinely differentiated (doorway-page mitigation) and makes a future locale just another data file.

### Honesty guardrails (structural)

- `FeatureStatus = 'today' | 'vision'` per workflow; `'today'` only for things the current developer preview does (agent works on local files, user reviews diffs). Anything touching external systems is `'vision'`.
- `vision-badge.component.ts` renders "In developer preview" / "Vision" unconditionally.
- Roadmap section renders "Planned" suffixes and a fixed disclaimer; data cannot present future features as shipped.
- Hero carries the disclosure: "Mozart is available today as a developer preview. The {audience} experience is what we're building next."
- Copy rules: present tense only for shipped capabilities (local workspaces, agent runs, diff review, Claude Code + Codex). Future concepts (skills, templates, Gmail/CRM/CMS/ATS integrations, marketplace, more providers) always "planned" / "on our roadmap" / conditional. Never "works with any LLM". No invented testimonials/logos for these personas.

### Navigation (additive)

- Header: "Solutions" dropdown (Spartan `@spartan-ui/navigation-menu`) in `shell/site-header.component.ts`, plus a grouped section in the mobile menu. Links data in `shell/nav-model.ts` (`SOLUTIONS_NAV`).
- Footer: "Solutions" column in `FOOTER_NAV`; grid widened to `lg:grid-cols-5` in `shell/site-footer.component.ts`. Footer links are the SEO-load-bearing internal links (dropdown content is templated, not in static HTML).
- Each vertical page cross-links its 4 siblings + `/docs/concepts/local-first`.

## Waitlist

### `POST /api/waitlist` (`apps/landing/functions/api/waitlist.ts`)

Request: `{ email, vertical, source?, hp?, formAge? }`

- Honeypot `hp` non-empty or `formAge < 1200ms` → silent fake `200 {ok:true}` (no write, no bot signal).
- Missing user-agent or non-JSON content-type → silent fake `200` (scripted traffic).
- Per-IP rate limit via `cf-connecting-ip`: 10 writes/hour, KV keys `rl:<ip>` with TTL → silent fake `200` when exceeded. Escalation if spam persists: Cloudflare Turnstile (needs site key + secret provisioning).
- Invalid email → `400 invalid_email`; unknown vertical → `400 invalid_vertical`.
- `WAITLIST` KV binding missing → `503 waitlist_unavailable` (graceful on previews).
- KV key `waitlist:<email>`, value `{ email, verticals[], source, firstTs, lastTs }`. Duplicate email → merge vertical into `verticals[]`, return `200 {ok:true, already:true}` (idempotent).
- New signups (not duplicates) ping a private Discord channel via `DISCORD_WAITLIST_WEBHOOK_URL` (email + vertical + source). Best-effort `await` in try/catch — never blocks or fails the signup; unset secret (e.g. previews) no-ops. Separate webhook from the release one.

### Provisioning (one-time, manual)

1. `npx wrangler@4 kv namespace create mozart-landing-waitlist`
2. CF dashboard → Pages `mozart-landing` → Settings → Functions → KV namespace bindings → bind `WAITLIST` for **Production and Preview**. (Direct Upload deploys don't carry bindings; dashboard bindings persist.)
3. Export: `npx wrangler@4 kv key list --namespace-id=<id> --prefix=waitlist:`

GitHub secret `DISCORD_WAITLIST_WEBHOOK_URL` (single source of truth) is pushed to CF Pages by the deploy workflow's `wrangler pages secret bulk` step, alongside the other runtime secrets. Leave it unset to disable Discord notifications.

### Local dev

`vite dev` has no Pages runtime, so `devWaitlistApi()` in `vite.config.ts` (registered before `analog()`) mirrors the function's contract in-memory. The real function is exercised via `wrangler pages dev` (see Validation).

### Client (`_shared/vertical-waitlist.component.ts`)

Signals state machine (pending/error/done/already), inline validation, off-screen honeypot, `formAge` from construction time. PostHog events (`waitlist_submitted` / `waitlist_succeeded` / `waitlist_failed` in `@mozart/shared-util-analytics`) — **email is never sent to analytics**.

## SEO strategy

- Per-page title/description/canonical baked into prerendered HTML via `injectSeo()`.
- Keyword targets are low-competition long-tails stored in each data file's `keywords[]` (drives copywriting; not rendered — meta keywords is dead).
- ~900 words per page, ≥600 unique; only the positioning section (~120 words) is shared. Review the 5 data files side-by-side before adding more verticals — copy convergence is the doorway-page risk.
- Default OG image for v1 (`SeoMeta.image` supports per-page images later).

## i18n (future, NOT implemented)

When a second locale ships:

- Path-prefix locales; English stays at root (no `/en/` migration). `x-default` → root EN.
- Localized slugs for marketing pages (`/fr/pour/commerciaux`) via explicit per-locale Analog route files importing per-locale data files.
- Extend `injectSeo()` with `alternates: {locale, href}[]` emitting hreflang pairs. Canonical stays self-referential per locale; never canonicalize translations to EN; hreflang only between true translations.
- Sitemap: extend `post-build-seo.mjs` with `xhtml:link` alternates.
- **No automatic language redirects** (they cloak content from crawlers). Dismissible language banner from `navigator.language` + visible switcher instead.

v1 is already i18n-ready: copy in data files, absolute self-canonicals, explicit route lists.

## Phase 2 (deferred)

- `/use-cases/<slug>` pages (one workflow, step-by-step, `HowTo` JSON-LD), linking up to their parent `/for/*` hub. Prioritize by waitlist/search demand per vertical.
- Concept hubs `/ai-agents`, `/local-first-ai-workspace` (pillar pages, `Article` JSON-LD), added to `generate-llms.mjs`.
- Per-vertical OG images; Cloudflare Turnstile on `/api/waitlist` if spam appears.

## Validation

```bash
pnpm nx run landing:seo-check        # build → post-build-seo → generate-llms → check-seo

# Per-page meta baked into static HTML (repeat per slug)
grep -E '<title>|og:title|rel="canonical"|ld\+json' dist/apps/landing/analog/public/for/sales/index.html
grep -c '<loc>https://mozart.build/for/' dist/apps/landing/analog/public/sitemap.xml  # = 5

pnpm nx run landing:serve            # manual: dropdown (desktop+mobile), footer, dark mode, waitlist states

# Waitlist E2E with local KV
npx wrangler@4 pages dev dist/apps/landing/analog/public --kv WAITLIST
curl -s -X POST localhost:8788/api/waitlist -H 'content-type: application/json' \
  -d '{"email":"a@b.co","vertical":"sales","source":"for_sales","formAge":5000}'
```

Post-deploy: view-source meta on `/for/sales`, real submit + `wrangler kv key list`, PostHog events arriving, request indexing in Search Console.
