# Cloudflare Pages — Mozart cloud app deploy notes

Sister doc to [`docs/landing/cloudflare-notes.md`](../landing/cloudflare-notes.md).
Captures the one-time Cloudflare Pages setup for `app.mozart.build` — the cloud
companion that hosts the authenticated SPA (`apps/web`) **plus** the Pages
Functions that the desktop calls (currently just `/api/github/oauth-token`).

The deploy itself is performed by Cloudflare's GitHub App once the project is
connected; there is no in-repo deploy workflow.

## 1. Build settings (Cloudflare Pages dashboard)

| Field                   | Value                                  |
| ----------------------- | -------------------------------------- |
| Framework preset        | None / Static                          |
| Build command           | `pnpm nx run web:build:production`     |
| Build output directory  | `dist/apps/web/browser`                |
| Root directory          | _(repository root — leave empty)_      |
| Node version            | 20 (matches CI)                        |
| Package manager         | pnpm 11 (set `PNPM_VERSION=11.0.8`)    |

Cloudflare auto-discovers Pages Functions in `apps/web/functions/**` because
the Pages build picks up the `functions/` directory at the repository root of
the *project*. Since the build command's CWD is the repo root, set the
Pages project's "Root directory" to `apps/web` if Cloudflare's auto-detection
misses the functions folder.

## 2. Environment bindings

Set these in **Cloudflare Pages → Settings → Environment variables**
(both **Production** and **Preview**):

| Binding              | Type             | Purpose |
| -------------------- | ---------------- | ------- |
| `CLERK_SECRET_KEY`   | Secret           | Used by `functions/api/github/oauth-token.ts` to call Clerk's Backend SDK and retrieve the user's GitHub OAuth access token. Never bundled into the SPA. |
| `CLERK_PUBLISHABLE_KEY` | Plaintext (optional) | Echoed at build time into the SPA bundle by `env.ts` if you want CI-driven keys instead of the committed `env.ts`. |

> The Clerk publishable key (`pk_test_…` / `pk_live_…`) is also baked into
> `apps/web/src/env.ts` today. Keep the binding optional until we move env
> handling to build-time injection.

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

## 7. Explicitly NOT added in this initial setup

- In-repo deploy workflow file. Cloudflare's GitHub App owns the build.
- Wrangler CLI usage in CI.
- A second `apps/web` "API-only" build target — Pages auto-discovers the
  `functions/` directory.
