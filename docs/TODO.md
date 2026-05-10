# TODO — MOZART v0.0.1 Implementation Operating Manual

**But :** Manuel d'exécution pas-à-pas pour implémenter MOZART v0.0.1 jusqu'aux 2 étapes finales avant release.
**Date :** 2026-05-09
**Stack :** Nx monorepo + PNPM + Angular + Tauri v2 + Rust + Astro

---

## 0. Sources de vérité (à lire avant de coder)

| Domaine | Fichier | Pourquoi |
|---|---|---|
| **Modèle produit** | `specs/mozart-worktree-swarm-design-synthese.md` | Project → Task → Workspace → Run → Candidate → Review → Merge. Le **vocabulaire** central. |
| **Plan technique** | `PLAN-v0.0.1.md` | Architecture, data model (D16), décisions verrouillées (D1–D16), Phase 1 vs Phase 2 |
| **Design system** | `DESIGN.md` | Tokens, layout 3-panel, status colors, typography Geist |
| **CEO scope** | `ceo-plans/2026-05-08-conductor-copycat-v01.md` | Mode HOLD SCOPE, contraintes business |
| **Validation** | `ceo-plans/mozart-platform-validation-2026-05-09.md` | Critères d'acceptation v0.0.1 |
| **Test plan** | `timothy-main-eng-review-test-plan-20260509-072442.md` | E2E + Vitest + cargo test scope |
| **Workflow agent** | `competitors/pane/mozart-implementation-flow.md` | M1→M13, /discussion → /plan → /implement |
| **Setup .claude** | `competitors/pane/pane-claude-setup.md` | Modèle des skills, agents, settings.json |
| **Discipline** | `competitors/pane/blog-1-before-your-first-discussion.md` | AGENTS.md, CLAUDE.md, monorepo rules |
| **Pipeline** | `competitors/pane/blog-2-ai-native-development-workflow.md` | Plan rules, death loop, confidence ≥ 8 |
| **Différenciation** | `competitors/pane/pane-vs-mozart-comparaison.md` | Coordination layer, pas terminal manager |
| **Multi-agent futur** | `competitors/pane/compound-engineering-plugin.md` | /ce-strategy, /ce-compound (post-v0.0.1) |
| **Inspiration UX** | `competitors/conductor/docs/concepts/*.md` | Workflow, parallel agents, workspaces |

> **Règle d'or :** L'utilisateur ne voit jamais "worktree" dans l'UI — il voit `Workspace`, `Task`, `Candidate`, `Review`, `Merge Decision` (specs/mozart-worktree-swarm-design-synthese.md § Règles produit).

---

## 1. Comment démarrer le projet avec Nx (Phase 0 — Bootstrap)

### 1.1 Prérequis machine

```bash
# Node >= 20.11
node --version
# pnpm >= 9
corepack enable && corepack prepare pnpm@latest --activate
# Rust toolchain (Tauri)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Tauri prerequisites Linux (Ubuntu 22+)
sudo apt update && sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
# Tauri CLI (global ou pnpm)
cargo install tauri-cli --version "^2.0.0"
```

📘 Docs :
- Nx install : https://nx.dev/getting-started/installation
- Tauri v2 prereqs : https://v2.tauri.app/start/prerequisites/
- pnpm workspaces : https://pnpm.io/workspaces

### 1.2 Initialiser le monorepo Nx

```bash
# 1) Créer un workspace Nx vide (TS-only preset, on ajoutera Angular/Astro après)
pnpm dlx create-nx-workspace@latest mozart \
  --preset=ts \
  --pm=pnpm \
  --ci=github \
  --useGitHub=true

cd mozart

# 2) Ajouter les générateurs nécessaires
pnpm add -D @nx/angular @nx/js @nx/eslint @nx/vite @nx/playwright @nx/workspace
# Note : il n'existe pas de plugin Astro officiel Nx — on l'ajoutera comme app via run-commands

# 3) Générer apps/web (Angular)
pnpm nx g @nx/angular:app web --directory=apps/web --routing=true --style=scss --standalone=true --bundler=esbuild

# 4) Générer apps/desktop shell (Angular également)
pnpm nx g @nx/angular:app desktop --directory=apps/desktop --routing=true --style=scss --standalone=true --bundler=esbuild

# 5) Générer libs partagées
pnpm nx g @nx/angular:lib spartan --directory=libs/spartan --standalone=true --style=scss
pnpm nx g @nx/js:lib design-tokens --directory=libs/design-tokens --bundler=tsc

# 6) apps/landing (Astro) — manuel
pnpm dlx create-astro@latest apps/landing --template=minimal --typescript=strict --no-git --skip-houston
# Puis ajouter project.json Nx avec executor @nx/js:run-commands
```

