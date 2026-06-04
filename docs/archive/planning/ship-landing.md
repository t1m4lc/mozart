# Plan — Ship `apps/landing` to Cloudflare on `mozart.build`

**Status**: draft (Phase B output, awaiting Ultraplan review then `approve plan`)
**Scope**: first production deploy of `apps/landing` only. No changes to `apps/web`, no R2, no CrabNebula, no analytics, no real download binaries, no privacy/ToS rewrite.
**Parent prompt**: `docs/prompts/phase-9-prompt.md` (Sub-phase 9.1, Block A + B + F-as-placeholder). This plan ships **Block A** (DNS) and **Block B** (landing). Blocks C/D/E/F-full land in later sub-phases.

---

## 1. Decisions

### 1.1 Hosting target — **Cloudflare Pages**
Use **Cloudflare Pages**, not Workers Static Assets.
- Pages has first-class custom-domain + `_headers` / `_redirects` semantics.
- Direct Upload via Wrangler from GHA is a single, mature path.
- Workers Static Assets is newer and adds runtime config we do not need for a pure SSG site.
- Migration path to Workers Static Assets later is non-blocking (same artifact).

### 1.2 Where the build runs — **GitHub Actions, then Direct Upload**
GHA builds the static artifact; `wrangler pages deploy` uploads it.
- Reusable artifact: same build can be promoted to preview → prod.
- Deterministic Node + pnpm version, Nx remote cache friendly.
- Cloudflare's builder re-installs node_modules per deploy and lacks pnpm + Nx primitives. Slower and less reproducible.
- Cloudflare Pages "build configuration" is left **blank** (Direct Upload mode).

### 1.3 Build command + output directory
- Command: `pnpm nx run landing:post-build-seo` (depends on `build`, then scrubs sitemap + injects `noindex` on `/privacy` and `/terms`).
- Static output to deploy: **`dist/apps/landing/analog/public`** (the AnalogJS SSG prerender root — verified against the existing `dist/`).
- The phase-9 prompt's `dist/apps/landing/public` is incorrect for the current AnalogJS + Vite setup; this plan supersedes it and we will correct the phase-9 doc inline when we touch it next.

### 1.4 GHA workflow shape — `.github/workflows/deploy-landing.yml`

**Triggers**
- `push` on `main` with paths filter: `apps/landing/**`, `libs/mozart-assets/**`, `libs/shared-util-theme/**`, `libs/shared-styles-theme/**`, `package.json`, `pnpm-lock.yaml`, `nx.json`, `tsconfig*.json`, `.github/workflows/deploy-landing.yml`.
- `pull_request` (any branch, same paths filter) → preview deploy with auto-generated `*.mozart-landing.pages.dev` URL commented on the PR.
- `workflow_dispatch` for manual re-deploys.

**Job graph (single workflow file)**
1. `validate` — checkout, pnpm install, `pnpm nx run-many -t lint typecheck -p landing`. (Adds a new `typecheck` Nx target on landing — see §1.10.)
2. `build` — needs `validate`. Runs `pnpm nx run landing:post-build-seo` then `pnpm nx run landing:seo-check`. Uploads `dist/apps/landing/analog/public` as a workflow artifact.
3. `deploy` — needs `build`. Downloads artifact. Uses `cloudflare/wrangler-action@v3` with `command: pages deploy ./artifact --project-name=mozart-landing --branch=${{ github.head_ref || github.ref_name }}`. Posts deployment URL as a PR comment.

**Concurrency**
```yaml
concurrency:
  group: deploy-landing-${{ github.ref }}
  cancel-in-progress: true
```

**Secrets** (added to GitHub repo settings, never echoed)
- `CLOUDFLARE_API_TOKEN` — scoped per §1.6.
- `CLOUDFLARE_ACCOUNT_ID`.

The existing `.github/workflows/ci.yml` is left alone (full monorepo lint/test/build/typecheck on every push). The deploy workflow is additive.

### 1.5 Cloudflare project
- **Project name**: `mozart-landing`.
- **Production branch**: `main`.
- **Build configuration**: empty / Direct Upload only.
- **Custom domains**: `mozart.build` (apex, canonical) and `www.mozart.build` (redirected to apex via `_redirects`).
- **Preview deployments**: enabled for all non-`main` branches.
- **Compatibility flags / Node version**: N/A (Pages serves static files; Functions not used).

