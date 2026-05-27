# Cloudflare Pages — Mozart cloud app deploy notes

just repush

Sister doc to [`docs/landing/cloudflare-notes.md`](../landing/cloudflare-notes.md).
Captures the one-time Cloudflare Pages setup for `app.mozart.build` — the cloud
companion that hosts the authenticated SPA (`apps/web`) **plus** the Pages
Functions that the desktop calls (currently just `/api/github/oauth-token`).

The deploy is driven by **`.github/workflows/deploy-web.yml`** via
`wrangler-action@v3`. Cloudflare's GitHub App is **not** used — our CI owns
the build so it can inject GitHub Variables into `apps/web/.env` before the
Angular build runs.

## 1. Build settings (Cloudflare Pages dashboard)

| Field                  | Value                               |
| ---------------------- | ----------------------------------- |
| Framework preset       | None / Static                       |
| Build command          | `pnpm nx run web:build:production`  |
| Build output directory | `dist/apps/web/browser`             |
| Root directory         | _(repository root — leave empty)_   |
| Node version           | 20 (matches CI)                     |
| Package manager        | pnpm 11 (set `PNPM_VERSION=11.0.8`) |

Cloudflare auto-discovers Pages Functions in `apps/web/functions/**` because
the Pages build picks up the `functions/` directory at the repository root of
the _project_. Since the build command's CWD is the repo root, set the
Pages project's "Root directory" to `apps/web` if Cloudflare's auto-detection
misses the functions folder.

## 2. Environment bindings

Only **one** runtime binding is needed in CF Pages. The deploy workflow syncs
it automatically via `wrangler pages secret bulk` — you don't set it manually
in the dashboard unless the first deploy hasn't run yet.

| Binding            | Type   | Where set                                          | Purpose                                                                            |
| ------------------ | ------ | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `CLERK_SECRET_KEY` | Secret | Auto-synced by `deploy-web.yml` from GitHub Secret | Used by `functions/api/github/oauth-token.ts` at runtime. Never in the SPA bundle. |

All other values (`CLERK_PUBLISHABLE_KEY`, `POSTHOG_KEY`, `POSTHOG_HOST`) are
**build-time** — they come from GitHub Variables, written to `apps/web/.env`
by the workflow, and baked into the Angular bundle by the esbuild plugin.
They are NOT set in the Cloudflare dashboard.

## 3. Custom domain / DNS

- `app.mozart.build` — apex of the cloud app, attached to this Pages project.
- The marketing site at `mozart.build` is a **separate** Pages project
  (see `docs/landing/cloudflare-notes.md`). Do not point the apex at both.
- Clerk allowed origins must include `https://app.mozart.build` and the
  per-PR preview domain pattern `*.<project>.pages.dev`.

## 4. Local development

The Angular dev server (port 4201, HTTPS) proxies `/api/*` to a local
Wrangler instance via `apps/web/proxy.conf.json`. The repo ships a
single-command launcher that brings both up in parallel:

```bash
# Both processes — Angular SPA on https://localhost:4201
# and Pages Functions on http://localhost:8788
pnpm dev:web
```

Or run them in two shells if you prefer separated logs:

```bash
# shell 1
pnpm nx serve web

# shell 2
pnpm dev:web:functions
```

**Secrets.** `pnpm dev:web:functions` runs `wrangler pages dev` with its
cwd set to `apps/web/`. Wrangler 4.x auto-loads `apps/web/.env` from
that cwd ("Using secrets defined in .env" appears in its boot log).
Copy the template once:

```bash
cp apps/web/.env.example apps/web/.env
# then paste your Clerk secret key into apps/web/.env
```

`apps/web/.env` is gitignored via the root `.gitignore` (`.env`
pattern). The `.example` companion is checked in.

The desktop then talks to `https://localhost:4201/api/github/oauth-token`
exactly the way it talks to production — no special dev casing in Rust.

## 5. Deployment checklist (run once in Cloudflare dashboard)