📘 Docs Nx :
- Nx Angular tutorial : https://nx.dev/getting-started/tutorials/angular-monorepo-tutorial
- Nx run-commands executor : https://nx.dev/nx-api/nx/executors/run-commands
- Nx + non-JS (Rust/Tauri) : https://nx.dev/recipes/installation/install-non-javascript

### 1.3 Initialiser Tauri dans apps/desktop

```bash
cd apps/desktop
pnpm add -D @tauri-apps/cli
pnpm tauri init
# Réponses :
#   App name: mozart
#   Window title: Mozart
#   Web assets: ../../dist/apps/desktop/browser
#   Dev URL: http://localhost:4200
#   Frontend dev cmd: pnpm nx serve desktop
#   Frontend build cmd: pnpm nx build desktop
```

Puis dans `apps/desktop/project.json` ajouter les targets Tauri :

```json
{
  "tauri-dev": {
    "executor": "nx:run-commands",
    "options": {
      "command": "pnpm tauri dev",
      "cwd": "apps/desktop"
    }
  },
  "tauri-build": {
    "executor": "nx:run-commands",
    "options": {
      "command": "pnpm tauri build",
      "cwd": "apps/desktop"
    }
  }
}
```

📘 Docs Tauri :
- Tauri v2 quickstart : https://v2.tauri.app/start/create-project/
- Tauri + Angular : https://v2.tauri.app/start/frontend/
- tauri-specta (Rust→TS bindings) : https://github.com/specta-rs/tauri-specta
- tauri-plugin-sql : https://v2.tauri.app/plugin/sql/

### 1.4 Vérification d'amorçage

```bash
pnpm nx graph                       # Visualiser le graphe (preuve que les apps/libs sont liés)
pnpm nx run-many -t typecheck       # Doit passer
pnpm nx run-many -t lint            # Doit passer
pnpm nx run desktop:tauri-dev       # Tauri ouvre une fenêtre vide
```

---

## 2. Mise en place de Claude Code (.claude/) — Phase 0 (suite)

### 2.1 AGENTS.md à la racine (< 100 lignes)

Création du fichier `AGENTS.md` au root du repo avec :
- Project structure (les 3 apps + 2 libs)
- Build commands : `pnpm nx run-many -t typecheck/lint/test`, `pnpm nx run desktop:tauri-dev`
- Conventions : 2-space indent, camelCase vars, PascalCase components, kebab-case files
- Imports : alias `@mozart/*` only, jamais de `../../`
- Vocabulaire produit : Workspace (UI) ≠ worktree (impl), Candidate, Review, Merge Decision
- Pointeurs vers `CLAUDE.md`, `PLAN-v0.0.1.md`, `DESIGN.md`, `specs/`

### 2.2 CLAUDE.md à la racine (manuel détaillé)

Sections obligatoires :
- Architecture (extrait de `PLAN-v0.0.1.md` § Architecture)
- Data model 6 tables (extrait de `PLAN-v0.0.1.md` § Data Model D16)
- IPC commands tauri-specta (extrait du même PLAN)
- Design tokens (extrait de `DESIGN.md`)
- Guardrails sandbox (D13) : cwd lock, checkpoint, jamais `--dangerously-skip-permissions`
- Vocabulaire produit (depuis `specs/mozart-worktree-swarm-design-synthese.md`)

### 2.3 Structure `.claude/` minimale (inspirée Pane)

```
.claude/
├── settings.json
├── agents/
│   ├── codebase-explorer.md      # Read/Grep/Glob, doc seulement, file:line
│   ├── implementer.md            # Exécute plans, typecheck/lint/format après chaque chunk
│   ├── plan-reviewer.md          # Vérifie repo accuracy, intent fidelity
│   └── researcher.md             # Web + llms.txt, citations
├── skills/
│   ├── discussion/SKILL.md       # Conversation only, écrit .context/context.md
│   ├── plan/SKILL.md             # Génère ./tmp/ready-plans/, loop avec plan-reviewer
│   ├── implement/SKILL.md        # Lit ready-plans/, parallélise, déplace vers done-plans/
│   └── commit/SKILL.md           # Groupe par done-plans/, jamais git add .
└── hooks/
    └── block-destructive.sh      # Bloque rm -rf, git push --force, tauri build sur non-main
```

> Source pour les définitions : `competitors/pane/pane-claude-setup.md`

### 2.4 Compound Engineering (optionnel mais recommandé)

```bash
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering
/ce-strategy   # Crée STRATEGY.md ancré au repo
```

> Référence : `competitors/pane/compound-engineering-plugin.md`

### 2.5 Cycle d'exécution attendu pour CHAQUE milestone