### 1.6 Cloudflare API token scope
A single scoped token created via Cloudflare dashboard → My Profile → API Tokens → Create Custom Token. Permissions:
- **Account** → `Cloudflare Pages` → `Edit`.
- **Account** → `Account Settings` → `Read` (so wrangler can resolve the account).
- **Zone** → `mozart.build` → `Cache Purge` → `Purge` (for cache busts after deploy, optional but useful).
- TTL: 1 year, then rotate (runbook in Phase G).

### 1.7 DNS plan — **Dynadot → Cloudflare nameservers** (recommended)
Domain stays registered at Dynadot; Cloudflare becomes the DNS authority.
- Dynadot → My Domains → `mozart.build` → Name Servers → Custom → paste the two CF nameservers from Phase C.
- Inside the Cloudflare zone:
  - `mozart.build` — added via Pages → Custom Domains UI (creates the right A/AAAA records automatically, proxied through CF, orange cloud).
  - `www.mozart.build` — also added via Pages → Custom Domains UI (proxied). `_redirects` then 301s every `www` path to the apex.
  - Reserve (do **not** create yet): `app.mozart.build`, `downloads.mozart.build`. These belong to later sub-phases.
- **SSL/TLS mode**: Full (strict) — Pages serves over its own valid cert.
- **Always Use HTTPS**: on. **HTTP/2 + HTTP/3**: on. **Brotli**: on. **TLS minimum**: 1.2.
- Alternative considered: keep Dynadot DNS and `CNAME` `mozart.build` to `mozart-landing.pages.dev`. Rejected — apex CNAME flattening on Dynadot is fragile; CF nameservers also unlock zone-level caching, security headers via Transform Rules if needed, and Wrangler cache purge.

### 1.8 `_headers` (Cloudflare Pages)

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy-Report-Only: default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

/
  Cache-Control: public, max-age=0, must-revalidate