- [ ] Cloudflare Pages → **Create a project** → **Connect to Git** → repo.
- [ ] **Production branch:** `main`.
- [ ] Build settings as in §1.
- [ ] Environment bindings as in §2 (set `CLERK_SECRET_KEY` for Production + Preview).
- [ ] **Save & Deploy** — first build runs.
- [ ] Attach `app.mozart.build` apex.
- [ ] In Clerk dashboard → **Domains**, add `https://app.mozart.build`.
- [ ] Verify `https://app.mozart.build/login` loads and a PR-preview deploy
      produces `<branch>.<project>.pages.dev`.

## 6. Smoke tests after first deploy

1. `https://app.mozart.build/login` renders the OAuth provider buttons.
2. Sign in via GitHub → `/auth-callback` → `/dashboard` lands without error.
3. `curl -i https://app.mozart.build/api/github/oauth-token` (no auth) returns
   `401` with JSON `{ "kind": "unauthorized" }`.
4. With a valid Clerk session JWT in `Authorization: Bearer …`, the same
   endpoint returns either `{ "kind": "ok", "token": "ghu_…", "login": "…" }`
   (Clerk-linked GitHub user) or `{ "kind": "not_linked" }` (Google-only user).

## 8. Anti-crawl

`app.mozart.build` is an authenticated app with no public SEO value. Two layers
prevent indexing:

**`apps/web/public/robots.txt`** (served at `https://app.mozart.build/robots.txt`):

```
User-agent: *
Disallow: /
```

**`apps/web/src/index.html`** head:

```html
<meta name="robots" content="noindex,nofollow" />
```

The meta tag is a safety net — if a bot ignores `robots.txt`, the directive in
the HTML still signals no-index. The marketing site at `mozart.build` handles
all public SEO; `app.mozart.build` should never appear in search results.

---

## 9. SPA routing — `_redirects`

Angular's client-side router handles `/#!` navigation in the browser, but
Cloudflare Pages serves files directly. Without a fallback rule, any deep-link
(e.g. `https://app.mozart.build/dashboard`) returns a 404 from CF instead of
the Angular shell.

**`apps/web/public/_redirects`**:

```
/* /index.html 200
```

This rule rewrites every unmatched path to `index.html` with a 200 status,
letting Angular's router take over from there.

---

## 10. Deploy workflow

The deploy is driven by **`.github/workflows/deploy-web.yml`** (mirroring the
landing deploy pattern). It runs on every push to `main` that touches
`apps/web/**` or its shared dependencies.

**GitHub secrets required** (Settings → Secrets → Actions):

| Secret                  | Purpose                                                 |
| ----------------------- | ------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | wrangler deploy auth (same as landing)                  |
| `CLOUDFLARE_ACCOUNT_ID` | CF account ID (same as landing)                         |
| `CLERK_SECRET_KEY`      | Synced to CF Pages env via `wrangler pages secret bulk` |

**GitHub variables required** (Settings → Variables → Actions):

| Variable                | Purpose                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `CLERK_PUBLISHABLE_KEY` | Production Clerk publishable key `pk_live_…` (written to `apps/web/.env` at build time) |
| `POSTHOG_KEY`           | PostHog ingest key for `app.mozart.build` (main only — PR previews build without it)    |
| `POSTHOG_HOST`          | PostHog API host, e.g. `https://eu.i.posthog.com`                                       |

**`.env` pattern :** The workflow writes `apps/web/.env` from these GitHub Variables
before running `pnpm nx run web:build:production`. The esbuild plugin
(`apps/web/esbuild.env.mjs`) reads this file and injects each variable as
`import.meta.env.VAR_NAME` at build time. No TypeScript env files involved.

For local dev: copy `apps/web/.env.example` → `apps/web/.env` and fill in your keys.

The PostHog key is written only on pushes to `main`; PR previews build with an
empty key so analytics are silenced there.

---

## 7. Explicitly NOT added in this initial setup

- In-repo deploy workflow file. Cloudflare's GitHub App owns the build.
- Wrangler CLI usage in CI.
- A second `apps/web` "API-only" build target — Pages auto-discovers the
  `functions/` directory.
