# Mozart Landing Site — Execution Plan

Static-first marketing website for Mozart (`mozart.build`) built with Angular + AnalogJS inside the existing Nx monorepo.

This plan is sequential. Each phase is a self-contained agent task with an explicit prompt, files in scope, acceptance criteria, validation command, and notes on risk. Do **not** combine phases.

---

## 1. Repository observations

Inspected on 2026-05-16 at `/home/timothy/accelerate_growth_with/mozart-landing/`.

### Tooling

| Concern           | Observation                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Package manager   | **pnpm 11.0.8** (declared in `package.json#packageManager`; lockfile at `pnpm-lock.yaml`)                                                                                                                                                                                                              |
| Workspace         | `pnpm-workspace.yaml` includes `apps/*` and `packages/*` (no `libs/*` glob — `libs/**` are pulled in via `tsconfig.base.json#paths`)                                                                                                                                                                   |
| Nx                | **22.7.1** (root `nx` + `@nx/angular`, `@nx/eslint`, `@nx/js`, `@nx/playwright`, `@nx/web`)                                                                                                                                                                                                            |
| Angular           | **~21.2.0** (`@angular/*`, `@angular/build`, `@angular/cli`)                                                                                                                                                                                                                                           |
| AnalogJS          | **Not installed.** No `@analogjs/*` packages in `package.json` or `pnpm-lock.yaml`. Will need to be added. **Pin exact versions** (no caret) — Nx 22 + Angular 21 + Analog combo isn't in Analog's own compat matrix (Nx 22 row lists Angular ^20). A stray `pnpm update` could pull a breaking minor. |
| TypeScript        | `~5.9.2`                                                                                                                                                                                                                                                                                               |
| Tailwind          | **v4** via `@tailwindcss/postcss` (Tailwind v4 inline-config CSS, no `tailwind.config.js`); paired with `@juristr/nx-tailwind-sync` to keep `@source` directives in each app's `styles.css`                                                                                                            |
| Component library | Spartan NG / Hlm under `libs/spartan-ui/<component>` (read-only per CLAUDE.md)                                                                                                                                                                                                                                 |
| Lint              | flat-config ESLint (`eslint.config.mjs` per app) via `@nx/eslint/plugin`                                                                                                                                                                                                                               |

### Apps present

- `apps/desktop/` — Tauri v2 + Angular 21 desktop shell (primary product surface, do not touch)
- `apps/desktop-e2e/` — Playwright e2e for desktop
- `apps/web/` — Angular 21 web app (future cloud UI — **separate concern from the landing site**)
- `apps/web-e2e/` — Playwright e2e for web

### Libs present

- `libs/spartan-ui/**` — Spartan NG components (≈60 entry points exposed via `@spartan-ui/<component>`). **Read-only** during landing work per CLAUDE.md.
- `libs/shared-styles-theme/` — Global CSS: `@angular/cdk/overlay-prebuilt.css`, `base.css`, theme variants (`themes/zinc.css`, `themes/stone.css`). Imported by each app's `styles.css`.
- `libs/shared-util-theme/` — Exposes `provideTheme()` and `ThemeService` (signal-based, toggles `.dark` on `<html>` and `theme-<name>` on `<body>`, persists to `localStorage`).
- `libs/clerk/` — Clerk SDK bootstrap (used by `apps/web` only; **not needed** for the public landing site).

### Theme & typography conventions

- Tailwind v4 with `@custom-variant dark (&:where(.dark, .dark *))` — required for any new app that wants `dark:` utilities to follow Mozart's `.dark` toggle. Defined in `libs/shared-styles-theme/src/lib/base.css`.
- Geist / Geist Mono fonts loaded via `@font-face` from `/fonts/GeistVariableVF.woff2` and `/fonts/GeistMonoVariableVF.woff2`. **Mono is the default UI font** (`--default-font-family: var(--font-mono)`).
- Color tokens live in `libs/shared-styles-theme/src/lib/themes/*.css` as HSL CSS variables (`--background`, `--foreground`, `--primary`, …) consumed by Tailwind `@theme inline`.
- Default theme: `stone`, default mode: `light` — but `ThemeService` honours `prefers-color-scheme` when mode is `system`.

### Content / docs conventions (existing)

- `docs/` holds internal engineering docs only (specs, audits, conventions, strategy). There is **no existing markdown content pipeline for a public site**.
- No existing AnalogJS, Astro, MDX, Velite, or similar content tooling is present.
- `marked` is in `dependencies` (used internally by the desktop app for chat rendering), so a fallback markdown renderer exists if AnalogJS content tools are insufficient.

### Build / deploy conventions

- Default build output: `dist/apps/<app>/browser` (Angular 21 application builder default).
- CI runs `npx nx run-many -t lint test build typecheck` on push to `main` and on PRs (`.github/workflows/ci.yml`).
- No deployment pipeline exists for a marketing site. The Tauri app ships separately. Web (`apps/web`) is not deployed publicly yet.
- Cloudflare Pages is the **target host for the landing site** (per task spec). No CF config exists in the repo today.

### Other constraints (from `CLAUDE.md`)

- `libs/spartan-ui/**` is read-only during feature work — landing must consume components, not modify them.
- Use Angular standalone components, signals, SignalStore where state is needed, Tailwind utilities only (no semantic class names, no arbitrary values, no `:host` — use `host:` modifier).
- Never expose Git/worktree vocabulary in user-facing copy (`worktree`, `branch_name`, `HEAD~1`, `agent/wip-*`, etc.).
- Vocabulary: Project, Task, Workspace, Thread, Agent Run, Changes.

---

## 2. Target architecture

### App location

```
apps/landing/
```

Sibling to `apps/desktop` and `apps/web`. New Nx project, `projectType: application`, prefix `mz` (or `landing`) to avoid clashing with desktop's `app-`/`mz-` prefixes.

### Routes

```
/                          → homepage (hero + workflow + teasers + footer)
/docs                      → docs index (list + sidebar)
/docs/[slug]               → docs detail (markdown content)
/blog                      → blog index (list of posts, newest first)
/blog/[slug]               → blog post detail
/changelog                 → changelog index (versions reverse-chronological)
/changelog/[slug]          → changelog entry detail (only created if a single entry warrants its own page; otherwise inline on /changelog)
/privacy                   → privacy placeholder
/terms                     → terms placeholder
```

### Markdown & content structure

AnalogJS ships `@analogjs/content` which gives:

- File-based routing via `apps/landing/src/app/pages/` (e.g. `pages/docs/[slug].page.ts`).
- A `injectContent<T>()` helper that loads a single markdown file by slug, parses frontmatter, and exposes `content` (HTML) + `attributes`.
- A `injectContentFiles<T>()` helper for indices.

Content directories — **kept under `src/content/`** to match the AnalogJS default and stay co-located with the app:

```
apps/landing/src/content/
  docs/
    getting-started.md
    concepts.md
    workflow.md
    local-first.md
    settings.md
  blog/
    hello-mozart.md
  changelog/
    v0-0-1.md
```

Frontmatter conventions (one schema per content type — kept minimal):

```yaml
# docs/*.md
---
title: Getting started
description: Install Mozart and run your first Workspace.
order: 1
---
# blog/*.md
---
title: Hello, Mozart
description: A short note from the team.
date: 2026-05-16
author: Mozart team
---
# changelog/*.md
---
version: 0.0.1
date: 2026-05-16
title: First public preview
---
```

> **Decision — why `src/content/` and not `apps/landing/content/`:** AnalogJS's Vite content plugin defaults to scanning `src/content/<folder>/*.md`. Putting markdown there gets us indexing, HMR, frontmatter parsing, and prerender discovery with zero extra config. The plan spec asked for `apps/landing/src/content/docs|blog|changelog` — that matches the AnalogJS default exactly, so we follow it.

### Shared layout components

Live under `apps/landing/src/app/shell/`:

- `app-shell.component.ts` — top-level wrapper (header + `<router-outlet>` + footer)
- `site-header.component.ts` — logo, primary nav (Docs / Blog / Changelog), theme toggle
- `site-footer.component.ts` — four columns (Company / Resources / Legal / Connect)
- `container.component.ts` — responsive max-width wrapper (`max-w-screen-xl` + `px-4 sm:px-6 lg:px-8`)
- `prose.component.ts` (or a `prose` utility class layer) — typography for rendered markdown

Reuse existing Spartan UI atoms where helpful (`@spartan-ui/button`, `@spartan-ui/separator`, `@spartan-ui/typography`, `@spartan-ui/icon`). Do not modify `libs/spartan-ui/**`.

### Shared theme integration