```
/discussion <milestone goal>           # Comprendre le code existant + décider
       ↓ (écrit .context/context.md)
/plan <milestone>                      # Génère plan dans ./tmp/ready-plans/
       ↓ (loop plan-reviewer jusqu'à confiance ≥ 8)
/implement                             # Exécute, parallélise, valide
       ↓ (déplace vers done-plans/)
pnpm nx run-many -t typecheck/lint/test  # Validation gate
       ↓
/commit                                # Un commit par done-plan
       ↓
/ce-compound                           # Capitaliser apprentissage (optionnel)
```

---

## 3. Phase 1 — Desktop Core (M1 → M9)

> **Toute la Phase 1 doit fonctionner en local avant que la Phase 2 démarre.**
> Détail complet de chaque milestone : `competitors/pane/mozart-implementation-flow.md`

### M1 — Nx Monorepo Bootstrap ✅ (couvert section 1.2-1.4)

- [x] `pnpm-workspace.yaml` + `nx.json` créés
- [x] `apps/desktop` + `apps/web` scaffoldés (Angular 22 + esbuild)
- [x] `@spartan-ng/cli` installé (workspace root)
- [ ] ~~`apps/landing`~~ → **Analog.js** (décision M10, pas Astro)
- [ ] ~~`libs/design-tokens`~~ → **TailwindCSS theme** (pas de lib SCSS custom)
- [ ] Tauri init dans `apps/desktop` avec targets Nx ← **NEXT**
- [ ] `pnpm nx graph` montre les dépendances correctement
- [ ] `pnpm nx run-many -t typecheck` clean

**Contexte à donner à Claude :** "Lis `PLAN-v0.0.1.md` § Architecture (lignes 85-170) et `TODO.md` § 1. Bootstrap le monorepo selon la structure exacte spécifiée. Aucune libre interprétation de la structure."

### M2 — TailwindCSS v4 + Spartan Hlm ⚠️ (design-tokens → Tailwind)

**Décision :** `libs/design-tokens` abandonnée. Les tokens DESIGN.md sont portés en **TailwindCSS v4 theme** dans `tailwind.config.ts` partagé entre les apps.

**Réfs :** `DESIGN.md` complet, `competitors/pane/mozart-implementation-flow.md` § M2

- [ ] Installer TailwindCSS v4 dans `apps/desktop` + `apps/web`
- [ ] `tailwind.config.ts` à la racine — porter tokens DESIGN.md (bg, border, text, status, diff, accent, radius, spacing) en CSS variables Tailwind
- [ ] Polices Geist + Geist Mono (`@fontsource/geist` ou assets bundlés dans `apps/desktop/public/fonts/`)
- [ ] Composants Spartan via `pnpm hlm add button badge tooltip separator` (standalone components)
- [ ] Smoke test : composant Angular avec classes Tailwind + Spartan pill rend correctement

**/discussion à lancer :**
```
"Lis DESIGN.md complet. Comment porter les tokens CSS custom en TailwindCSS v4 theme ?
TailwindCSS v4 avec Angular 22 + esbuild : config via @import ou tailwind.config.ts ?
Spartan Hlm standalone components : comment les importer dans une app Angular standalone ?"
```

### M3 — Tauri Shell : Layout 3-Panel

**Réfs :** `DESIGN.md` § Layout, `competitors/pane/mozart-implementation-flow.md` § M3

- [ ] `src-tauri/tauri.conf.json` — window dark, min-width 900px, identifier `build.mozart.app`
- [ ] `src-tauri/src/main.rs` — config window
- [ ] `app-shell.component.ts` — layout 3-panel exact (sidebar 220px / center flex / right 320px)
- [ ] Sidebar component : project list placeholder + status dots
- [ ] Center panel : agent stream placeholder + empty state ("No task running")
- [ ] Right panel : diff viewer placeholder + terminal placeholder (split vertical)
- [ ] Top bar 36px : logo Mozart + workspace name
- [ ] **PAS de mot "worktree" dans l'UI** (cf. specs/mozart-worktree-swarm-design-synthese.md)

**/discussion à lancer :**
```
"Lis DESIGN.md § Layout + specs/mozart-worktree-swarm-design-synthese.md § UI fonctionnelle recommandée.
Le shell doit-il être un seul composant ou des router-outlets imbriqués pour les 3 panneaux ?
Quel Tauri window config matche notre dark IDE aesthetic (vibrancy macOS, decorations, transparent title bar) ?"
```

### M4 — SQLite Schema (D16) + Bindings tauri-specta

**Réfs :** `PLAN-v0.0.1.md` § Data Model (lignes 174-279), § Desktop runtime (lignes 118-170)

