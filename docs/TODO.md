# TODO — Mozart

## Landing site (`apps/landing`) — post-deploy

Site is live at https://mozart.build (custom domain, TLS, www→apex 301, CSP report-only).
See `docs/specs/plan-ship-landing.md` for the original ship plan.

### Validation
- [ ] Run Lighthouse on https://mozart.build/ (desktop + mobile).
      Target: perf ≥90, a11y ≥95, BP ≥95, SEO ≥95.
- [ ] Crawl a few internal links and confirm no 404s / mixed content.

### SEO / discovery
- [ ] Google Search Console — verify domain ownership, submit `https://mozart.build/sitemap.xml`.
- [ ] Bing Webmaster Tools — same.
- [ ] Confirm `/privacy` and `/terms` are excluded from search (they ship `noindex`).

### Security hardening
- [ ] Monitor CSP report-only for ~3–7 days; once clean, flip
      `Content-Security-Policy-Report-Only` → `Content-Security-Policy` in
      `apps/landing/public/_headers`.
- [ ] Submit `mozart.build` to https://hstspreload.org after a week of stable HSTS.
- [ ] Confirm 2FA (TOTP) is on the Cloudflare account.
- [ ] Replace placeholder SVG favicon with real Mozart logo art; then generate
      PNG icons (`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) and
      drop them in `libs/mozart-assets/src/shared/favicons/`.

### Repo / process
- [ ] GitHub branch protection on `main`: require **Deploy Landing / Lint &
      typecheck** and **Deploy Landing / Build** to pass before merge.
- [ ] Add `CODEOWNERS` covering `apps/landing/**` and
      `.github/workflows/deploy-landing.yml`.
- [ ] Write deploy runbook at `docs/runbooks/landing-deploy.md` (how to
      rollback, where the secrets live, how to rotate the CF API token).

### Pre-existing CI failures (surfaced by Node 22 upgrade, not landing-related)
- [ ] `desktop:build` exceeds the 1.50 MB bundle budget (currently 1.57 MB).
- [ ] `web:build` / `web:test` — missing `../env` module.
- [ ] `sandbox:test` and `shared-util-os:test` — empty test files.

### Deferred (until binaries / public beta)
- [ ] Replace placeholder `/download` page with the real per-platform download
      UI (mac arm64, mac intel, windows, linux), wired to CrabNebula URLs.
- [ ] Re-add `/download/<platform>` rewrites in `_redirects` once routes exist.