- Apply `@mozart/shared-util-theme` via `provideTheme({ theme: 'stone', mode: 'system' })` in `app.config.ts`. **ThemeService gets a `isPlatformBrowser` guard in `init()`** (refactored in Phase 2 — required because AnalogJS prerenders at build in Node where `window`/`localStorage`/`matchMedia` are undefined).
- Import `libs/shared-styles-theme/src/index.css` from `apps/landing/src/styles.css`. Same shared CSS works for all three apps — Tailwind v4 processes it identically whether driven by `@tailwindcss/postcss` (desktop/web) or `@tailwindcss/vite` (landing).
- Use **`@tailwindcss/vite` plugin** in `apps/landing/vite.config.ts` (NOT `@tailwindcss/postcss`, NOT `nx-tailwind-sync`). Sync generator is keyed off `@angular/build:application` executor and won't fire on AnalogJS's Vite pipeline. Use one glob `@source "../../../libs/{shared-util-theme,ui}/**/*.{html,ts}"` instead.
- Add Geist fonts via `apps/landing/public/fonts/` — copy from `apps/desktop/public/fonts/` (NOT `apps/web/public/fonts/` — web has no fonts dir).

### SSG strategy

- Use AnalogJS prerender mode (`@analogjs/platform` Vite plugin → `prerender: { routes: [...] }`).
- Enumerate static routes (`/`, `/docs`, `/blog`, `/changelog`, `/privacy`, `/terms`).
- Enumerate dynamic routes by reading content filenames at build time (helper invoked from the AnalogJS Vite config or from `prerender.routes` as an async function).
- Output a fully static `dist/apps/landing/` tree suitable for Cloudflare Pages (static hosting, no server runtime).
- No SSR at runtime. No serverless functions. No client-side data fetching.
- **Sitemap and RSS**: use AnalogJS-native plugins / blessed patterns only (Analog's prerender API exposes the route list). **No bespoke sitemap or RSS code.** If Analog has no first-party pattern for a given artifact (e.g. `llms.txt`), defer it as a TODO rather than roll a custom script.

---

## 3. Implementation phases

> Each phase is a single agent run. The agent prompt is verbatim — copy-paste it. After each phase, the agent reports back; the user verifies the manual test before the agent moves to the next phase.

---

### Phase 0 — Fix CI (pnpm)

#### Objective

Repair `.github/workflows/ci.yml` so it actually runs the existing checks. The workflow currently does `cache: 'npm'` + `npm ci`, but the repo is pnpm-only (`packageManager: "pnpm@11.0.8"`, only `pnpm-lock.yaml`, no `package-lock.json`). Every PR — including the landing PR — is blocked here.

#### Files likely to be created/modified

- `.github/workflows/ci.yml`

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 0 only.

Fix .github/workflows/ci.yml so it uses pnpm correctly:
- Add a step `pnpm/action-setup@v4` with `version: 11.0.8` BEFORE `actions/setup-node`.
- Change `setup-node`'s `cache:` from `'npm'` to `'pnpm'`.
- Replace `npm ci` with `pnpm install --frozen-lockfile`.
- Leave the `npx nx run-many -t lint test build typecheck` line as-is.
- Leave `npx nx fix-ci` as-is.

Do NOT:
- bump Node version
- add or remove jobs
- introduce caching of pnpm store beyond what `setup-node` does
- touch any other workflow

At the end, report:
- the diff (verbatim)
- a one-line explanation of why it was broken
- next phase to run
```

#### Acceptance criteria

- [ ] Workflow uses `pnpm/action-setup@v4` pinned to `11.0.8`.
- [ ] `setup-node` caches `'pnpm'`.
- [ ] `npm ci` replaced with `pnpm install --frozen-lockfile`.
- [ ] No other changes to the file.

#### Validation command

Open a draft PR on this branch; confirm the CI workflow runs and `pnpm install` succeeds. (No local validation possible — CI runs in GitHub Actions.)

#### Risks / notes

- This is outside the strict landing scope but is the literal gate blocking every landing PR. Ship as its own commit, then continue with Phase 1.

---

### Phase 1 — Scaffold

#### Objective

Add AnalogJS to the workspace and create the `apps/landing` application with a minimal working route. Do **not** implement homepage, docs, blog, changelog, or theme integration yet.

#### Files likely to be created/modified

- `package.json` (add `@analogjs/platform`, `@analogjs/content`, `@analogjs/router`, `vite` peers as required by the AnalogJS version that matches Angular 21)
- `pnpm-lock.yaml`
- `apps/landing/project.json`
- `apps/landing/vite.config.ts`
- `apps/landing/tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`
- `apps/landing/eslint.config.mjs`
- `apps/landing/src/main.ts`
- `apps/landing/src/index.html`
- `apps/landing/src/styles.css` (placeholder — no theme wiring yet)
- `apps/landing/src/app/app.config.ts`, `app.ts`, `app.routes.ts`
- `apps/landing/src/app/pages/index.page.ts` (single placeholder route)
- `apps/landing/public/favicon.ico` (copy from `apps/web/public/`)
- `tsconfig.base.json` (only if a path alias is required — likely not for an app)
- `nx.json` (no edits expected; AnalogJS plugin auto-discovery is preferred)

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 1 only.

Scaffold or configure the AnalogJS landing app at apps/landing.
Use the @analogjs/platform Nx generator that matches Angular 21.x and Nx 22.7. Verify
compatibility before installing — if the AnalogJS generator for Nx is not available
or not compatible, fall back to: pnpm add -D @analogjs/platform@<EXACT> @analogjs/content@<EXACT>
@analogjs/router@<EXACT> @analogjs/vite-plugin-angular@<EXACT> @tailwindcss/vite@<EXACT>
and hand-author the project.json + vite.config.ts based on the AnalogJS Angular 21 docs.

**Pin EXACT versions (no caret, no tilde).** Nx 22 + Angular 21 + Analog is not in
Analog's own compat matrix yet — a future `pnpm update` could pull a breaking minor.
Surface the chosen version numbers in the report.

**Generator overrides** (pass these flags or post-edit project.json):
- `unitTestRunner: 'none'` — AnalogJS uses plain Vitest, not vitest-angular. Workspace
  default is vitest-angular; override here.
- `e2eTestRunner: 'none'` for Phase 1 (Playwright e2e project added in Phase 13.5).
- Add bundle budgets to `apps/landing/project.json`:
  - initial: maximumWarning: 200kb, maximumError: 400kb
  - anyComponentStyle: maximumWarning: 2kb, maximumError: 4kb

Tailwind: install `@tailwindcss/vite` (NOT `@tailwindcss/postcss`). Register in
`vite.config.ts`. Do not depend on `@juristr/nx-tailwind-sync` for landing — it is
keyed to the `@angular/build:application` executor.

Keep the change minimal. The app must:
- live at apps/landing
- bootstrap an empty Angular standalone app
- have one placeholder route ("/") that renders the literal text "Mozart landing — Phase 1 OK"
- build via `pnpm nx run landing:build`
- serve via `pnpm nx run landing:serve`

Do NOT:
- implement the homepage layout, hero, header, or footer
- create docs/blog/changelog content or routes
- wire @mozart/shared-util-theme or @mozart/shared-styles-theme yet (Phase 2)
- touch apps/desktop, apps/web, libs/spartan-ui/**, libs/clerk
- modify libs/shared-styles-theme or libs/shared-util-theme (Phase 2 will refactor ThemeService)
- run `pnpm install` against unrelated dependency updates
- commit or push

If AnalogJS requires a workspace-level Vite or rollup version bump, surface it in
the report rather than silently bumping pinned versions.

At the end, report:
- files changed (paths only)
- the EXACT versions chosen for every @analogjs/* and @tailwindcss/vite package
- commands run (verbatim, with exit code)
- validation result (build pass/fail, serve pass/fail with the placeholder text visible)
- the next phase to run
- any blocker that prevented full completion
```

#### Acceptance criteria

- [ ] `apps/landing/` exists and is registered as an Nx project.
- [ ] `pnpm nx show project landing` succeeds.
- [ ] `pnpm nx run landing:build` exits 0 OR the blocking error is captured verbatim in the report.
- [ ] Visiting `/` (via `nx serve` or built output) shows the literal text `Mozart landing — Phase 1 OK`.
- [ ] `apps/landing/project.json` has `unitTestRunner: 'none'` (or no `test` target).
- [ ] `apps/landing/project.json` declares initial bundle budgets: 200kb warn / 400kb error.
- [ ] Every `@analogjs/*` and `@tailwindcss/vite` entry in `package.json` is an exact version (no `^`, no `~`).
- [ ] No edits under `apps/desktop`, `apps/web`, `libs/spartan-ui`, `libs/clerk`, `libs/shared-styles-theme`, `libs/shared-util-theme`.
- [ ] `git status` shows only files inside `apps/landing/`, `package.json`, and `pnpm-lock.yaml`.

#### Validation command

```bash
pnpm nx run landing:build
```

#### Risks / notes

- AnalogJS's Angular 21 support trails Angular releases by a few weeks. If `@analogjs/platform@latest` does not declare peer support for Angular `~21.2`, accept a beta/RC tag rather than downgrading Angular — and surface the version chosen in the report.
- `@juristr/nx-tailwind-sync` may try to enumerate the landing app and inject `@source` directives the moment a Tailwind import is added. Phase 1 has no theme wiring, so the sync should be a no-op. If it is not, the agent must document the diff rather than fight it.
- Do not enable SSR. AnalogJS supports SSR by default in some templates — explicitly switch to client-only / prerender-only.

---

### Phase 2 — Theme (swapped with old Phase 3 so styling exists BEFORE shell is built)

#### Objective

Connect the shared theme system FIRST so Phase 3 (shell) renders styled from its first commit. Also includes a small SSR-safety refactor of `ThemeService` so prerender doesn't crash. Wires typography, color tokens, Tailwind dark-mode variant, fonts, and the prose / code styles that later phases consume.

#### Files likely to be created/modified

- `libs/shared-util-theme/src/lib/theme.service.ts` — wrap `init()` body with `isPlatformBrowser(inject(PLATFORM_ID))` guard; early-return on server (regression-critical: desktop + web must remain unchanged in behavior because `isPlatformBrowser` is always true in those contexts)
- `apps/landing/vite.config.ts` — register `@tailwindcss/vite` plugin
- `apps/landing/src/styles.css` — imports `libs/shared-styles-theme/src/index.css`, declares one glob `@source "../../../libs/{shared-util-theme,ui}/**/*.{html,ts}"`, imports `apps/landing/src/styles/prose.css`
- `apps/landing/src/app/app.config.ts` — adds `provideTheme({ theme: 'stone', mode: 'system' })`
- `apps/landing/public/fonts/` — Geist + Geist Mono `.woff2` (copy from `apps/desktop/public/fonts/` — NOT `apps/web/public/fonts/` which has no fonts)
- `apps/landing/src/styles/prose.css` (new) — prose/code styles tuned for marketing-site readability, gated under a `.prose` class

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 2 only.

Wire the shared Mozart theme into apps/landing AND refactor ThemeService for SSR safety:

1. Refactor libs/shared-util-theme/src/lib/theme.service.ts so init() is prerender-safe:
   - Inject PLATFORM_ID; wrap the body of init() with `if (!isPlatformBrowser(inject(PLATFORM_ID))) return;`
   - desktop + web behavior MUST be unchanged (isPlatformBrowser is true in both contexts)
   - If a spec file for ThemeService exists, run it. If not, add a minimal unit test that
     calls init() in a fake-server environment and asserts no throw.

2. Tailwind plumbing (NOT nx-tailwind-sync):
   - In apps/landing/vite.config.ts, register the @tailwindcss/vite plugin.
   - In apps/landing/src/styles.css:
       @import "tailwindcss";
       @source "../../../libs/{shared-util-theme,ui}/**/*.{html,ts}";
       @import "../../../libs/shared-styles-theme/src/index.css";
       @import "./styles/prose.css";

3. In apps/landing/src/app/app.config.ts, register provideTheme({ theme: 'stone',
   mode: 'system' }).

4. Copy Geist + Geist Mono .woff2 files into apps/landing/public/fonts/ from
   apps/desktop/public/fonts/ (verified location). If the source files are missing,
   document the blocker and DO NOT invent a font file.

5. Create apps/landing/src/styles/prose.css with typography for h1-h4, p, ul/ol,
   blockquote, inline code, and code blocks. Style values must derive from existing
   color tokens (--background, --foreground, --muted, --border, --primary) — no
   hard-coded hex.

Do NOT:
- modify libs/shared-styles-theme (CSS-first config works as-is)
- add a new theme or color
- introduce a markdown renderer (that's Phase 5)
- implement the homepage content (that's Phase 4)
- build site-header / site-footer / theme toggle — that's Phase 3

At the end, report:
- files changed
- commands run
- validation result:
  - `pnpm nx run landing:build` exits 0 (proves prerender doesn't crash on ThemeService.init)
  - `pnpm nx run desktop:test` (or desktop:typecheck) still passes — no ThemeService regression
  - fonts resolve in browser devtools (network 200 for both .woff2)
- whether Geist .woff2 files were available, and from where
- next phase to run
```

#### Acceptance criteria

- [ ] `libs/shared-util-theme/src/lib/theme.service.ts` `init()` body guarded by `isPlatformBrowser`.
- [ ] `landing:build` exits 0 (proves prerender survives ThemeService).
- [ ] `desktop` and `web` build/test still pass (no regression).
- [ ] `apps/landing/vite.config.ts` registers `@tailwindcss/vite`.
- [ ] `apps/landing/src/styles.css` imports shared-styles-theme + prose.css; uses one glob `@source`.
- [ ] Geist + Geist Mono `.woff2` present under `apps/landing/public/fonts/` (verified source: `apps/desktop/public/fonts/`).
- [ ] `body` carries `theme-stone` (or selected theme) when site renders.
- [ ] No edits under `libs/shared-styles-theme`.

#### Validation command

```bash
pnpm nx run landing:build
pnpm nx run-many -t test -p shared-util-theme desktop web   # regression guard
pnpm nx run landing:serve   # inspect fonts load
```

#### Risks / notes

- The `@custom-variant dark` declaration in `libs/shared-styles-theme/src/lib/base.css` is essential. With Tailwind v4 via the Vite plugin, the CSS-first `@import "tailwindcss"` must precede the shared-styles import — already ordered above.
- The ThemeService refactor is a regression-critical change to a shared lib. Desktop and web use the same lib — confirm their build + test still pass before continuing to Phase 3.

---

### Phase 3 — Shell & layout (swapped with old Phase 2 — theme now exists)

#### Objective

Build the static shell of the site on top of the theme wired in Phase 2: header, footer, container, theme toggle, base layout. Shell renders styled from first commit because Phase 2 already wired Tailwind + tokens + fonts.

#### Files likely to be created/modified

- `apps/landing/src/app/shell/site-header.component.ts`
- `apps/landing/src/app/shell/site-footer.component.ts`
- `apps/landing/src/app/shell/container.component.ts`
- `apps/landing/src/app/shell/theme-toggle.component.ts` — minimal sun/moon toggle (uses `ThemeService`); mounted in site header; needs `aria-label="Toggle theme"`
- `apps/landing/src/app/app.ts` (renders `<site-header /> <main><router-outlet /></main> <site-footer />`)
- `apps/landing/src/app/shell/nav-model.ts` (typed nav data: primary nav + footer columns)
- `apps/landing/src/app/pages/index.page.ts` (still placeholder; only confirms layout renders around it)

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 3 only.

Build the app shell for apps/landing:
- a site header with the Mozart wordmark and primary nav (Docs, Blog, Changelog)
- a theme toggle (sun/moon icon button, aria-label="Toggle theme") mounted in the header
- a site footer with the four columns specified in the acceptance criteria
- a responsive container (max-w-screen-xl, sensible horizontal padding at sm/lg)
- wire <site-header />, <main>, <site-footer /> into apps/landing/src/app/app.ts
- introduce a single typed nav model file (no signals/state — plain consts) so the
  header and footer pull from the same source

Use:
- Angular standalone components
- Tailwind utilities ONLY in templates (no arbitrary values, no semantic class names,
  no :host — use host: modifier if needed)
- Existing @spartan-ui atoms (e.g. @spartan-ui/separator, @spartan-ui/icon,
  @spartan-ui/button) where they fit. Do NOT modify libs/spartan-ui/**.

Theme already wired in Phase 2 — the toggle calls ThemeService.toggleMode() (or
equivalent existing API). Verify in browser: clicking flips `<html>.dark` and persists
to localStorage `app:color-mode`.

The placeholder homepage route from Phase 1 stays as-is; it just appears inside
the styled shell now.

Do NOT:
- modify ThemeService (Phase 2 already refactored it)
- create docs/blog/changelog routes
- implement the real homepage (hero, workflow, teasers) — that is Phase 4
- add competitor names, "10x", "magic", "replace developers", or "autonomous engineer"
  anywhere

At the end, report:
- files changed
- commands run
- validation result (build + visual check via `nx serve landing` + theme toggle works)
- next phase to run
```

#### Acceptance criteria

- [ ] Header renders Mozart wordmark + nav links to `/docs`, `/blog`, `/changelog` + theme toggle. Links are real `<a>` (`routerLink`) — not buttons.
- [ ] Theme toggle: clicking flips `<html>.dark`, persists to `localStorage` (`app:color-mode`). Toggle has `aria-label="Toggle theme"`.
- [ ] Footer renders four columns: **Company** (Blog, Enterprise, Join us), **Resources** (Docs, Changelog), **Legal** (Privacy, Terms), **Connect** (X, YouTube, LinkedIn, Reddit).
- [ ] External "Connect" links open in a new tab with `rel="noopener noreferrer"`.
- [ ] Layout is responsive: stacks to a single column under `md`, sits in a `max-w-screen-xl` container above.
- [ ] No console errors at `/`. No 404s on header/footer assets.
- [ ] `apps/landing/src/app/shell/nav-model.ts` is the single source of nav strings.
- [ ] Shell renders FULLY STYLED on first commit (Phase 2 theme wiring is now in place).

#### Validation command

```bash
pnpm nx run landing:build
pnpm nx run landing:serve   # then visit http://localhost:<port>/, toggle theme, inspect dark mode
```

#### Risks / notes

- "Enterprise" and "Join us" link targets do not exist yet. Use `#` with `aria-disabled` attribute or stub routes; mark in code (`// TODO Phase 12: real targets`) but **do not invent content**.
- Social URLs for Mozart's accounts are unverified. Use `https://x.com/mozartbuild`, etc. as placeholders and call out in the report so the user can correct them.

---

### Phase 4 — Homepage

#### Objective

Replace the Phase 1 placeholder with the real homepage: hero (with the exact baseline), CTA, workflow section, three feature cards, and teasers for Docs / Blog / Changelog.

#### Files likely to be created/modified

- `apps/landing/src/app/pages/index.page.ts`
- `apps/landing/src/app/pages/_partials/hero.component.ts`
- `apps/landing/src/app/pages/_partials/workflow.component.ts`
- `apps/landing/src/app/pages/_partials/feature-cards.component.ts`
- `apps/landing/src/app/pages/_partials/teasers.component.ts`

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 4 only.

Implement the homepage at apps/landing/src/app/pages/index.page.ts.

Sections, in order:
1. Hero
   - h1 = "Conduct your AI coding agents."
   - tagline (baseline, exact wording, no edits):
     "Agents play the notes. Mozart helps you conduct the masterpiece."
   - Sub-paragraph (one sentence): describe Mozart turning intent into scoped plans,
     isolated Workspaces, Agent Runs, reviews, and clean commits. Use Mozart's product
     vocabulary verbatim — capitalize Project, Task, Workspace, Thread, Agent Run,
     Changes when they appear.
   - Primary CTA button: "Read the docs" → /docs
   - Secondary CTA button: "See the changelog" → /changelog
2. Workflow
   - A short ordered list of 4 steps the user goes through: Intent → Plan →
     Workspace → Review. Concise. No competitor names.
3. Feature cards (3)
   - "Scoped plans" — Mozart converts a Task into a reviewable plan before any
     Agent Run touches code.
   - "Isolated Workspaces" — each attempt lives in its own Workspace; nothing
     touches your main branch until you say so.
   - "Reviewable Changes" — every Agent Run produces a diff snapshot you can
     inspect before committing.
4. Teasers — three cards linking to Docs, Blog, Changelog. Each card surfaces a
   single line. Use placeholder text for now; we'll wire real content latest
   entries in a later phase if needed.

Constraints:
- Use only Tailwind utilities + @spartan-ui atoms.
- No client-side animation libraries. Minimal hover states only.
- Do NOT mention competitors anywhere.
- Do NOT use "10x", "magic", "replace developers", "autonomous engineer".
- Do NOT overclaim ("never breaks", "perfect", "always correct").
- Internal links use routerLink. External links rel="noopener noreferrer".

Do NOT:
- introduce docs/blog/changelog routes (those are Phase 5/7/9)
- introduce content loading (no injectContent yet)
- add forms, email signups, analytics scripts
- modify libs/spartan-ui/**

At the end, report:
- files changed
- commands run
- validation result (build + visual check)
- next phase to run
```

#### Acceptance criteria

- [ ] Baseline appears verbatim — character for character — exactly once on `/`.
- [ ] H1 is a single, scannable line. Sub-paragraph is one sentence.
- [ ] Both CTAs route via `routerLink`.
- [ ] No competitor names appear anywhere in the homepage source.
- [ ] No forbidden language (`10x`, `magic`, `replace developers`, `autonomous engineer`).
- [ ] No internal Git vocabulary (`worktree`, `branch_name`, `HEAD~1`, `agent/wip-*`).
- [ ] Builds without warnings beyond the existing baseline.

#### Validation command

```bash
pnpm nx run landing:build
pnpm nx run landing:serve
grep -RIn "worktree\|branch_name\|10x\|magic engineer\|autonomous engineer" apps/landing/src || echo "clean"
```

#### Risks / notes

- Resist the urge to add a "live demo" / "try in browser" widget — the desktop app cannot be embedded.
- Avoid screenshots until Phase 12 SEO/metadata, when OG image work happens.

---

### Phase 5 — Docs layout

#### Objective

Build the docs reading experience: index page (`/docs`), detail route (`/docs/[slug]`), sidebar navigation, and markdown rendering pipeline. No real docs content yet.

#### Files likely to be created/modified

- `apps/landing/src/app/pages/docs/index.page.ts`
- `apps/landing/src/app/pages/docs/[slug].page.ts`
- `apps/landing/src/app/pages/docs/_layout/docs-shell.component.ts` (sidebar + content slot)
- `apps/landing/src/app/pages/docs/_layout/docs-sidebar.component.ts`
- `apps/landing/src/app/pages/docs/_layout/docs-prev-next.component.ts` (optional)
- `apps/landing/vite.config.ts` — confirm `@analogjs/content` configured for docs frontmatter
- `apps/landing/src/content/docs/phase5-probe.md` (a single throwaway markdown file used to validate the pipeline; deleted in Phase 6)

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 5 only.

Build the docs reading layout for apps/landing:
1. /docs (index): render a sidebar + a short index that lists every docs entry it
   finds via injectContentFiles(). Sort by frontmatter `order` ascending, then
   title.
2. /docs/[slug]: render the matched markdown file via injectContent<DocsAttributes>().
3. Sidebar (apps/landing/src/app/pages/docs/_layout/docs-sidebar.component.ts):
   reuse the same injectContentFiles() list. Highlight the active route. Keep
   plain links (no collapsible sections — there is no nesting yet).
4. Mobile behavior: collapse the sidebar behind a disclosure (use @spartan-ui/sheet
   or a simple <details> if sheet is heavier than needed). Default to open at md+.
5. Prev/next (optional): if implemented, derive from the sorted sidebar list. Skip
   if it adds more than ~30 lines of code.
6. Markdown rendering: rely on @analogjs/content. Wrap the rendered HTML in a
   <div class="prose">. Do NOT install marked, markdown-it, mdx, or remark plugins
   — analog/content is the renderer.
7. Create exactly one placeholder file: apps/landing/src/content/docs/phase5-probe.md
   with frontmatter (title: "Index probe", description: "Phase 5 probe — delete
   in Phase 6", order: 999). This proves the pipeline works. Phase 6 will delete
   it.

Do NOT:
- write the real docs content (getting-started, concepts, workflow, local-first,
  settings) — that's Phase 6
- touch blog or changelog routes
- modify libs/spartan-ui/**

At the end, report:
- files changed
- commands run
- validation result (build + visit /docs and /docs/phase5-probe)
- prerender confirmation that /docs/phase5-probe appears in dist/apps/landing
- next phase to run
```

#### Acceptance criteria

- [ ] `/docs` lists the `phase5-probe` entry.
- [ ] `/docs/phase5-probe` renders the probe markdown as HTML inside `.prose`.
- [ ] Sidebar highlights the active route.
- [ ] Sidebar collapses cleanly on a 375px viewport.
- [ ] Build produces a prerendered `/docs/phase5-probe/index.html` (or equivalent) in `dist/apps/landing/`.
- [ ] Only one placeholder markdown file exists in `apps/landing/src/content/docs/`.

#### Validation command

```bash
pnpm nx run landing:build
ls dist/apps/landing/browser/docs 2>/dev/null || ls dist/apps/landing/docs 2>/dev/null
```

#### Risks / notes

- AnalogJS's content frontmatter is parsed by `front-matter`. Ensure all probe files have valid YAML.
- If `injectContentFiles()` cannot be used at prerender time, fall back to a Vite glob import wrapper. Document the choice in the report.

---

### Phase 6 — Docs content

#### Objective

Author the five initial docs markdown files.

#### Files likely to be created/modified

- `apps/landing/src/content/docs/introduction.md`
- `apps/landing/src/content/docs/install.md`
- `apps/landing/src/content/docs/first-workspace.md`
- `apps/landing/src/content/docs/concepts/local-first.md`
- `apps/landing/src/content/docs/concepts/workspaces-and-worktree.md`
- `apps/landing/src/content/docs/community/we-are-mozart.md` (add discord, github with repo marketplace, repo get started...)

- Delete: `apps/landing/src/content/docs/phase5-probe.md` (probe file from Phase 5)
- add some group with soon badge
  -- How to guide group  
  -- Reference group

#### Agent prompt

````txt
Read docs/landing/plan.md.

Execute Phase 6 only.

Author five markdown docs under apps/landing/src/content/docs/. Each file must have
frontmatter:
  title: <Sentence case title>
  description: <one sentence>
  order: <integer, see below>

Order and contents:

1. order: 1 — getting-started.md
   - 1-paragraph intro: what Mozart is, who it's for, what you'll do in this guide.
   - Section "Install": placeholder install instructions (one-liner) — mark clearly
     as "Coming soon — public download not yet available."
   - Section "Your first Workspace": narrate the flow at a high level: open a
     Project, write a Task, let Mozart draft a Plan, run it inside a Workspace,
     review the Changes, commit.

2. order: 2 — concepts.md
   - Define each vocabulary term as a definition list (or h3 + paragraph):
     Project, Task, Workspace, Thread, Agent Run, Changes.
   - Use the definitions consistent with CLAUDE.md "Product vocabulary".

3. order: 3 — workflow.md
   - Step-by-step walkthrough: Intent → Plan → Workspace → Agent Run → Review →
     Commit. One short section per step. End with a one-sentence "What to read next".

4. order: 4 — local-first.md
   - Explain Mozart's local-first stance: code stays on the developer's machine,
     Workspaces are isolated locally, no auto-sync to a cloud. Mention the future
     app.mozart.build cloud companion as opt-in (no specifics).

5. order: 5 — settings.md
   - Brief tour of the settings surface: theme + appearance, default model,
     workspace defaults. Mark anything not yet implemented as "Coming soon."

Constraints:
- Concise English, short paragraphs, no marketing fluff.
- No competitor names anywhere.
- No "10x", "magic", "replace developers", "autonomous engineer".
- No internal Git vocabulary in body copy ("worktree", "branch_name", "HEAD~1",
  "agent/wip-*"). It is OK to mention "git" or "commit" in user-facing terms.
- Code blocks use fenced ```bash / ```ts / ```yaml.
- Delete apps/landing/src/content/docs/phase5-probe.md after authoring the five files.

Do NOT:
- touch the docs layout components from Phase 5
- author blog or changelog content
- add screenshots or images yet

At the end, report:
- files changed
- commands run
- validation result (build + the five pages render at their /docs/<slug> URLs)
- next phase to run
````

#### Acceptance criteria

- [ ] All five files exist, with valid frontmatter.
- [ ] The Phase 5 probe `phase5-probe.md` is deleted.
- [ ] Each renders at its slug (`/docs/getting-started`, etc.).
- [ ] Sidebar lists them in order 1..5.
- [ ] `grep` for forbidden terms returns zero hits across the five files:

#### Validation command

```bash
pnpm nx run landing:build
grep -RIn "worktree\|branch_name\|HEAD~1\|10x\|magic engineer\|autonomous engineer" apps/landing/src/content/docs/ || echo "clean"
```

#### Risks / notes

- Resist the urge to write real install instructions if the binary download pipeline is not ready — keep them as "Coming soon."

---

### Phase 7 — Blog layout

#### Objective

Blog index + detail route, post metadata, list/card layout, markdown rendering. No real posts yet.

#### Files likely to be created/modified

- `apps/landing/src/app/pages/blog/index.page.ts`
- `apps/landing/src/app/pages/blog/[slug].page.ts`
- `apps/landing/src/app/pages/blog/_partials/post-card.component.ts`
- `apps/landing/src/content/blog/phase7-probe.md` (deleted in Phase 8)

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 7 only.

Build the blog reading experience for apps/landing:
1. /blog (index): list every blog post found via injectContentFiles<BlogAttributes>(),
   sorted by frontmatter `date` descending. Render each as a card (title, date,
   description, "Read post →" link). Cards use existing @spartan-ui/card if it fits;
   otherwise plain Tailwind.
2. /blog/[slug]: render the matched markdown via injectContent<BlogAttributes>()
   inside a <div class="prose"> wrapper. Show a small header with title, date,
   author.
3. Create exactly one probe file: apps/landing/src/content/blog/phase7-probe.md with
   frontmatter (title, description, date: 2026-05-16, author: "Mozart team"). Phase
   8 will replace it.

BlogAttributes type (declare in a colocated file or inline):
  title: string
  description: string
  date: string  // ISO yyyy-mm-dd
  author: string

Do NOT:
- author the real blog post — that's Phase 8
- touch docs or changelog routes
- add an RSS feed, tag system, or category filter
- modify libs/spartan-ui/**

At the end, report:
- files changed
- commands run
- validation result (build + /blog renders, /blog/_probe renders)
- next phase to run
```

#### Acceptance criteria

- [ ] `/blog` shows the probe entry.
- [ ] `/blog/_probe` renders the markdown inside `.prose`.
- [ ] Index is sorted by `date` descending (verify by adding a second short probe with an older date if useful, then delete it before completing the phase).
- [ ] No RSS, tag, or category infrastructure added (out of scope).

#### Validation command

```bash
pnpm nx run landing:build
```

#### Risks / notes

- Date parsing: `new Date(frontmatter.date)` is fine for ISO dates. Don't introduce `dayjs` to the landing app unless prerender requires it (it does not).

---

### Phase 8 — Blog content

#### Objective

Author the first real blog post.

#### Files likely to be created/modified

- `apps/landing/src/content/blog/hello-mozart.md`
- Delete: `apps/landing/src/content/blog/phase7-probe.md`

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 8 only.

Author apps/landing/src/content/blog/hello-mozart.md with frontmatter:
  title: Hello, Mozart
  description: A short note from the team on why we're building Mozart.
  date: 2026-05-16
  author: Mozart team

Content guidance (short, ~250–400 words):
- Open with the baseline:
  > Agents play the notes. Mozart helps you conduct the masterpiece.
- Explain in plain language why developers need a conductor for AI coding agents:
  Tasks turn into Plans, Plans run inside isolated Workspaces, Agent Runs produce
  Changes you can review before committing.
- Be honest about scope: this is an early preview, not a finished product.
- Close with a single CTA pointing to /docs/getting-started.

Constraints:
- No competitor names.
- No "10x", "magic", "replace developers", "autonomous engineer".
- Do not overclaim. No "production-ready", "battle-tested", "enterprise-grade".
- Use Mozart's product vocabulary verbatim.

Delete apps/landing/src/content/blog/phase7-probe.md after authoring.

Do NOT:
- touch blog layout components
- author additional blog posts
- add inline images or screenshots

At the end, report:
- files changed
- commands run
- validation result (build + /blog shows the post, /blog/hello-mozart renders)
- next phase to run
```

#### Acceptance criteria

- [ ] `hello-mozart.md` exists with valid frontmatter.
- [ ] `phaseN-probe.md` is deleted.
- [ ] `/blog` lists exactly one post.
- [ ] `/blog/hello-mozart` renders cleanly with the baseline quoted at the top.
- [ ] `grep` for forbidden terms is clean.

#### Validation command

```bash
pnpm nx run landing:build
grep -RIn "10x\|magic engineer\|autonomous engineer\|production-ready\|battle-tested" apps/landing/src/content/blog/ || echo "clean"
```

#### Risks / notes

- Tone here sets the voice for future posts — keep it understated.

---

### Phase 9 — Changelog layout

#### Objective

Changelog index + optional detail route. Version + date metadata. Readable release-note format.

#### Files likely to be created/modified

- `apps/landing/src/app/pages/changelog/index.page.ts`
- `apps/landing/src/app/pages/changelog/[slug].page.ts` (only if individual entries are detailed enough to warrant their own URL; otherwise omit and inline on the index)
- `apps/landing/src/content/changelog/phase9-probe.md` (deleted in Phase 10)

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 9 only.

Build the changelog layout for apps/landing.

Default: render all entries on /changelog as one long page, newest first, with each
entry as a section (h2 = version + date, body = markdown). This is what most
developer-tool changelogs do and avoids creating thin per-entry pages.

Also wire /changelog/[slug] as an optional detail route. The index can link to
detail entries only if frontmatter has a `detail: true` flag (default false). If
detail is false, the index renders inline and no per-entry page is generated.

ChangelogAttributes:
  version: string  // e.g. "0.0.1"
  date: string     // ISO yyyy-mm-dd
  title: string
  detail?: boolean

Create one probe file: apps/landing/src/content/changelog/phase9-probe.md with version
"0.0.0", date 2026-05-16, title "Layout probe — Phase 9". Phase 10 will replace.

Do NOT:
- author the real v0.1.0-beta.1 changelog — that's Phase 10
- touch docs or blog
- add a per-entry comment/reaction system
- modify libs/spartan-ui/**

At the end, report:
- files changed
- commands run
- validation result (build + /changelog renders the probe entry)
- next phase to run
```

#### Acceptance criteria

- [ ] `/changelog` lists the probe entry inline (since `detail` is unset/false).
- [ ] If `[slug].page.ts` is created, it is generated only when `detail: true`. Otherwise the file is absent.
- [ ] Entries are sorted by `date` descending (with `version` as a tiebreaker if needed).

#### Validation command

```bash
pnpm nx run landing:build
```

#### Risks / notes

- Prerender must not emit `/changelog/<slug>` URLs for entries where `detail` is false. If using `prerender.routes` as a function, filter accordingly.

---

### Phase 10 — Changelog content

#### Objective

Author the first changelog entry.

#### Files likely to be created/modified

- `apps/landing/src/content/changelog/v0-0-1.md`
- Delete: `apps/landing/src/content/changelog/phase9-probe.md`

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 10 only.

Author apps/landing/src/content/changelog/v0-0-1.md with frontmatter:
  version: 0.0.1
  date: 2026-05-16
  title: First public preview

Body (markdown):
- Short opening sentence: this is the first public preview of Mozart.
- Use level-3 section headings:
  ### Added
  ### Changed
  ### Known limitations
- Under "Added": bullet a handful of capabilities derived ONLY from what's actually
  in the repo today (Tasks, Workspaces, Agent Runs, Plans, Reviews, Changes). Do
  not invent features.
- Under "Changed": empty for v0.1.0-beta.1 (or omit entirely if empty looks awkward).
- Under "Known limitations": be honest — preview release, no public download yet,
  cloud companion not available.
- No "Removed" section.

Delete apps/landing/src/content/changelog/phase9-probe.md after authoring.

Constraints:
- No competitor names.
- No "10x", "magic", "replace developers", "autonomous engineer".
- Use Mozart's product vocabulary verbatim.

Do NOT:
- touch changelog layout components
- add a second changelog entry
- author release-automation scripts (out of scope per plan.md §7)

At the end, report:
- files changed
- commands run
- validation result (build + /changelog renders v0.1.0-beta.1)
- next phase to run
```

#### Acceptance criteria

- [ ] `v0-0-1.md` exists with valid frontmatter.
- [ ] `phaseN-probe.md` deleted.
- [ ] `/changelog` renders v0.1.0-beta.1 with the three (or two) section headings.
- [ ] No invented capabilities.

#### Validation command

```bash
pnpm nx run landing:build
```

#### Risks / notes

- The "Added" bullet list is the easiest place to drift into marketing copy — keep each bullet short and technical.

---

### Phase 11 — Legal pages

#### Objective

Privacy + Terms placeholder pages. Clearly marked as non-final legal copy.

#### Files likely to be created/modified

- `apps/landing/src/app/pages/privacy.page.ts`
- `apps/landing/src/app/pages/terms.page.ts`

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 11 only.

Create two pages:

1. apps/landing/src/app/pages/privacy.page.ts
2. apps/landing/src/app/pages/terms.page.ts

Each page must:
- Render inside the same shell + container as the rest of the site.
- Begin with a clearly visible banner / callout (use @spartan-ui/alert if it fits;
  otherwise a plain Tailwind banner): "Placeholder — not final legal text. Will
  be replaced before public launch."
- **Add `<meta name="robots" content="noindex,nofollow">` to BOTH pages while placeholder.**
  Reason: robots.txt allows all crawlers; without noindex, Google may index "not final
  legal text" pages and rank them. Remove the meta tag once real copy lands.
- Contain a short, neutral skeleton with section headings:
  Privacy: Information we collect, How we use it, Sharing, Your choices, Contact.
  Terms: Acceptance, Use of the service, Accounts, Acceptable use, Disclaimers,
  Contact.
- Each section body: a single sentence placeholder like "To be drafted by counsel."
- Include a "Last updated" line showing 2026-05-16.

Do NOT:
- write actual legal language
- promise specific data-handling behavior
- mention specific jurisdictions
- modify libs/spartan-ui/**

At the end, report:
- files changed
- commands run
- validation result (build + /privacy and /terms render with the placeholder banner)
- next phase to run
```

#### Acceptance criteria

- [ ] `/privacy` and `/terms` exist.
- [ ] Both pages display the "Placeholder — not final legal text" banner above the fold.
- [ ] Both pages emit `<meta name="robots" content="noindex,nofollow">` while placeholder.
- [ ] No specific legal claims (no GDPR/CCPA/CalOPPA promises, no jurisdiction).
- [ ] Footer links to `/privacy` and `/terms` resolve to these pages.

#### Validation command

```bash
pnpm nx run landing:build
```

#### Risks / notes

- Even placeholder language can be cited later. Keep it neutral; do not name laws or jurisdictions.

---

### Phase 12 — SEO & metadata

#### Objective

Add per-route titles, descriptions, Open Graph metadata, semantic headings, canonical URLs, sitemap, and robots.txt. No competitor references anywhere.

#### Files likely to be created/modified

- `apps/landing/src/app/shell/seo.service.ts` (or use AnalogJS `MetaTags` API directly inside `.page.ts` files)
- Each `*.page.ts` — wire title/description/OG tags
- `apps/landing/public/robots.txt`
- `apps/landing/public/sitemap.xml` — generated via AnalogJS-native plugin only (no hand-authoring, no bespoke script)
- `apps/landing/public/og-default.png` (1200×630 placeholder; agent must NOT invent an image binary — document as a TODO if the asset is missing)
- `apps/landing/src/index.html` — base `<title>`, `<meta>` defaults, favicon ref

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 12 only.

Add SEO + metadata to apps/landing:

1. Per-route title and description:
   - Use Angular's Title + Meta services (or AnalogJS's metadata helpers) from each
     *.page.ts.
   - Pattern: "<Page title> — Mozart" (homepage = "Mozart — Conduct your AI coding
     agents").
   - Description: one sentence per route, derived from each page's frontmatter
     (for docs/blog/changelog) or from the page's own copy (for homepage/legal).

2. Open Graph + Twitter card meta on every page:
   - og:title, og:description, og:url, og:type ("article" for blog/changelog/docs,
     "website" for everything else), og:image (default /og-default.png; per-post
     override if frontmatter sets `og: <path>`).
   - twitter:card = "summary_large_image".
   - canonical link tag pointing at https://mozart.build<path>.

3. Semantic headings audit:
   - Exactly one h1 per page.
   - Headings nest correctly (no h2 → h4 jumps).

4. apps/landing/public/robots.txt:
   - Allow all crawlers. Reference the sitemap.

5. sitemap.xml:
   - **Use an AnalogJS-native sitemap plugin / blessed pattern only.** Analog's
     prerender API already enumerates routes — reuse it. Do NOT hand-author
     sitemap.xml (goes stale on first new markdown file) and do NOT roll a bespoke
     generator script. If no first-party Analog pattern exists today, defer to
     TODOS.md and ship without — DO NOT leave a stale hand-written file.
   - Must end up including /, /docs, /docs/<slugs>, /blog, /blog/<slugs>,
     /changelog, plus any other prerendered routes.
   - Exclude /privacy and /terms from sitemap.xml until they have real legal copy
     (they also carry noindex from Phase 11).

6. apps/landing/public/og-default.png — MUST exist before this phase completes:
   - 1200×630 PNG, ≤100kb. Two acceptable production paths:
     a) User provides a designed PNG → drop into apps/landing/public/og-default.png
     b) Generate at build time with @vercel/og or satori — Mozart wordmark on dark
        background + the baseline "Agents play the notes. Mozart helps you conduct
        the masterpiece." Use Geist Mono. AnalogJS supports per-route OG via
        @analogjs/content patterns; check there first.
   - Failure mode: if neither path can land in this phase, fail the phase and
     surface as a blocker. Do NOT ship with og:image 404 — broken Twitter/LinkedIn
     previews are a launch-cost.

7. Grep guard the entire app to ensure no competitor names, "10x", "magic engineer",
   "autonomous engineer", "replace developers" leak into copy or alt text.

Do NOT:
- implement analytics (out of scope per plan.md §7)
- add structured data (JSON-LD schema.org) — out of scope for v1; can be a TODO
- modify libs/spartan-ui/**

At the end, report:
- files changed
- commands run
- grep result for forbidden terms
- whether og-default.png is provided
- next phase to run
```

#### Acceptance criteria

- [ ] Every page sets a distinct `<title>` and `<meta name="description">`.
- [ ] Every page emits OG + Twitter card tags.
- [ ] Exactly one `<h1>` per route.
- [ ] `robots.txt` and `sitemap.xml` are present and include all known routes (sitemap via AnalogJS-native plugin; excludes /privacy and /terms while placeholder).
- [ ] `apps/landing/public/og-default.png` exists, is 1200×630, ≤100kb. **No path ships with og:image 404.**
- [ ] No competitor or forbidden terms found by `grep`.

#### Validation command

```bash
pnpm nx run landing:build
grep -RIn "worktree\|branch_name\|HEAD~1\|10x\|magic engineer\|autonomous engineer\|replace developer" apps/landing/src apps/landing/public || echo "clean"
```

#### Risks / notes

- Avoid duplicate meta tags. AnalogJS may inject some defaults — verify with the rendered HTML in `dist/apps/landing/`.
- `og:image` must be an absolute URL once `mozart.build` is live; for build-time it can be a relative path and rewritten by Cloudflare.

---

### Phase 13 — SSG build validation + test layer

#### Objective

Validate the full build pipeline AND add the test layer the plan now requires:

1. ThemeService SSR regression unit test (in `libs/shared-util-theme`).
2. E2E smoke (new `apps/landing-e2e` Playwright project).
3. Build-time SEO assertion script (parses prerendered HTML, asserts title / description / OG / canonical / single-h1 / sitemap presence per route).
4. Final whole-tree forbidden-terms grep across `apps/landing/src/` and `apps/landing/public/`.

#### Files likely to be created/modified

- `libs/shared-util-theme/src/lib/theme.service.spec.ts` (new or extended) — assert `init()` is no-op on server platform.
- `apps/landing-e2e/` (new) — Playwright project with 1 spec covering: route smokes (all 9 routes return 200 with correct H1), theme toggle persists across reload, docs sidebar ordering 1..5.
- `apps/landing/scripts/check-seo.mjs` (new) — small post-build script. Walks `dist/apps/landing/browser/`, asserts every prerendered HTML has unique `<title>`, `<meta description>`, og:\*, canonical link, exactly one `<h1>`. Asserts `sitemap.xml` lists all known routes. Asserts `robots.txt` references sitemap. Wired as a `landing:seo-check` Nx target depending on `landing:build`.
- `apps/landing/project.json` — add `seo-check` target and `e2e` target (or rely on Nx Playwright auto-discovery from `apps/landing-e2e/`).
- Small fixes to whatever the build/lint/test/seo-check surfaces.

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 13 only.

Add the test layer required by the plan, then run a full validation sweep.

Step 1 — Add tests:
1. Unit test (libs/shared-util-theme): ensure ThemeService.init() returns early on
   server platform without throwing. If a spec file exists, extend it; else create
   theme.service.spec.ts. Use Angular's TestBed with PLATFORM_ID = 'server' to
   simulate Node environment.
2. E2E (apps/landing-e2e, new Nx project, Playwright):
   - Generate with `pnpm nx g @nx/playwright:configuration --project=landing-e2e`
     (or @nx/playwright:project if the workspace pattern is a separate project).
   - One spec file with three tests:
     a) "all routes prerender and return 200" — visits /, /docs, every /docs/<slug>,
        /blog, /blog/hello-mozart, /changelog, /privacy, /terms; asserts response
        OK and exactly one <h1> per page.
     b) "theme toggle persists across reload" — clicks toggle on /, asserts
        html.dark applied, reloads, asserts html.dark still applied.
     c) "docs sidebar lists 5 docs in order 1..5" — visits /docs, asserts sidebar
        order matches frontmatter `order`.
3. SEO assertion script (apps/landing/scripts/check-seo.mjs): post-build script
   that fails non-zero if any prerendered route is missing required meta.

Step 2 — Wire targets in apps/landing/project.json:
- `seo-check`: depends on build; executes node scripts/check-seo.mjs
- `e2e`: handled by @nx/playwright plugin auto-discovery (apps/landing-e2e/)

Step 3 — Final hygiene grep:
  grep -RIn "worktree\\|branch_name\\|base_branch\\|HEAD~1\\|agent/wip-\\|10x\\|magic engineer\\|autonomous engineer\\|replace developer\\|production-ready\\|battle-tested\\|enterprise-grade" apps/landing/src apps/landing/public
  Must exit non-zero (no matches found) for the phase to pass.

Step 4 — Run validation sweep (capture output + exit codes):
  pnpm nx run landing:build
  pnpm nx run landing:lint
  pnpm nx run landing:seo-check
  pnpm nx run landing-e2e:e2e
  pnpm nx run shared-util-theme:test
  pnpm nx run desktop:typecheck     # regression guard for ThemeService refactor
  pnpm nx run web:typecheck         # regression guard for ThemeService refactor

After build, inspect dist/apps/landing/:
- Confirm prerendered HTML exists for /, /docs, /docs/<each-slug>, /blog,
  /blog/hello-mozart, /changelog, /privacy, /terms.
- Confirm no SSR-only artifacts (no server.mjs the static host would need).
- Confirm /privacy and /terms HTML contains `<meta name="robots" content="noindex,nofollow">`.

If any command fails:
- Fix the smallest possible problem (typo, missing route entry, missing meta).
- Do NOT refactor.
- Do NOT introduce new dependencies beyond Playwright/Vitest already present.
- If a failure cannot be fixed without scope expansion, capture verbatim as blocker.

Do NOT:
- begin Cloudflare work — that's Phase 14
- modify libs/spartan-ui/**

At the end, report:
- every command run with exit code
- a tree summary of dist/apps/landing/ (top two levels)
- any fixes applied (file + one-line description)
- any unresolved blockers
- next phase to run
```

#### Acceptance criteria

- [ ] `libs/shared-util-theme` has a unit test asserting `ThemeService.init()` is no-op on `PLATFORM_ID = 'server'`.
- [ ] `apps/landing-e2e` exists with a spec covering: route smokes (9 routes), theme persistence, sidebar order.
- [ ] `apps/landing/scripts/check-seo.mjs` exists and is wired as `landing:seo-check` target.
- [ ] `landing:build` exits 0.
- [ ] `landing:lint` exits 0 (or warnings only — no errors).
- [ ] `landing:seo-check` exits 0.
- [ ] `landing-e2e:e2e` exits 0.
- [ ] `shared-util-theme:test` exits 0.
- [ ] `desktop:typecheck` and `web:typecheck` exit 0 (no ThemeService regression).
- [ ] Whole-tree forbidden-terms grep across `apps/landing/src` and `apps/landing/public` returns NO matches.
- [ ] All routes from §2 are prerendered into static HTML.
- [ ] `/privacy` and `/terms` HTML contains `<meta name="robots" content="noindex,nofollow">`.
- [ ] No server-runtime artifacts in `dist/apps/landing/`.

#### Validation command

```bash
pnpm nx run-many -t build lint test seo-check -p landing shared-util-theme && \
  pnpm nx run landing-e2e:e2e
```

#### Risks / notes

- Playwright is already in `devDependencies` (`@playwright/test`) and there's a `@nx/playwright` plugin, so the e2e project is small to add.
- SEO assertion script reads HTML with `cheerio` OR a regex; prefer a tiny regex to avoid adding a new dependency. ~50 lines.

---

### Phase 14 — Cloudflare Pages setup (GitHub integration)

#### Objective

Document the Cloudflare Pages GitHub-integration setup as an executable checklist. **No deploy workflow file is added to the repo** — Cloudflare's GitHub App handles build + deploy + PR previews when a project is connected. The work in this phase produces a doc; the human runs the dashboard steps once.

#### Files likely to be created/modified

- `docs/landing/cloudflare-notes.md` (new, sibling of this plan)
- Optionally `apps/landing/wrangler.toml` if a config skeleton is useful — but only as a documented skeleton, **not connected to any account**.

#### Agent prompt

```txt
Read docs/landing/plan.md.

Execute Phase 14 only.

Write docs/landing/cloudflare-notes.md describing what's needed to deploy the
prerendered apps/landing output to Cloudflare Pages. Do NOT deploy.

Cover, concisely:

1. Build settings to configure in Cloudflare Pages UI:
   - Framework preset: None / Static
   - Build command: pnpm nx run landing:build
   - Build output directory: dist/apps/landing/browser  (verify the actual path
     produced by Phase 13 and document the verified path, not a guess)
   - Root directory: repository root
   - Node version: 20 (matches CI)
   - Package manager: pnpm 11 (set via PNPM_VERSION or via Cloudflare's pnpm support)

2. Environment assumptions:
   - No secrets required for the static site.
   - No analytics keys (analytics is out of scope).
   - mozart.build domain attached to the Cloudflare Pages project.

3. Custom domain / DNS:
   - apex mozart.build → Cloudflare Pages project
   - www.mozart.build → redirect to apex (or vice-versa — document the choice but
     don't make it now)
   - app.mozart.build is a SEPARATE project (future cloud app); do not touch.

4. Headers + redirects (skeleton only, as files we'd add later):
   - apps/landing/public/_headers — cache-control for /fonts/* (immutable, 1y) and
     /assets/* (immutable, 1y). HTML files: short TTL.
   - apps/landing/public/_redirects — placeholder; no redirects required at launch.

5. Deployment checklist (manual, performed by user in Cloudflare dashboard):
   - [ ] Cloudflare Pages → Create project → Connect to Git → select this repo
   - [ ] Production branch: `main`
   - [ ] Build settings as above
   - [ ] Save & Deploy (first build runs)
   - [ ] Attach `mozart.build` apex (and decide `www` redirect direction)
   - [ ] Verify a PR branch produces a `*.pages.dev` preview URL automatically
   - [ ] Add `_headers` / `_redirects` files later if needed (not on first deploy)

6. PR previews are automatic once connected — every PR gets a unique
   `<branch>.<project>.pages.dev` URL with no extra config. This is the killer
   feature for reviewing landing changes; preserves visual review before merge.

7. Explicitly NOT added by this plan: in-repo workflow file (`.github/workflows/landing-deploy.yml`),
   wrangler CLI, Cloudflare API token in repo secrets. The GitHub App handles all
   of this from Cloudflare's side.

Do NOT:
- create a Cloudflare account on the user's behalf
- run wrangler login or wrangler deploy
- add a deploy GitHub Action (Cloudflare's GitHub App is the chosen path)
- modify libs/spartan-ui/**

At the end, report:
- files changed
- the verified build output directory (from Phase 13's tree)
- next steps to hand back to the user for actual deployment
```

#### Acceptance criteria

- [ ] `docs/landing/cloudflare-notes.md` exists and matches the structure above.
- [ ] The build output directory is verified (from Phase 13) and quoted exactly.
- [ ] No Cloudflare account, token, or deploy action created.
- [ ] No `wrangler` commands executed.

#### Validation command

```bash
test -f docs/landing/cloudflare-notes.md && echo "ok"
```

#### Risks / notes

- The actual deploy will surface real issues (build cache, pnpm version, prerender path). Treat this doc as a checklist for that future step.

---

## 4. Task boundaries — explicit do-not-combine list

Per the brief, the following must remain in separate phases:

- CI fix (P0) is small but its own atom — broken CI blocks everything, treat as gate.
- Scaffold (P1), Theme (P2), Shell (P3), Homepage (P4) — Phase 2 and Phase 3 were swapped from the original brief (theme before shell) so Phase 3 ships fully styled instead of unstyled. ThemeService SSR refactor lives in Phase 2.
- Docs layout (P5) and docs content (P6).
- Blog layout (P7) and blog content (P8).
- Changelog layout (P9) and changelog content (P10).
- SEO/metadata (P12) and deployment notes (P14) — separated by Phase 13.
- Phase 13 now ships the test layer (ThemeService SSR regression, E2E smoke, SEO assertion script) — not just build validation. Do not skip.

Each phase produces a small, reviewable diff. The user verifies the manual test before approving the next phase per memory: per-atom manual checkpoint.

---

## 5. Public copy constraints

Applied across **all** copy in `apps/landing/src/**`, every markdown file under `apps/landing/src/content/**`, every `<title>` / `<meta>` / `og:*` / alt text / aria-label.

- **Use the baseline exactly:**
  > Agents play the notes. Mozart helps you conduct the masterpiece.
- Concise English. Active voice. Sentences under ~24 words wherever possible.
- **No competitor references** anywhere — including subtle ones ("unlike X", "drop-in replacement for X", "the open-source alternative").
- **Do not overclaim:** avoid "10x", "magic", "replace developers", "autonomous engineer", "production-ready", "battle-tested", "enterprise-grade", "AI that thinks like you".
- **Use product vocabulary verbatim:** Project, Task, Workspace, Thread, Agent Run, Changes.
- **Do not expose Git/worktree internals:** no `worktree`, `worktree_path`, `branch_name`, `base_branch`, `git worktree`, `detached HEAD`, `HEAD~1`, `checkpoint sha`, `agent/wip-*`. (Allowed only in dev logs — not present on this static site.)

Each content phase has a `grep` guard in its validation command to catch leaks.

---

## 6. Out of scope (do not implement, do not stub)

Marked explicitly per the brief:

- Real authentication (no Clerk on landing — `libs/clerk` stays in `apps/web` only)
- `app.mozart.build` cloud app
- Binary download pipeline (install instructions stay as "Coming soon")
- Payments / pricing
- User accounts / dashboards
- Dynamic CMS — markdown files are the CMS
- Backend API — landing is fully static
- Analytics implementation — no Plausible, Posthog, GA, etc.
- Real legal copy — `/privacy` and `/terms` are placeholder
- GitHub release automation — no Actions, no changesets, no auto-CHANGELOG

If any phase is tempted to scope creep into one of these, stop and surface in the report instead.

---

## 7. Final output (after this plan file is created)

### What was inspected

- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `nx.json`
- `apps/` (desktop, web, plus e2e siblings) and `libs/` (ui, clerk, shared-styles-theme, shared-util-theme)
- `apps/web/project.json`, `apps/web/src/styles.css`, `apps/web/src/main.ts`, `apps/web/src/app/app.config.ts`
- `libs/shared-styles-theme/src/index.css`, `libs/shared-styles-theme/src/lib/base.css`
- `libs/shared-util-theme/src/lib/provide-theme.ts`, `theme.service.ts`
- `.github/workflows/ci.yml`
- `CLAUDE.md` (project rules, product vocabulary, theming constraints)
- Verified that AnalogJS is **not** currently installed.

### Where the plan was created

`docs/landing/plan.md` — this file, at the repository root under `docs/landing/`.

### First implementation prompt to run next

Copy-paste this into the next agent run (**Phase 0 — Fix CI**, then Phase 1):

```txt
Read docs/landing/plan.md.

Execute Phase 0 only.

Fix .github/workflows/ci.yml so it uses pnpm correctly:
- Add a step `pnpm/action-setup@v4` with `version: 11.0.8` BEFORE `actions/setup-node`.
- Change `setup-node`'s `cache:` from `'npm'` to `'pnpm'`.
- Replace `npm ci` with `pnpm install --frozen-lockfile`.

Report the diff and a one-line explanation. Stop after Phase 0; user runs Phase 1
next.
```

Then, when Phase 0 is verified green on CI, proceed to Phase 1:

```txt
Read docs/landing/plan.md.

Execute Phase 1 only.

Scaffold or configure the AnalogJS landing app at apps/landing.
Use the @analogjs/platform Nx generator that matches Angular 21.x and Nx 22.7. Verify
compatibility before installing — if the AnalogJS generator for Nx is not available
or not compatible, fall back to: pnpm add -D @analogjs/platform @analogjs/content
@analogjs/router and hand-author the project.json + vite.config.ts based on the
AnalogJS Angular 21 docs.

Keep the change minimal. The app must:
- live at apps/landing
- bootstrap an empty Angular standalone app
- have one placeholder route ("/") that renders the literal text "Mozart landing — Phase 1 OK"
- build via `pnpm nx run landing:build`
- serve via `pnpm nx run landing:serve`

Do NOT:
- implement the homepage layout, hero, header, or footer
- create docs/blog/changelog content or routes
- wire @mozart/shared-util-theme or @mozart/shared-styles-theme yet
- touch apps/desktop, apps/web, libs/spartan-ui/**, libs/clerk
- modify libs/shared-styles-theme or libs/shared-util-theme
- run `pnpm install` against unrelated dependency updates
- commit or push

If AnalogJS requires a workspace-level Vite or rollup version bump, surface it in
the report rather than silently bumping pinned versions.

At the end, report:
- files changed (paths only)
- commands run (verbatim, with exit code)
- validation result (build pass/fail, serve pass/fail with the placeholder text visible)
- the next phase to run
- any blocker that prevented full completion
```

---

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                             | Runs | Status       | Findings                                                                                                                                   |
| ------------- | --------------------- | ------------------------------- | ---- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 0    | —            | not run (conversion-path TODO suggests offering it before launch)                                                                          |
| Codex Review  | `/codex review`       | Independent 2nd opinion         | 1    | issues_found | 14 challenges raised; major plan rewrites applied (CI broken, Phase 2/3 swap, ThemeService refactor relocation, probes, indexing, sitemap) |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 1    | CLEAR        | 13 issues found, 13 resolved into plan; 0 critical gaps                                                                                    |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 0    | —            | not run (recommended next — plan has heavy UI scope: hero, header, footer, docs sidebar, prose, theme toggle)                              |
| DX Review     | `/plan-devex-review`  | Developer experience gaps       | 0    | —            | not run (n/a — this is a marketing site, not a developer-facing API/CLI)                                                                   |

**CODEX:** Found 14 problems including the broken-CI gate (verified true at `.github/workflows/ci.yml:32-34` — `npm ci` against a pnpm-only repo) and the contradiction between Phase 3's "do not touch shared-util-theme" and its risks-section call to "guard `init()`". Cross-model agreement on all 9 prior eng-review decisions, plus 5 new findings the eng review missed.

**CROSS-MODEL:** Both reviews agreed on AnalogJS choice, ThemeService SSR fix path, pinned versions, font path fix, tests required, budgets needed, sitemap auto-generated. Cross-model disagreement on (a) phase count (Codex pushed for fewer; eng review honored user's atomic-phase preference per saved memory) and (b) conversion path (Codex called it strategic gap; eng review punted to /plan-ceo-review as out-of-scope here).

**UNRESOLVED:** 0 decisions deferred. 4 TODOs captured in `TODOS.md` (install instructions, real legal copy, conversion CTA, sitemap-plugin pattern verification).

**VERDICT:** ENG CLEARED — ready to implement starting with Phase 0 (CI fix). Recommended next: `/plan-design-review` before Phase 3 begins (heavy UI surface), and `/plan-ceo-review` before public launch (conversion-path question).