/*.html
  Cache-Control: public, max-age=0, must-revalidate

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable

/*.woff2
  Cache-Control: public, max-age=31536000, immutable
```

Notes:
- HSTS uses 2-year max-age + `preload` — eligible for submission to the preload list in Phase G after a few stable days.
- CSP ships **report-only** in Phase E. We flip to enforcing in Phase F once the preview deploy proves no real violations. `'unsafe-inline'` for style is required by Tailwind v4's emitted styles; `'unsafe-inline'` for script is required by AnalogJS's hydration shim — both will be tightened to hashes only after we measure what's actually emitted.
- No `Content-Security-Policy` report endpoint configured for v1 — we read violations from the browser console on preview. A Cloudflare/Sentry-backed reporting endpoint can land in Sub-phase 9.2.

### 1.9 `_redirects` (Cloudflare Pages)

Extend the existing file (keep vanity rules):

```
# Canonical host — www → apex (force, ignore matching files)
https://www.mozart.build/* https://mozart.build/:splat 301!

# Vanity short URLs (existing)
/discord https://discord.gg/BpTAyFf7qk 302
/github https://github.com/t1m4lc 302
/linkedin https://www.linkedin.com/in/timothyalcaide/ 302

# Reserve /download/* for future desktop binaries — placeholder page for now
/download/*  /download  200
```

The `200` rewrite (not 301) keeps `/download/mac-arm64`-style URLs typeable in marketing copy even before real binaries land. Direction (`www` → apex) chosen because apex is shorter and easier to share.

### 1.10 Nx target additions on `apps/landing/project.json`

Add a `typecheck` target — needed so `pnpm nx run-many -t typecheck -p landing` (validation gate) actually does something:

```json
"typecheck": {
  "executor": "nx:run-commands",
  "options": {
    "cwd": "{projectRoot}",
    "command": "tsc --noEmit -p tsconfig.app.json"
  },
  "cache": true
}
```

No changes to existing `build`, `serve`, `lint`, `post-build-seo`, `seo-check`.

### 1.11 SEO

- **`robots.txt`** — keep existing. (Already `Allow: /`, disallows `/privacy`, `/terms`, points to sitemap.)
- **`sitemap.xml`** — AnalogJS emits at build time with host `https://mozart.build`. `post-build-seo.mjs` scrubs privacy/terms (already wired). No work.
- **OG / Twitter / canonical** — `apps/landing/src/app/shell/seo.ts::injectSeo()` already exists and is used by `privacy.page.ts`, `terms.page.ts`, `docs/index.page.ts`. **Audit + extend**: every page (home, blog, blog/[slug], changelog, changelog/[slug], docs/[slug], 404, download) must call `injectSeo()` with a real `title` + `description` + `path`. Per-route overrides via route data not needed — calling `injectSeo()` from each page component is the existing pattern.
- **Default OG image**: already at `libs/mozart-assets/src/landing/social/og-default.png`, served at `/assets/landing/social/og-default.png`. Verify dimensions (1200×630) and weight (<300 KB) during Phase E; regenerate if not.
- **Favicon set** — `libs/mozart-assets/src/shared/favicons/` is **empty today**. Generate and commit:
  - `favicon.ico` (16+32+48 multi-res, overwrites `apps/landing/public/favicon.ico`).
  - `favicon-16x16.png`, `favicon-32x32.png`.
  - `apple-touch-icon.png` (180×180).
  - `icon-192.png`, `icon-512.png` (PWA install).
  - `manifest.webmanifest` linking the two PWA icons + `name`, `short_name`, `theme_color`, `background_color`, `display: minimal-ui`.
  - Inject `<link>` tags into `apps/landing/index.html` once, app-wide.

### 1.12 Custom 404

- New page `apps/landing/src/app/pages/[...not-found].page.ts` (AnalogJS file-router catch-all). Renders the same shell + a "page not found" body + a link home.
- Calls `injectSeo()` with `noindex` (extend `SeoMeta` to support an optional `noindex: boolean` and emit `<meta name="robots" content="noindex,nofollow">`).
- AnalogJS SSG emits this as `404.html` at the root of the prerender output; Cloudflare Pages serves it automatically on unmatched requests.

### 1.13 `/download/*` placeholder

- New page `apps/landing/src/app/pages/download.page.ts`. Body: "Mozart desktop is in private beta — downloads land with the public beta. Drop your email to get notified" + a link to the Discord vanity.
- The `_redirects` rule rewrites `/download/<anything>` to `/download` so the future URL shape (`/download/{channel}/{platform}/{filename}` per session prompt) does not 404 today.
- Future URL shape locked in for documentation:
  - Channels: `stable`, `beta`.
  - Platforms: `mac-arm64`, `mac-x64`, `windows-x64`, `linux-x64`.
  - Filename produced by Tauri (e.g. `Mozart_0.1.0-beta.1_aarch64.dmg`).
  - Example: `https://mozart.build/download/beta/mac-arm64/Mozart_0.1.0-beta.1_aarch64.dmg`.
- Binaries themselves will live on R2 / CrabNebula in a later sub-phase; the landing route either redirects to the CDN URL or proxies. **Out of scope for this plan.**

### 1.14 Validation gates

- **Pre-merge (in `validate` job + locally)**:
  - `pnpm nx run-many -t lint typecheck -p landing` — passes on the PR.
  - `pnpm nx build landing` — passes.
  - `pnpm nx run landing:seo-check` — passes (existing script).
- **Post-deploy (on the preview URL, before merging)**:
  - `treosh/lighthouse-ci-action@v12` against the preview URL with budgets:
    - performance ≥ 90
    - accessibility ≥ 95
    - best-practices ≥ 95
    - SEO ≥ 95
  - Failure blocks the PR.
- **Smoke (manual, incognito)**:
  - Home renders, view-transition animation works, theme switch (stone / light) works.
  - 404 renders for `/this-does-not-exist`.
  - `/download/anything` renders the placeholder.
  - OG meta visible in page source on `/`, `/blog`, `/docs`, `/changelog`.
  - Network tab: HTML responses have `Cache-Control: public, max-age=0, must-revalidate`; hashed assets have `immutable`.
  - CSP report-only header present; **no** unexpected violations in the console.

---

## 2. Risks & blockers

- **Nameserver propagation** — Dynadot → Cloudflare NS change can take 1–24h. Plan: do NS migration in Phase C.6 immediately after Cloudflare zone is created; verify via `dig NS mozart.build +short` before Phase D. **Do not flip DNS until `_headers`, `_redirects`, and the deploy workflow are merged**, so the apex never points at a half-built site.
- **CSP false positives once enforcing** — Tailwind + AnalogJS hydration both emit inline content; the report-only phase is mandatory before flipping to enforcing in Phase F. If hashes-only is not achievable, document the `'unsafe-inline'` exception and the mitigation (Trusted Types, etc.) in the runbook.
- **Vite asset hashing** — confirms during Phase E that hashed asset paths match the `_headers` `/*.js` `/*.css` globs (they do per Vite default `assets/*.hash.ext`). If the build switches to non-hashed names, the `immutable` rule misfires.
- **Cloudflare Pages free-tier limits** — 100k req/day, 500 builds/month. Beta traffic well within; flagged for monitoring.
- **AnalogJS `[...not-found].page.ts` syntax** — verify against AnalogJS 2.5.1 docs during Phase D (the file-router supports catch-alls but the exact slug format may be `[...slug].page.ts`). Fallback: implement a `404.page.ts` that the dist post-processor renames to `404.html`.
- **Wrangler version pin** — pin `@cloudflare/wrangler` to a known version in the GHA workflow; floating `@latest` has bitten Pages deploys before.

---

## 3. Explicit non-goals

- `apps/web` changes (deploy lands in Sub-phase 9.1 Block C, separate plan).
- R2 / `downloads.mozart.build` bucket.
- CrabNebula Cloud setup or any binary distribution pipeline.
- Real privacy / ToS content (kept `noindex`, placeholder copy unchanged).
- Analytics, telemetry, Sentry (Sub-phases 9.2 + 9.4).
- Real desktop downloads / OS detection on `/download` (this plan ships placeholder only).
- Content writing for the landing (no new blog posts, no new docs).
- Branch protection on `main` — set up in Phase G, but only after the deploy workflow has run green at least once.

---

## 4. Phases (gated by your `approve` reply)

- **A. Recon** — done.
- **B. Plan** — this document.
- **C. Account configuration** — one step per message:
  C.1 Confirm / create Cloudflare account → paste Account ID.
  C.2 Add `mozart.build` zone → paste back the two CF nameservers.
  C.3 Create Pages project `mozart-landing` (blank build config).
  C.4 Create scoped API token (you store it in 1Password).
  C.5 Add `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` to GitHub repo secrets.
  C.6 Dynadot → custom NS → paste CF NS.
  C.7 Verify zone Active via `dig NS mozart.build +short`.
- **D. Repo changes** — one file per message, `apply` gate before each commit:
  D.1 `apps/landing/public/_headers`.
  D.2 `apps/landing/public/_redirects` (extend existing).
  D.3 Favicon set in `libs/mozart-assets/src/shared/favicons/` + `apps/landing/public/manifest.webmanifest` + `<link>` tags in `apps/landing/index.html`.
  D.4 `apps/landing/src/app/pages/[...not-found].page.ts` (+ extend `SeoMeta` with `noindex`).
  D.5 `apps/landing/src/app/pages/download.page.ts` placeholder.
  D.6 OG/SEO sweep — ensure every page calls `injectSeo()` with real values.
  D.7 `apps/landing/project.json` — add `typecheck` target.
  D.8 `.github/workflows/deploy-landing.yml`.
- **E. First deploy + staging verification** — push PR, watch CI, open preview URL in incognito, run smoke + Lighthouse.
- **F. DNS cutover** — Pages → Custom Domains → add apex + www. Verify TLS. Flip CSP from report-only to enforcing. Re-verify.
- **G. Post-deploy checklist** — one item per message: `dig` / `curl -I` checks, HSTS preload (deferred a few days), Search Console + Bing + sitemap, runbook at `docs/runbooks/landing-deploy.md`, CF 2FA (TOTP), GitHub branch protection on `main` requiring `deploy-landing`, CODEOWNERS for `apps/landing/**` + the workflow, `git log -- apps/web` shows zero changes.

---

## 5. Conflicts flagged against `docs/prompts/phase-9-prompt.md`

1. **Output directory** — phase-9 Block B states `dist/apps/landing/public`; actual SSG root is `dist/apps/landing/analog/public`. This plan uses the correct path; phase-9 doc will be corrected during Phase D.8.
2. **Where the build runs** — phase-9 Block B implies the Cloudflare builder; this plan moves it to GHA for reproducibility. Justification in §1.2.
3. **`/download` page scope** — phase-9 Block F describes the full unsigned-install page wired to CrabNebula URLs; this plan ships a placeholder only. The full page lands when binaries do.
4. **`www.mozart.build` direction** — phase-9 Block B says "`www.mozart.build` → 301 redirect to `mozart.build`"; this plan honors that. Apex stays canonical.
5. **Secret names** — phase-9 doesn't specify; this plan uses `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` per Cloudflare's own docs. Future sub-phases (9.1 Block C, 9.3 release pipeline) should reuse these names.
