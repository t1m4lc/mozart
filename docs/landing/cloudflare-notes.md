# Cloudflare Pages — Mozart landing deploy notes

Companion to [`docs/landing/plan.md`](./plan.md). Captures the manual steps
required to deploy `apps/landing` to Cloudflare Pages via the GitHub
integration. **No deploy workflow file lives in this repo** — Cloudflare's
GitHub App handles build, deploy, and PR previews once the project is
connected.

## 1. Build settings (Cloudflare Pages dashboard)

| Field                   | Value                                  |
| ----------------------- | -------------------------------------- |
| Framework preset        | None / Static                          |
| Build command           | `pnpm nx run landing:post-build-seo`   |
| Build output directory  | `dist/apps/landing/analog/public`      |
| Root directory          | _(repository root — leave empty)_      |
| Node version            | 20 (matches CI)                        |
| Package manager         | pnpm 11 (set `PNPM_VERSION=11.0.8`)    |

> **Why `landing:post-build-seo` and not `landing:build`?** The
> `post-build-seo` target depends on `build` and additionally scrubs
> `/privacy` + `/terms` from `sitemap.xml` and injects
> `<meta name="robots" content="noindex,nofollow">` into their static HTML
> files. Skipping it would publish placeholder legal copy to the public
> sitemap. If/when the legal pages get real text, drop `post-build-seo`
> from the chain or revert the script and switch the build command back to
> `pnpm nx run landing:build`.
>
> **Why `dist/apps/landing/analog/public`?** Verified from the Phase 13
> build tree. AnalogJS writes the SPA shell + per-route `index.html` and
> static assets under `analog/public`. The sibling `dist/apps/landing/`
> directory exists too but is the Vite intermediate; deploying it would
> miss prerendered routes.

## 2. Environment assumptions

- `mozart.build` apex is attached to the Cloudflare Pages project.
- The actual build + deploy runs from **`.github/workflows/deploy-landing.yml`**, not Cloudflare's GitHub App. `wrangler-action@v3` uploads the prerendered tree to the Pages project via `secrets.CLOUDFLARE_API_TOKEN` + `secrets.CLOUDFLARE_ACCOUNT_ID`. (Earlier versions of this note described a pure CF GitHub-App setup — that's stale.)
- Two **public** `VITE_*` vars feed the PostHog telemetry service (see `docs/specs/plan-telemetry.md`). Set them in **GitHub** repo → Settings → Secrets and variables → **Actions** → **Variables** (not Secrets — they ship in the public bundle, so the redaction Secrets give you is wasted):

  | Variable | Value |
  | --- | --- |
  | `VITE_POSTHOG_KEY` | `phc_…` (PostHog project API key — public ingest key, safe in bundle) |
  | `VITE_POSTHOG_HOST` | `https://us.i.posthog.com` (or `eu.i.posthog.com`) |

  The workflow only writes them into `apps/landing/.env.local` on `push` to `main`, so PR-preview deploys ship with no key and the analytics service no-ops. The dev server skips init too — see the `import.meta.env.DEV` guard in `analytics.service.ts`.

## 3. Custom domain / DNS

- `mozart.build` (apex) → this Cloudflare Pages project.
- `www.mozart.build` → redirect to apex. Direction (apex vs. www
  canonical) is the operator's call; defer the redirect until both records
  exist.
- `app.mozart.build` is a **separate** Cloudflare project for the future
  cloud app. Do not point it at this project.

## 4. Headers + redirects (skeleton, add later if needed)

These are optional — Cloudflare's defaults are fine for a first deploy.
Add to `apps/landing/public/` when you actually want them; both files are
copied verbatim into the build output.

`apps/landing/public/_headers`:

```text
/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/*.html
  Cache-Control: public, max-age=0, must-revalidate
```

`apps/landing/public/_redirects` — empty at launch; no rewrites required.

## 5. Deployment checklist (run once in Cloudflare dashboard)

- [ ] Cloudflare Pages → **Create a project** → **Connect to Git** → select
      this repository.
- [ ] **Production branch:** `main`.
- [ ] Build settings as in §1.
- [ ] **Save & Deploy** — the first build runs.
- [ ] Attach `mozart.build` apex; decide `www` redirect direction.
- [ ] Verify a PR branch produces a `<branch>.<project>.pages.dev` preview
      URL automatically.
- [ ] (Optional) drop `_headers` / `_redirects` into `apps/landing/public/`
      and re-deploy.

## 6. PR previews

PR previews are automatic once the GitHub integration is connected. Every
PR opened against the configured production branch gets a unique
`<branch>.<project>.pages.dev` URL with no further config. This is the
intended review surface for landing changes before merge.

## 7. Explicitly NOT added by this plan

- In-repo deploy workflow file (`.github/workflows/landing-deploy.yml`).
- `wrangler` CLI usage or wrangler config in this repo (the skeleton
  example below is reference only).
- Cloudflare API tokens stored in repo secrets.

The Cloudflare GitHub App owns all of the above from the Cloudflare side.

## 8. Smoke tests after first deploy

1. `https://mozart.build/` returns 200 with `<title>Mozart — Conduct your
   AI coding agents</title>`.
2. `https://mozart.build/sitemap.xml` lists at least `/`, `/docs`, every
   `/docs/<slug>`, `/blog`, `/blog/hello-mozart`, and `/changelog`.
3. `https://mozart.build/robots.txt` references the sitemap and disallows
   `/privacy` and `/terms`.
4. `https://mozart.build/privacy` HTML contains
   `<meta name="robots" content="noindex,nofollow">`.
5. `https://mozart.build/og-default.png` returns the 1200×630 social card.

## 9. Future deploy work (not in this phase)

- Connect real analytics once a privacy-respecting tool is chosen.
- Add `_headers` for long-lived font + asset caching once traffic warrants
  it.
- Swap `og-default.png` from the build-time fallback to a designed asset.
- Once `/privacy` and `/terms` ship real copy, remove the noindex meta and
  re-add both routes to the sitemap (revert the `post-build-seo` script or
  drop it from the chain).