- [ ] `Cargo.toml` — `tauri-plugin-sql`, `tauri-specta`, `serde`, `tokio`, `rusqlite` (via plugin)
- [ ] `src-tauri/migrations/001_init.sql` — les 6 tables EXACTEMENT comme dans PLAN-v0.0.1.md (repos, tasks, workspaces, threads, agent_runs, agent_events, workspace_changes, events_outbox, config + index)
- [ ] `src-tauri/src/db.rs` — connection via tauri-plugin-sql, WAL mode, busy_timeout 5000
- [ ] `src-tauri/src/error.rs` — `AppError` enum exporté via tauri-specta
- [ ] `src-tauri/src/commands/workspace.rs` — `create_workspace`, `list_workspaces`, `get_workspace_diff` stubs
- [ ] tauri-specta génère `apps/desktop/src/app/_bindings/` à chaque build
- [ ] Angular `workspace.service.ts` consomme les bindings TS générés
- [ ] `cargo test` : tests création schema, CRUD basique, WAL actif

**/discussion à lancer :**
```
"Lis PLAN-v0.0.1.md § Data Model lignes 174-279. Reproduis EXACTEMENT le schéma SQL fourni 
(les 6 tables + events_outbox + config + tous les index). 
Comment tauri-plugin-sql gère les migrations versionnées ? 
Comment tauri-specta génère-t-il automatiquement les types TS au build ?"
```

### M5 — Détection Claude Code CLI + Auth PTY

**Réfs :** `PLAN-v0.0.1.md` D5+D9+A5 (Tier collapse), `competitors/pane/mozart-implementation-flow.md` § M5

- [ ] `src-tauri/src/commands/claude_cli.rs` — `check_claude_installed()` (which/where claude)
- [ ] `detect_claude_auth()` → enum `ClaudeAuthState { Authed | NotAuthed | NotInstalled }`
- [ ] `src-tauri/src/pty/mod.rs` — spawner via `portable-pty`
- [ ] `start_claude_login_pty(channel)` — stream stdout via Tauri Channel
- [ ] `keychain.rs` — keyring + fallback fichier 0600 (Linux headless)
- [ ] Angular `setup.component.ts` — onboarding screen avec état auth explicite (Q2 du plan)
- [ ] Angular `pty-terminal.component.ts` — affiche stream PTY
- [ ] **Q2 : l'utilisateur peut override l'état détecté** (évite silent fallthrough)

**/discussion à lancer :**
```
"Lis PLAN-v0.0.1.md décisions D5, D9, A5, Q2.
Quelle crate Rust pour PTY cross-platform (portable-pty vs pty-process) ?
Comment Tauri Channel<T> stream-t-il vers Angular ?
Que renvoie `claude` CLI quand non authentifié ? Comment détecte-t-on l'état authentifié sans tokens ?"
```

### M6 — Workspaces (Worktree invisible)

**Réfs :** `specs/mozart-worktree-swarm-design-synthese.md` § Concepts fonctionnels, `PLAN-v0.0.1.md` D2

- [ ] `src-tauri/src/git_query.rs` — `validate_repo`, `list_branches`, `check_git_available`
- [ ] `src-tauri/src/branch_name.rs` — slugify + `git check-ref-format` gate
- [ ] `src-tauri/src/worktree.rs` — `create`, `remove`, `checkpoint` (jamais exposé tel quel à l'UI)
- [ ] `create_workspace(repo_id, base_branch, task_text)` command (D16) :
  1. Crée Task en DB
  2. Crée Workspace avec `branch_name = 'agent/wip-{shortid}'`
  3. `git worktree add` vers chemin standard `~/.mozart/worktrees/{workspace_id}/`
  4. Auto-copie `.env*` du repo source (Pane pattern)
  5. Crée Thread (1:1)
- [ ] Angular `add-workspace-dialog.component.ts` — file picker + validation repo
- [ ] Angular sidebar `workspace-list.component.ts` — affiche Workspace cards (PAS "worktree")
- [ ] **D2 : pas de clone GitHub in-app — local folder only**

**/discussion à lancer :**
```
"Lis specs/mozart-worktree-swarm-design-synthese.md § Concepts fonctionnels (Project/Task/Workspace).
Lis PLAN-v0.0.1.md § Data Model (workspaces, threads tables) + D2.
Où vivent physiquement les worktrees ? ~/.mozart/worktrees/{workspace_id} ou inline ?
Comment fait-on l'auto-copy .env tout en respectant gitignore ?
Le flux 'Add Workspace' UI : un seul dialog ou un wizard 2 étapes (repo → task) ?"
```

### M7 — Agent Loop (Claude CLI streaming)

**Réfs :** `PLAN-v0.0.1.md` D4+D5+D13+Q3 (parser minimal), `competitors/pane/mozart-implementation-flow.md` § M7

- [ ] `src-tauri/src/sandbox.rs` — guardrails : cwd LOCK forcé sur `worktree_path`, jamais ailleurs
- [ ] **D13 :** `git commit --allow-empty -am "checkpoint before run-{run_id}"` AVANT spawn (capture sha)
- [ ] `src-tauri/src/claude_cli.rs` — spawn `claude` subprocess, cwd=worktree, env hérité (risque documenté)
- [ ] **JAMAIS `--dangerously-skip-permissions`**
- [ ] Parser Q3 minimal : stdout → `StreamEvent` enum (token | tool_call | cli_output | status | error)
- [ ] `start_agent_run(workspace_id, prompt)` + `stop_agent_run(run_id)` commands
- [ ] Persiste `AgentEvents` dans SQLite + stream via Tauri Channel
- [ ] `AgentRun.status` lifecycle : initializing → running → done/error/stopped/crashed
- [ ] Angular `agent-stream.component.ts` (center panel) — render streaming events
- [ ] Angular `agent-controls.component.ts` — boutons Start / Stop / Discard
- [ ] D4 : capacité = 1 par workspace, runs séquentiels

**/discussion à lancer :**
```
"Lis PLAN-v0.0.1.md décisions D4, D5, D13 (sandbox), Q3 (parser minimal).
Quelle est la sortie EXACTE de `claude` CLI en mode non-interactif ? Quels formats events parse-t-on ?
Comment fait-on un git commit checkpoint atomique avant chaque run et garde le sha ?
Quelle stratégie de back-pressure si le stream est trop rapide pour la DB ?"
```

### M8 — Diff Viewer + Git Decisions

**Réfs :** `DESIGN.md` § Diff (couleurs), `specs/mozart-worktree-swarm-design-synthese.md` § Merge Decision, `competitors/pane/mozart-implementation-flow.md` § M8

- [ ] `get_workspace_diff(workspace_id)` — `git diff HEAD~1` vs checkpoint, parsed
- [ ] `WorkspaceChanges` row écrit après chaque run (files_added/modified/deleted)
- [ ] Angular `diff-viewer.component.ts` — syntax-highlight maison avec tokens `--diff-add-bg/text/--diff-del-bg/text`
- [ ] Boutons keyboard : `⌘Enter` commit, `⌘D` discard, `⌘M` merge (synthèse vers base_branch)
- [ ] `commit_changes(workspace_id, message)`
- [ ] `discard_changes(workspace_id)` → reset hard au checkpoint
- [ ] `merge_to_base(workspace_id, strategy)` (semi-assisté v0.0.1, pas auto)
- [ ] **Présenter merge comme une décision produit** (specs § règle 5) : pourquoi, risques, fichiers, réversible ?

**/discussion à lancer :**
```
"Lis DESIGN.md § Diff (couleurs --diff-add-* et --diff-del-*).
Lis specs/mozart-worktree-swarm-design-synthese.md § Merge Decision (la merge est une décision, pas un bouton).
Que dois-je afficher dans le panneau de merge decision pour respecter cette règle ?
Quelle lib pour syntax-highlight (Shiki côté build, prismjs côté runtime, ou hand-rolled) ?
Comment résume-t-on un diff en risques/fichiers/tests automatiquement v0.0.1 (heuristiques simples) ?"
```

### M9 — Onboarding Tour

**Réfs :** `PLAN-v0.0.1.md` D6+A7

- [ ] Repo public séparé `mozart-quickstart-demo` (HTML/CSS/JS + tour-script.json)
- [ ] Snapshot bundlé dans `apps/desktop/resources/quickstart-demo.tar.gz`
- [ ] `tour_repo.rs` — extract bundled snapshot + try clone latest en background (A7)
- [ ] Angular `onboarding.component.ts` — overlay au premier launch
- [ ] Parser `tour-script.json` step-by-step sur le shell 3-panel
- [ ] Flag `config.first_launch_done` en DB

**/discussion à lancer :**
```
"Lis PLAN-v0.0.1.md décisions D6 et A7.
À quoi ressemble tour-script.json (steps avec target selector + tooltip text) ?
Comment fait-on un fallback gracieux si la clone GitHub échoue (offline) ?"
```

---

### 🚦 Phase 1 Completion Gate (à valider avant Phase 2)

```bash
pnpm nx run-many -t typecheck      # ✅ clean
pnpm nx run-many -t lint           # ✅ clean
pnpm nx run-many -t test           # ✅ Vitest pass (Angular + libs)
cd apps/desktop/src-tauri && cargo test  # ✅ Rust unit tests
pnpm nx run desktop:tauri-dev      # ✅ App ouvre
```

Manuel smoke test (référencer `timothy-main-eng-review-test-plan-...` pour le détail) :
- [ ] Tauri shell ouvre (3-panel layout)
- [ ] Détection Claude CLI → flux auth si nécessaire
- [ ] Add local git repo → Workspace card apparaît dans sidebar
- [ ] Start agent run → streaming visible en center panel
- [ ] Stop agent run → kill clean du subprocess
- [ ] Diff viewer affiche changes après run
- [ ] Commit / Discard / Merge buttons fonctionnent
- [ ] Onboarding tour complète

---

## 4. Phase 2 — Production Polish (M10 → M13)

> Phase 2 ship dans la même release v0.0.1. **M12 et M13 = les 2 étapes finales pré-release.**

### M10 — Landing (apps/landing) ⚠️ Astro abandonné → Analog.js TBD

**Décision :** Astro abandonné. Stack Angular-only dans le monorepo. Landing = **Analog.js** (Angular meta-framework, SSG/SSR) ou intégrée dans `apps/web` comme route publique. À trancher en début de M10.

**Réfs :** `PLAN-v0.0.1.md` § Architecture A3 (Cloudflare subdomain)

- [ ] Trancher : Analog.js app séparée (`apps/landing`) **ou** routes publiques dans `apps/web`
- [ ] Hero : "Mozart — Coordination layer for AI coding agents"
- [ ] Section features avec GIFs desktop
- [ ] Boutons download par platform (lien GitHub Releases dynamique)
- [ ] Email lead capture form (avant download)
- [ ] Build SSG + Deploy Cloudflare Pages → `mozart.build`

**Contexte Claude (si Analog.js) :**
```
"Analog.js dans un Nx monorepo Angular existant : générateur @analogjs/platform ou manuel ?
Comment Analog.js SSG gère les routes dynamiques pour les downloads ?
Partage des composants Spartan entre apps/landing (Analog) et apps/web (Angular) ?"
```

### M11 — Angular Web + Clerk OAuth (apps/web)

**Réfs :** `PLAN-v0.0.1.md` A4 (Clerk via @clerk/clerk-js), § Architecture lignes 95-97

- [ ] `@clerk/clerk-js` + `apps/web/src/app/services/clerk.service.ts` (PAS de shared lib — A4)
- [ ] Routes : `/`, `/login`, `/sso-callback`, `/downloads` (gated)
- [ ] Sign-in / sign-up via GitHub + Google providers
- [ ] `/downloads` protégée → liste binaires GitHub Releases
- [ ] Build Angular
- [ ] Deploy Cloudflare Pages → `app.mozart.build`

**Contexte Claude :**
```
"Lis PLAN-v0.0.1.md décision A4 (Clerk wrap direct, pas de shared lib Angular).
Comment intégrer @clerk/clerk-js dans Angular standalone (signals) sans SDK officiel ?
Cookies sur app.mozart.build vs mozart.build (subdomain auth flow) ?"
```

### 🚦 M12 — PostHog Telemetry (Rust Outbox) — AVANT-DERNIÈRE étape pré-release

**Réfs :** `PLAN-v0.0.1.md` D10+D14+A6+Q4 (writer task séparé)

- [ ] `src-tauri/src/telemetry.rs` — enqueue dans `events_outbox` SQLite
- [ ] Background task drain via `reqwest` raw POST → PostHog `/capture/`
- [ ] Anonymous `device_id` only — JAMAIS PII
- [ ] First-launch banner opt-out (D14, pattern Conductor)
- [ ] Writer task séparé via WAL (Q4) — zéro contention
- [ ] Tracker events : `app_launched`, `workspace_created`, `agent_run_started/completed`, `merge_decision`
- [ ] `track_event(event_name, props)` Tauri command exposée
- [ ] Tests : drain retry logic, offline survival

**Contexte Claude :**
```
"Lis PLAN-v0.0.1.md décisions D10, D14, A6, Q4.
Comment garantir zéro contention WAL avec un writer task séparé pour telemetry ?
Backoff strategy pour drain : exponentiel ? Cap 5 attempts (idx_outbox_enqueued WHERE attempts < 5) ?
Dans le banner opt-out, quel wording ? (Voir pattern Conductor docs/reference/privacy.md)."
```

### 🚦 M13 — CI Matrix + GitHub Releases — DERNIÈRE étape pré-release

**Réfs :** `PLAN-v0.0.1.md` D7+T1+T2+T3+P1

- [ ] `.github/workflows/ci.yml` — matrix : ubuntu-latest, macos-latest, windows-latest
- [ ] Jobs : typecheck, lint, vitest, cargo test, smoke E2E (T2 : tauri-driver Linux only)
- [ ] T3 : hard gate (all must pass) avant merge
- [ ] `.github/workflows/release.yml` — trigger sur tag `v0.0.*`
- [ ] Tauri build par platform → `.dmg` (macOS unsigned), `.exe` (Windows unsigned), `.AppImage` (Linux)
- [ ] Note : code signing macOS DEFERRED v0.0.2 (D pas dans plan, mais manqué — flag dans release notes)
- [ ] `SHA256SUMS` généré et attaché à la release
- [ ] P1 : Angular bundle budgets dans `angular.json` (500KB warn / 750KB error initial)
- [ ] Release notes générés depuis CHANGELOG (auto via Nx ou manuel)

**Contexte Claude :**
```
"Lis PLAN-v0.0.1.md décisions D7, T1, T2, T3, P1.
Comment configurer la matrix GitHub Actions pour 3 OS avec cache Rust + cache pnpm ?
Tauri release artifacts : où les trouve-t-on dans target/release/bundle/ et comment upload via gh ?
Comment générer SHA256SUMS reproductible cross-platform ?
T2 smoke E2E avec tauri-driver : seulement Linux ou aussi macOS ?"
```

📘 Docs CI/Release :
- GitHub Actions matrix : https://docs.github.com/en/actions/using-jobs/using-a-matrix-for-your-jobs
- Tauri GitHub Action : https://v2.tauri.app/distribute/pipelines/github/
- gh release : https://cli.github.com/manual/gh_release_create

---

## 5. 🚦 Pre-Release Final Gate (avant `git tag v0.0.1`)

```bash
# Nx full check
pnpm nx run-many -t typecheck,lint,test,build

# Rust full check
cd apps/desktop/src-tauri && cargo test && cargo clippy -- -D warnings

# E2E smoke (T2)
pnpm nx run desktop:e2e   # Playwright + tauri-driver Linux

# Bundle budget (P1)
pnpm nx build web  # vérifie 500KB/750KB budgets

# Privacy
grep -rn "PII\|user_email\|user_name" apps/desktop/src-tauri  # Doit retourner 0 résultats

# Documentation
ls -la README.md AGENTS.md CLAUDE.md PLAN-v0.0.1.md DESIGN.md  # Tous présents
```

Manuel review final selon `competitors/pane/blog-2-ai-native-development-workflow.md` § Human Review :
- [ ] Single responsibility : une seule façon de faire chaque chose ?
- [ ] Re-use vs re-create ?
- [ ] PR scopée à un objectif unique ?
- [ ] Anti-patterns ? (async imports en milieu de fichier, etc.)
- [ ] Score refactor ≥ 9.5/10

---

## 6. Règles transverses (à respecter à chaque milestone)

### 6.1 The One-Way Rule (la plus critique)

> "Si deux hooks existent pour faire X, le LLM en créera un troisième." — Pane blog-2

Avant d'ajouter un pattern :
1. Grep le codebase pour patterns similaires
2. Si trouvé : étendre, ne pas dupliquer
3. Si non trouvé : documenter dans `CLAUDE.md` comme pattern canonique

### 6.2 Validation Loop (chaque tâche atomique)

```bash
pnpm nx run-many -t typecheck,lint,test
cd apps/desktop/src-tauri && cargo test
```

**Jamais** passer à la tâche suivante avec un gate failing.

### 6.3 Commit Discipline

- Un commit par tâche atomique complétée
- Jamais `git add .`
- Format : `feat(M{N}): <what>` ou `fix(M{N}): <what>` ou `chore(M{N}): <what>`

### 6.4 Death Loop Prevention

Si un agent bloque > 30 min sur une tâche :
1. STOP le run
2. Retour `/discussion` (pas `/implement` à nouveau)
3. Décomposer plus fin (la tâche est trop grosse)
4. Jamais pusher plus fort sur une approche cassée

### 6.5 Vocabulaire produit (specs/)

| ❌ Jamais dans l'UI | ✅ Toujours dans l'UI |
|---|---|
| worktree | Workspace |
| branch (technique) | Task / Candidate |
| detached HEAD | (caché) |
| `git worktree add` | "Create workspace" |
| commit checkpoint | "Snapshot before run" |

### 6.6 Cycle compound (post-milestone)

Après chaque milestone validé :
- `/ce-compound` (si plugin installé) ou édition manuelle de `CLAUDE.md`
- Documenter : pattern utilisé, gotcha rencontré, raison d'une décision
- Le but : que le prochain agent ne réapprenne pas la même leçon

---

## 7. Skills personnalisés à créer dans `.claude/skills/`

> Templates complets dans `competitors/pane/pane-claude-setup.md`. Adapter les noms aux commandes de validation MOZART.

### `/discussion` (skill)

```yaml
name: discussion
description: Conversation only — explore codebase + decide before coding. Spawns codebase-explorer and researcher subagents. Writes summary to .context/context.md.
allowed-tools: Read, Grep, Glob, LS, Task(codebase-explorer), Task(researcher)
forbidden-tools: Edit, Write, Bash(git push), Bash(rm)
```

### `/plan` (skill)

```yaml
name: plan
description: Generate implementation plan in ./tmp/ready-plans/{milestone}.md. Auto-loop with plan-reviewer until confidence ≥ 8/10. No backwards compat. No aspirations, only instructions.
allowed-tools: Read, Grep, Glob, Write, Task(plan-reviewer), Task(researcher)
```

### `/implement` (skill)

```yaml
name: implement
description: Read plan from ./tmp/ready-plans/, parallelize chunks respecting dependencies, run typecheck+lint+cargo test after each chunk, move to ./tmp/done-plans/ on success.
validation: pnpm nx run-many -t typecheck,lint && cd apps/desktop/src-tauri && cargo test
allowed-tools: Read, Edit, Write, Bash(pnpm *), Bash(cargo *), Task(implementer)
```

### `/commit` (skill)

```yaml
name: commit
description: Group commits by done-plans/. Never git add . — match changed files to plan they belong to. Format: feat(M{N}): <what>.
allowed-tools: Bash(git status), Bash(git add <specific>), Bash(git commit), Read
```

---

## 8. Commandes Nx utiles (cheat sheet)

```bash
# Daily dev
pnpm nx run desktop:tauri-dev          # Dev mode Tauri (hot reload Angular + Rust)
pnpm nx serve web                       # Apps/web dev (port 4201)
pnpm nx dev landing                     # Astro dev (port 4321)

# Validation
pnpm nx run-many -t typecheck           # Tous les projets
pnpm nx run desktop:typecheck           # Un seul
pnpm nx affected -t test --base=main    # Seulement ce qui change
pnpm nx graph                           # Visualiser le graphe

# Builds
pnpm nx run desktop:tauri-build         # Build production Tauri
pnpm nx build web                       # Build web Angular
pnpm nx build landing                   # Build Astro static

# Génération
pnpm nx g @nx/angular:component foo --project=desktop --standalone
pnpm nx g @nx/js:lib utils --directory=libs/utils

# Cleanup
pnpm nx reset                           # Clear cache si bizarrerie
```

📘 Toute la doc Nx : https://nx.dev

---

## 9. Liens documentation rapides

- **Nx** : https://nx.dev/getting-started/intro
- **Nx Angular** : https://nx.dev/nx-api/angular
- **Tauri v2** : https://v2.tauri.app/
- **tauri-specta** : https://github.com/specta-rs/tauri-specta
- **tauri-plugin-sql** : https://v2.tauri.app/plugin/sql/
- **Angular standalone** : https://angular.dev/guide/components/importing
- **Astro** : https://docs.astro.build
- **Clerk JS** : https://clerk.com/docs/quickstarts/javascript
- **Cloudflare Pages** : https://developers.cloudflare.com/pages/
- **PostHog HTTP API** : https://posthog.com/docs/api/post-only-endpoints
- **portable-pty (Rust)** : https://docs.rs/portable-pty
- **Geist font** : https://github.com/vercel/geist-font
- **Pane .claude reference** : https://github.com/dcouple/Pane/tree/main/.claude
- **Compound Engineering** : https://github.com/EveryInc/compound-engineering-plugin

---

## 10. État courant (TODO master)

- [ ] **Phase 0 — Bootstrap** (partiel ✅)
  - [x] M0.1 — Prereqs machine (Node 20+, pnpm 9+, Rust, Tauri deps)
  - [x] M0.2 — `create-nx-workspace mozart --preset=ts`
  - [x] M0.3 — Générer `apps/desktop` + `apps/web` + `@spartan-ng/cli`
  - [ ] M0.4 — **Tauri init dans `apps/desktop`** ← NEXT
  - [ ] M0.5 — `AGENTS.md` racine
  - [ ] M0.6 — `CLAUDE.md` racine
  - [ ] M0.7 — `.claude/` dir (settings + 4 agents + 4 skills)
  - [ ] M0.8 — Compound Engineering plugin (optionnel) + `/ce-strategy`
- [ ] **Phase 1 — Desktop Core**
  - [ ] M1 — Nx monorepo bootstrap final (Tauri + typecheck green)
  - [ ] M2 — TailwindCSS v4 + Spartan Hlm (plus design-tokens lib)
  - [ ] M3 — Tauri shell 3-panel
  - [ ] M4 — SQLite schema + tauri-specta bindings
  - [ ] M5 — Claude CLI detection + Auth PTY
  - [ ] M6 — Workspaces (worktree invisible)
  - [ ] M7 — Agent loop streaming
  - [ ] M8 — Diff viewer + git decisions
  - [ ] M9 — Onboarding tour
  - [ ] 🚦 Phase 1 Completion Gate
- [ ] **Phase 2 — Production polish**
  - [ ] M10 — Landing Analog.js TBD → mozart.build (plus Astro)
  - [ ] M11 — Angular web + Clerk → app.mozart.build
  - [ ] 🚦 **M12 — PostHog telemetry (avant-dernière étape)**
  - [ ] 🚦 **M13 — CI matrix + GitHub Releases (dernière étape)**
- [ ] **Pre-Release Final Gate**
  - [ ] All validation gates green
  - [ ] Manual smoke test complete
  - [ ] Refactor score ≥ 9.5/10
  - [ ] Tag `v0.0.1` + GitHub Release
