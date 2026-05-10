# Plan: Mozart v0.0.1 — Bootstrap

**Status:** Draft (CEO + Eng + Design + DX reviewed)
**Date:** 2026-05-09
**Brand:** Mozart — primary domain `mozart.build` (locked 2026-05-09 in /plan-ceo-review HOLD SCOPE pass).
**Supersedes:** N/A — narrows scope of [PLAN.md](./PLAN.md) (cleared v0.1) into a sub-MVP.
**Reviewer:** /plan-eng-review (Opus 4.7) + Codex outside voice; /plan-ceo-review HOLD SCOPE 2026-05-09 (rename + design routing)

---

## TL;DR

v0.0.1 ships in **two phases inside one release**:

```
PHASE 1 — Desktop core (validate first)         PHASE 2 — Production polish
─────────────────────────────────────────       ─────────────────────────────────────────
Tauri shell (3-panel)                            Astro landing (apps/landing)
Wrap Claude Code CLI as agent loop               Angular web + Clerk OAuth (apps/web)
Worktree create/checkpoint/diff                  PostHog telemetry (Rust outbox)
1 task = 1 workspace = 1 thread = N runs         Cloudflare Pages deploys
Onboarding tier UI + bundled tour                Tag → GitHub Releases + SHA256SUMS
Local dev only                                   Public download + lead capture
```

Phase 1 must be working locally before Phase 2 starts. Both phases ship together as **one** v0.0.1 release to avoid creating early users that need migration.

Stack: **Nx monorepo + PNPM**, three apps (`apps/landing` Astro, `apps/web` Angular+Clerk, `apps/desktop` Angular+Tauri), two libs (`libs/spartan` vendored Hlm, `libs/design-tokens`).

---

## What this plan supersedes from PLAN.md

| PLAN.md (v0.1) decision | v0.0.1 change | Reason |
|---|---|---|
| `cargo create-tauri-app` (single dir) | Nx monorepo + PNPM workspaces | D1 — three apps share libs |
| LlmProvider trait (Claude direct + future Mistral) | Wrap `claude` CLI as subprocess | D5+T2 (Codex) — speed to first agent run; multi-provider returns in v0.0.2 |
| Spartan NG via npm packages | Vendored Hlm components in `libs/spartan` | D3 — own the source for theme tweaks |
| Capacity = 4 agents | Capacity = 1 (one workspace, sequential runs) | D4 — concurrency added in v0.0.2 |
| API key paste (cleared onboarding) | Claude Code CLI required + `claude auth login` PTY | D9+T2 — closer to Conductor; simpler than 3-tier chain |
| 2-table SQL schema (`agents` + `messages`) | 6-table schema (Task/Workspace/Thread/AgentRun/AgentEvent/WorkspaceChanges) | D16 — separated entities from day 1 |
| GitHub clone in Add Repository dialog | Local folder only; clone disabled with v0.2 tooltip | D2 — defer all in-app GitHub to v0.2 |
| macOS notarization in v0.1 | Deferred to v0.0.2 (needs Apple Dev account) | Phase 2 stretch |

---

## Decision Audit Trail (v0.0.1)

| # | Decision | Reasoning | Locked |
|---|----------|-----------|--------|
| D1 | Nx monorepo + PNPM workspaces | Three apps + shared libs needs structured monorepo | ✅ |
| D2 | No in-app GitHub repo cloning in v0.0.1 (deferred to v0.2) | Strict subset of cleared plan; smallest scope | ✅ |
| D3 | `libs/spartan` = vendored Spartan NG Hlm components | shadcn copy-paste model; own the source for theme tweaks | ✅ |
| D4 | Min agent feature = shell + worktree + Claude streaming, capacity=1 | Sequential agent runs in same thread; concurrency in v0.0.2 | ✅ |
| D5 | Wrap Claude Code CLI as agent loop (was: LlmProvider trait + OpenRouter) | Speed to first run; multi-provider in v0.0.2 with tool-use | ✅ Reduced |
| D6 | Tour repo = separate public GitHub `mozart-quickstart-demo`, plain HTML/CSS/JS + tour-script.json | Universally readable demo content | ✅ |
| D7 | Full 3-platform CI matrix + GitHub Releases on tag + SHA256SUMS day 1 | Boil the lake on distribution | ✅ |
| D8 | 3 apps in monorepo: `apps/landing` (Astro) + `apps/web` (Angular+Clerk) + `apps/desktop` (Angular+Tauri) | Right tool per surface; shared libs justify Nx | ✅ |
| D9 | Sync Claude = detect Claude CLI + spawn `claude auth login` in PTY (3-tier collapses to 1-tier) | CLI manages its own auth; we wrap it | ✅ Simplified |
| D10 | Desktop local-only + opt-out PostHog anonymous device_id telemetry, first-launch banner | No backend needed; matches Conductor's pattern | ✅ |
| A1 | Nx orchestrates Tauri via `nx:run-commands` wrapping `tauri-cli` | Layer 1 choice; zero plugin maintenance | ✅ |
| A2 | tauri-specta generates TS bindings for Tauri commands + AppError | Auto-sync prevents drift | ✅ |
| A3 | Subdomain split on Cloudflare Pages: `mozart.build` (Astro) + `app.mozart.build` (Angular) + GitHub Releases (desktop) | Clean per-app CI, scoped cookies, edge CDN | ✅ |
| A4 | `@clerk/clerk-js` + thin Angular service in `apps/web/src/app/services/clerk.service.ts` (no shared lib) | Clerk has no Angular SDK; wrap directly | ✅ |
| A5 | Three-tier Claude auth COLLAPSED → require Claude Code CLI installed; spawn `claude auth login` in PTY if not authed | D5 reduction made tiers 1+3 unnecessary | ✅ Simplified |
| A6 | PostHog via raw reqwest + SQLite `events_outbox` + background drain task | Survives offline; zero crate dep risk | ✅ |
| A7 | Tour: bundle snapshot in installer + try GitHub clone for fresh content in background | Always works offline | ✅ |
| Q1 | Minimum libs: `libs/spartan` + `libs/design-tokens` only | Tauri bindings stay in `apps/desktop`; add libs only on proven duplication | ✅ |
| Q2 | Setup screen shows active Claude auth state explicitly, user can override | Prevents silent fallthrough | ✅ |
| Q3 | (D5 reduction made StreamEvent enum optional for v0.0.1; keep minimal Claude-CLI-output parser only) | Single parser surface | ✅ Simplified |
| Q4 | Same SQLite DB + WAL mode, separate writer task for telemetry | Capacity=1 + WAL = zero contention | ✅ |
| T1 | Vitest (Angular + Astro) + cargo test (Rust) + Playwright (E2E), latest Angular | Modern test stack, Vitest is Angular's new default | ✅ |
| T2 | Tauri E2E = Playwright + tauri-driver smoke tests on Linux CI only | Cross-platform manual QA before Phase 2 ships | ✅ |
| T3 | Hard CI gate: cargo test + Vitest + smoke E2E + clippy must all pass | Tests-along-with-code discipline | ✅ |
| P1 | Angular bundle budgets day 1: 500KB warn / 750KB error initial; 100/150KB lazy | Forces lazy loading discipline | ✅ |
| **D11** | **Sequencing: Phase 1 (desktop core) before Phase 2 (web/Clerk/landing/telemetry); both ship in single v0.0.1 release** | Codex tension 1 — concentrate risk on riskiest piece first | ✅ |
| **D12** | **Agent action model: wrap Claude Code CLI subprocess; tool-use loop deferred to v0.0.2** | Codex tension 2 — fast core, document v0.0.2 path | ✅ |
| **D13** | **Sandbox: inherit Claude CLI permissions + app-level guardrails (no `--dangerously-skip-permissions` default; force cwd=worktree; `git checkpoint` before run; show final diff; Stop + Discard controls; risk disclosure in onboarding)** | Codex tension 3 — pragmatic safety without container overhead | ✅ |
| **D14** | **Telemetry consent: opt-out with first-launch banner (Conductor's pattern)** | Codex tension 4 | ✅ |
| **D15** | **Cleanup: delete `~/accelerate_growth_with/claude-labs/conductor-copycat/` (stale CLAUDE.md says NestJS)** | Prevents future confusion | ✅ |
| **D16** | **Data model + Git edge-case policy** (full text below in Data Model section) | User-authored spec; foundation for every later v0.0.x | ✅ |

---

## Architecture (v0.0.1)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Repo: mozart (new) — Nx monorepo + PNPM workspaces                            │
│                                                                                │
│  apps/                                                                         │
│  ├── landing/        Astro static — hero + 3 features + GIFs + download CTA   │
│  │                   Deploy: Cloudflare Pages → mozart.build (root)            │
│  │                                                                             │
│  ├── web/            Angular (latest) + Clerk OAuth (GitHub + Google)         │
│  │                   Routes: /, /login, /sso-callback, /downloads (gated)     │
│  │                   Deploy: Cloudflare Pages → app.mozart.build              │
│  │                                                                             │
│  └── desktop/        Angular shell + Tauri v2                                  │
│      ├── src/        Angular 3-panel UI (sidebar/center/right)                │
│      ├── src-tauri/  Rust: Claude CLI wrap, worktree, db, keychain, telemetry │
│      └── resources/quickstart-demo.tar.gz   (bundled tour snapshot)           │
│                      Deploy: Tauri build → GitHub Releases (.dmg/.exe/.AppImg)│
│                                                                                │
│  libs/                                                                         │
│  ├── spartan/        Vendored Hlm components (used by all 3 apps' UI)         │
│  └── design-tokens/  Tailwind preset + CSS variables (used by all 3)          │
│                                                                                │
│  Tooling:                                                                      │
│  - PNPM workspaces                                                             │
│  - Nx 18+ with run-commands executor for Tauri                                 │
│  - tauri-specta (Rust → TS bindings, lives in apps/desktop/src/app/_bindings) │
│  - Vitest + Playwright + cargo test                                            │
│  - GitHub Actions matrix: ubuntu-latest, macos-latest, windows-latest          │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Desktop runtime (apps/desktop/src-tauri)

```
┌────────────────────────────────────────────────────────────────────┐
│  Tauri v2 Rust process                                              │
│                                                                      │
│  Commands (tauri-specta-generated TS bindings in apps/desktop/...)  │
│    create_workspace(repo_id, base_branch, task_text)                │
│    start_agent_run(workspace_id, prompt)                            │
│    stop_agent_run(run_id)                                           │
│    list_workspaces()                                                │
│    get_workspace_diff(workspace_id)                                 │
│    list_branches(repo_path)                                         │
│    detect_claude_auth() → ClaudeAuthState                           │
│    start_claude_login_pty(channel)                                  │
│    track_event(event_name, props)  // PostHog                       │
│                                                                      │
│  Modules:                                                            │
│    claude_cli.rs   — subprocess wrap, stdout parser, lifecycle      │
│    worktree.rs     — git worktree create/remove/checkpoint          │
│    git_query.rs    — branches, validate_repo, check_git_available   │
│    branch_name.rs  — slugify + check-ref-format gate                │
│    db.rs           — tauri-plugin-sql + migrations + WAL            │
│    keychain.rs     — keyring + 0600 file fallback (Linux headless)  │
│    telemetry.rs    — events_outbox enqueue + drain task             │
│    tour_repo.rs    — extract bundled snapshot + try clone latest    │
│    sandbox.rs      — guardrails: cwd lock, checkpoint, diff capture │
└──────────────────────────┬─────────────────────────────────────────┘
                           │ tauri-plugin-sql
                           │
                    ┌──────▼──────────────┐
                    │  SQLite (WAL mode)  │
                    │  6 tables (D16)     │
                    │  events_outbox      │
                    │  config             │
                    └─────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│  Claude Code CLI subprocess (per agent run)                         │
│                                                                      │
│  Spawned by claude_cli.rs:                                          │
│    cwd = workspace.worktree_path  (forced by sandbox.rs)            │
│    env  = inherited (no secret stripping in v0.0.1; documented risk)│
│    args = [user prompt]                                             │
│    NEVER --dangerously-skip-permissions                             │
│                                                                      │
│  stdout → parsed → AgentEvent rows + Tauri Channel<StreamEvent>     │
│  stderr → captured to AgentEvent (level=error)                      │
│  exit  → AgentRun.status = done | error                             │
│  Pre-spawn:  git commit -am "checkpoint before run-{run_id}"        │
│  Post-spawn: git diff HEAD~1 → WorkspaceChanges row                 │
└────────────────────────────────────────────────────────────────────┘
```

---

## Data Model (D16, source of truth)

v0.0.1 execution model:
- **one task = one workspace = one git branch = one working tree = one main thread = N sequential agent runs = one final diff**
- No multiple chats per workspace. No concurrent agents per workspace.
- Schema separates Task / Workspace / Thread / AgentRun / AgentEvent / WorkspaceChanges from day 1, even though v0.0.1 doesn't exercise the cardinality. This avoids a v0.0.2 migration.

### Tables

```sql
-- migrations/001_init.sql

CREATE TABLE schema_version (version INTEGER NOT NULL);
INSERT INTO schema_version VALUES (1);

PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE repos (
  repo_id      TEXT PRIMARY KEY,
  path         TEXT NOT NULL UNIQUE,    -- absolute, slash-normalized
  display_name TEXT NOT NULL,
  added_at     INTEGER NOT NULL
);

CREATE TABLE tasks (
  task_id      TEXT PRIMARY KEY,
  repo_id      TEXT NOT NULL REFERENCES repos(repo_id),
  title        TEXT NOT NULL,           -- human-friendly task title
  task_text    TEXT NOT NULL,           -- original user prompt
  status       TEXT NOT NULL DEFAULT 'active',  -- active | archived
  created_at   INTEGER NOT NULL
);

CREATE TABLE workspaces (
  workspace_id   TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(task_id),
  worktree_path  TEXT NOT NULL UNIQUE,  -- absolute, slash-normalized
  branch_name    TEXT NOT NULL,         -- starts as 'agent/wip-{shortid}', renamed after first run
  base_branch    TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'initializing',
  -- initializing | ready | running | done | error | conflict | stopped | crashed
  created_at     INTEGER NOT NULL,
  deletion_intent INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE threads (
  thread_id    TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL UNIQUE REFERENCES workspaces(workspace_id),  -- 1:1 in v0.0.1
  created_at   INTEGER NOT NULL
);

CREATE TABLE agent_runs (
  run_id       TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL REFERENCES threads(thread_id),
  prompt       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'initializing',
  -- initializing | running | done | error | stopped | crashed
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  exit_code    INTEGER,
  error_message TEXT,
  checkpoint_sha TEXT  -- git sha of pre-run checkpoint commit
);

CREATE TABLE agent_events (
  event_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       TEXT NOT NULL REFERENCES agent_runs(run_id),
  event_type   TEXT NOT NULL,
  -- stream_token | tool_call | cli_output | status_update | error
  payload_json TEXT NOT NULL,           -- raw event payload
  ts           INTEGER NOT NULL
);

CREATE TABLE workspace_changes (
  change_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id),
  run_id       TEXT REFERENCES agent_runs(run_id),
  diff_text    TEXT NOT NULL,           -- unified diff vs base
  files_added  INTEGER NOT NULL DEFAULT 0,
  files_modified INTEGER NOT NULL DEFAULT 0,
  files_deleted INTEGER NOT NULL DEFAULT 0,
  captured_at  INTEGER NOT NULL
);

CREATE TABLE events_outbox (
  outbox_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name   TEXT NOT NULL,
  props_json   TEXT NOT NULL,
  enqueued_at  INTEGER NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_attempt INTEGER
);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX idx_workspaces_task ON workspaces(task_id);
CREATE INDEX idx_threads_workspace ON threads(workspace_id);
CREATE INDEX idx_runs_thread ON agent_runs(thread_id);
CREATE INDEX idx_events_run ON agent_events(run_id, ts);
CREATE INDEX idx_changes_workspace ON workspace_changes(workspace_id, captured_at);
CREATE INDEX idx_outbox_enqueued ON events_outbox(enqueued_at) WHERE attempts < 5;
```

### Branch name generation (`branch_name.rs`)

```rust
fn make_initial_branch(short_id: &str) -> String {
    format!("agent/wip-{}", short_id)   // e.g. "agent/wip-a3f"
}

fn make_task_branch(task_title: &str, short_id: &str) -> Result<String, AppError> {
    let slug = task_title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(40)
        .collect::<String>();
    let candidate = format!("agent/{}-{}", slug, short_id);
    // gate via git check-ref-format
    Command::new("git")
        .args(["check-ref-format", "--branch", &candidate])
        .status()
        .map_err(|_| AppError::Worktree { message: "git check-ref-format failed".into() })?
        .success()
        .then(|| candidate)
        .ok_or_else(|| AppError::Worktree { message: "branch name invalid after slugify".into() })
}
```

### Git edge-case policy (D16)

| Case | v0.0.1 behavior |
|------|----------------|
| Plain repo, single branch | Happy path |
| Repo with LFS | Detect via `git lfs ls-files` (if `git-lfs` on PATH); show warning at workspace creation: "This repo uses Git LFS. v0.0.1 does not pull LFS files into workspaces." User can proceed; LFS files appear as pointer files in the worktree. |
| Repo with submodules | Detect via `.gitmodules`. If trivial (≤1 submodule, no recursion), allow with `git submodule update --init` (no recursion). Otherwise warn and **refuse** with `AppError::UnsupportedRepoFeature { kind: "complex_submodules" }`. |
| Nested repo (`.git` inside selected repo path) | Refuse with clear error: "Nested repository detected at `<path>`. v0.0.1 does not support repos containing other repos because final diff may miss changes." |
| `.gitignore`'d files | Not copied into worktree by `git worktree add` (default git behavior). Documented in onboarding: "Local files like `.env` won't be in your workspace. Setup scripts and files-to-copy rules: v0.0.2." |
| Dirty working tree | Warn but don't block: workspace is created on the user's selected base branch from `HEAD`, not local working state. |
| Detached HEAD | Refuse: "Cannot create workspace from detached HEAD. Check out a branch first." |
| User-provided text in branch name | Never used directly. Slugified by `branch_name.rs`, gated by `git check-ref-format`. |

### Source of truth

Final changed files and diffs are **always** computed from `git status` + `git diff`, not from streamed event log. The event log is for replay/debug, not state derivation.

### v0.0.2+ data model evolution path

- Multiple agents per task → use existing `workspaces.task_id` foreign key (now 1:N with task), add `workspaces.role` (`subtask` | `integration`).
- Multiple threads per workspace → relax `threads.workspace_id` UNIQUE constraint, add `threads.title`.
- Per-repo setup scripts → new `repo_setup_scripts` table.
- Files-to-copy rules → new `repo_files_to_copy` table.

Schema designed so v0.0.2 = additive (no breaking migrations).

---

## Phase 1: Desktop Core (must work locally before Phase 2 starts)

### Step 0.0 — Brand reservation (Day 0, BEFORE bootstrap)

Mozart is now a load-bearing brand: domain, repo, package, deep-link scheme, Tauri bundle ID, CLI binary, distribution. Lock these reservations BEFORE Step 1.1 to eliminate the domain-race window.

- [ ] Register `mozart.build` (primary, ~$30-40/yr) at Cloudflare Registrar or Namecheap.
- [ ] Defensively register `mozart.dev` (~$15/yr) — prevents brand confusion if a competitor squats.
- [ ] Reserve GitHub org or user repo: `mozart-build/mozart` (or `<user>/mozart`).
- [ ] Reserve `mozart-build/mozart-quickstart-demo` (D6 tour repo).
- [ ] Provision Cloudflare Pages project for `mozart.build` (root) — DNS propagation takes hours.
- [ ] Provision Cloudflare Pages project for `app.mozart.build` (subdomain).
- [ ] Reserve `@mozart` social handles (Twitter/X, Discord server, optional: BlueSky).
- [ ] Trademark sanity check: USPTO + EUIPO + INPI (France) on "Mozart" software class — historic Salesforce/Adobe enterprise tooling has used the name; ~30 min check before incorporating any LLC/SARL.

Acceptance: domains resolve, GitHub org exists, Cloudflare Pages projects empty-but-provisioned. Step 1.1 cannot start until this checklist is complete.

### Step 1.1 — Repo bootstrap (Day 1)

```bash
# new dir, fresh repo
mkdir mozart && cd mozart
pnpm dlx create-nx-workspace@latest . --preset=apps --pm=pnpm --nxCloud=skip
pnpm add -D @nxtensions/astro nx
# commit baseline
git init && git add . && git commit -m "chore: nx + pnpm workspace baseline"

# Migrate gstack specs into the monorepo as canonical docs (TODO from CEO review 2026-05-09)
mkdir -p docs
cp ~/.gstack/projects/conductor-copycat/PLAN-v0.0.1.md docs/PLAN-v0.0.1.md
cp ~/.gstack/projects/conductor-copycat/DESIGN.md docs/DESIGN.md
cp ~/.gstack/projects/conductor-copycat/timothy-main-eng-review-test-plan-20260509-072442.md docs/test-plan-v0.0.1.md
cp -r ~/.gstack/projects/conductor-copycat/competitors docs/competitors
git add docs && git commit -m "docs: migrate v0.0.1 specs from gstack project into monorepo"
```

Generators (run sequentially):

```bash
pnpm exec nx g @nx/angular:application apps/desktop --routing --style=scss --standalone
pnpm exec nx g @nx/angular:application apps/web --routing --style=scss --standalone
pnpm exec nx g @nxtensions/astro:application apps/landing
pnpm exec nx g @nx/angular:library libs/spartan --buildable
pnpm exec nx g @nx/js:library libs/design-tokens --bundler=none
```

Then add Tauri to `apps/desktop`:

```bash
cd apps/desktop && pnpm dlx @tauri-apps/cli@latest init && cd ../..
# Wire nx:run-commands targets in apps/desktop/project.json:
# "tauri-dev": runs `pnpm exec tauri dev` from apps/desktop
# "tauri-build": runs `pnpm exec tauri build` from apps/desktop
# inputs: include "{projectRoot}/src-tauri/**/*" so Nx invalidates on Rust changes
```

Vendor Spartan NG Hlm components into `libs/spartan/src/lib/`:

```bash
cd apps/desktop && pnpm dlx @spartan-ng/cli init && cd ../..
# Move generated ui-* directories from apps/desktop/src/app/components into libs/spartan/src/lib/
# Update apps/desktop tsconfig paths to import from @conductor/spartan
```

### Step 1.2 — Spikes (Day 1-2, must pass before any UI work)

| Spike | Validates | Pass criteria |
|-------|-----------|---------------|
| **A. `git worktree add` cross-platform** | Cleared plan risk #1 | Works on Win/Mac/Linux from `Command::new("git")` |
| **B. tauri-plugin-sql + WAL + 6-table schema** | D16 schema viability | Migration runs; concurrent reads + serialized writes survive |
| **C. Claude CLI subprocess capture** | D5 reduction core | Spawn `claude` with prompt, parse stdout in real time, surface tokens in Tauri Channel within 200ms of CLI emitting them |
| **D. tauri-specta bindings round-trip** | A2 | Rust enum + AppError → typed TS, Angular `commands.x()` returns typed `Result<T, E>` |
| **E. portable-pty + `claude auth login`** | A5 | Spawn claude auth in PTY, capture OAuth URL output, open in browser, detect successful auth on completion |

Any spike fails → document blocker and pivot before Step 1.3.

### Step 1.3 — DB layer (Day 2)

Implement `db.rs` with full D16 schema in `migrations/001_init.sql`. Migration runner reads `schema_version`, applies pending. CRUD functions per table. Tests: in-memory SQLite, round-trip per table, foreign-key cascade behavior.

### Step 1.4 — `claude_cli.rs` (Day 2-3)

```rust
pub struct ClaudeRunHandle {
    pub run_id: RunId,
    pub child: Child,                      // tokio::process::Child
    pub cancel: CancellationToken,
}

pub async fn spawn_run(
    workspace_path: &Path,
    prompt: &str,
    channel: Channel<StreamEvent>,
) -> Result<ClaudeRunHandle, AppError> {
    // 1. sandbox.git_checkpoint(workspace_path) → returns sha
    // 2. tokio::process::Command::new("claude")
    //      .current_dir(workspace_path)       // sandbox enforcement
    //      .arg(prompt)
    //      .stdout(Stdio::piped()).stderr(Stdio::piped())
    //      .kill_on_drop(true)
    //      .spawn()
    // 3. spawn parser task that reads stdout line-by-line, emits StreamEvent
    // 4. on exit: sandbox.capture_diff(workspace_path) → WorkspaceChanges row
    // 5. NEVER pass --dangerously-skip-permissions
}
```

Parser handles Claude CLI's actual output format (tokens + tool use surfaces). `claude --version` check at startup; if missing → onboarding shows install instructions.

### Step 1.5 — `sandbox.rs` (Day 3, D13)

```rust
pub fn git_checkpoint(workspace: &Path) -> Result<String, AppError> {
    Command::new("git").current_dir(workspace).args(["add", "-A"]).status()?;
    Command::new("git").current_dir(workspace)
        .args(["commit", "-m", "checkpoint before run", "--allow-empty"])
        .status()?;
    let sha = Command::new("git").current_dir(workspace)
        .args(["rev-parse", "HEAD"]).output()?.stdout;
    Ok(String::from_utf8_lossy(&sha).trim().to_string())
}

pub fn capture_diff(workspace: &Path, base_sha: &str) -> Result<DiffSummary, AppError> {
    let out = Command::new("git").current_dir(workspace)
        .args(["diff", base_sha, "HEAD"]).output()?;
    // parse +/- counts, unified diff text
}

pub fn discard_changes_to(workspace: &Path, sha: &str) -> Result<(), AppError> {
    Command::new("git").current_dir(workspace)
        .args(["reset", "--hard", sha]).status()?;
    Ok(())
}
```

### Step 1.6 — `worktree.rs` + `branch_name.rs` (Day 3)

Per D16. Handlers:
- `create_workspace(repo_id, base_branch, task_text)` → validate base branch + repo + edge cases → create worktree at `<repo>/.worktrees/<short_id>` with placeholder `agent/wip-<short_id>` branch → write Task + Workspace + Thread rows.
- `rename_branch_after_first_task(workspace_id, task_title)` → call `make_task_branch`, `git branch -m`.
- `cleanup_orphans()` on startup.

### Step 1.7 — Tauri commands wiring + tauri-specta (Day 3-4)

All commands declared in `commands/mod.rs`, annotated `#[specta::specta]`. Build script runs `cargo specta` and writes to `apps/desktop/src/app/_bindings/index.ts`. Angular imports typed `commands` and `events` from there.

### Step 1.8 — Angular shell UI (Day 4-7)

Per cleared PLAN.md Step 7 layout (3-panel: sidebar / center / right). Components:
- `AppShellComponent` — CSS grid, responsive collapse <1100px
- `SidebarComponent` — projects + workspaces (capacity=1, so one workspace shown at a time)
- `WorkspaceItemComponent` — status badge + diff counts
- `WorkspaceStreamComponent` — conversation + composer
- `ComposerComponent` — model picker disabled in v0.0.1 (Claude CLI = whatever model CLI uses), Send/Stop button
- `DiffPanelComponent` — list + inline expansion
- `TerminalPanelComponent` — embedded PTY at workspace path
- `OnboardingComponent` — Conductor-style 2-col welcome (logo + 3 features + GIFs) + Claude auth flow
- `NewWorkspaceDialogComponent` — base branch + task text
- `AddRepositoryDialogComponent` — local folder + recent
- `SettingsComponent` — Claude CLI status + telemetry toggle + projects + about

Apply CSS tokens from `libs/design-tokens` (Geist font bundled). Spartan Hlm primitives used: Button, Dialog, Select, ScrollArea, Input, Label, Tooltip, ContextMenu, Badge.

### Step 1.9 — Onboarding flow (Day 7-8)

```
First launch
   ↓
[2-col welcome screen]
LEFT (3 feature blocks):                         RIGHT:
  • Parallel agents in worktrees                   [GIF: workspace switching]
  • Cross-platform                                 [GIF: streaming agent]
  • Bring your own Claude key                      [GIF: diff review]
                          [Get started →]

   ↓
[Claude auth screen]
"Mozart uses Claude Code CLI to run agents."

  ┌─ Claude Code CLI status ─────────────────────────┐
  │  ✓ Installed (v1.x.x)        ✗ Not installed     │
  │  ✓ Authenticated             ✗ Not authenticated │
  └──────────────────────────────────────────────────┘

  If not installed: [Install instructions →] (links to claude.com docs)
  If installed but not authed: [Sign in to Claude →] (spawns `claude auth login` PTY)
  If installed + authed: [Continue →]

   ↓
[Risk disclosure + telemetry banner]
"Agents run shell commands and edit files in repos you select.
Use only with code you trust. We checkpoint before each run, you can
discard changes anytime.

We collect anonymous usage data (no code, no prompts). [Settings to opt out]"

  [I understand →]

   ↓
[Demo or own repo]
  ○ Try the quickstart demo (recommended)
  ○ Add my own folder
                                            [Continue →]

   ↓ (demo path)
[Quickstart tour]
  Extract bundled snapshot → load as project "quickstart"
  Background: try `git clone github.com/mozart-build/mozart-quickstart-demo`
              → if success, atomically replace bundled copy
  Show 4-step tour overlay (sidebar / stream / diff / composer)
  Post-tour: GitHub star prompt (dismissable)

   ↓ (own repo path)
[Add Repository dialog] → main shell with empty workspace state
```

### Step 1.10 — Phase 1 acceptance gate (Day 8)

Before starting Phase 2, the following MUST work locally on at least the developer's primary OS:

- [ ] Fresh install → onboarding completes → user lands in shell
- [ ] Add a local repo → create a workspace → first agent run streams tokens to UI
- [ ] Agent finishes → diff visible in right panel → user can `Discard changes` → worktree resets to checkpoint sha
- [ ] User sends follow-up message → second agent run starts in same thread
- [ ] Stop button cancels mid-stream → CLI process killed, partial diff captured
- [ ] All 6 tables populated correctly (verified by SQLite query)
- [ ] `cargo test` + `pnpm vitest` + `cargo clippy` all green

If any gate fails → fix before Phase 2 start.

---

## Phase 2: Production Polish (after Phase 1 gate passes)

### Step 2.1 — Astro landing (Day 9-10)

`apps/landing` content:
- Hero with logo + tagline + 3 download buttons (auto-detect OS, show platform badge)
- 3-block feature section (parallel agents / cross-platform / BYOK) matching desktop onboarding visuals
- Footer with GitHub link, license, social
- SEO meta + OG tags + favicon

Tailwind shared via `libs/design-tokens`. Deploy: Cloudflare Pages, root domain.

### Step 2.2 — Web app + Clerk (Day 10-12)

`apps/web` routes:
- `/` — redirect to landing
- `/login` — Clerk hosted UI embedded
- `/sso-callback` — Clerk callback handler
- `/downloads` — guarded by AuthGuard, renders platform-specific .dmg/.exe/.AppImage links + SHA256 with copy button

Clerk integration: `libs/auth-clerk`-free; service lives in `apps/web/src/app/services/clerk.service.ts`. Wraps `@clerk/clerk-js`. Allowed redirects: `https://app.mozart.build/sso-callback`. Providers: GitHub + Google.

Deploy: Cloudflare Pages, `app.mozart.build` subdomain.

### Step 2.3 — PostHog telemetry (Day 12-13)

`telemetry.rs`:
- `track(name, props)` enqueues to `events_outbox` table
- Background tokio task drains every 30s: read up to 50 oldest unsent events → POST to `https://app.posthog.com/capture/` → on success, delete; on failure, increment `attempts`, exponential backoff (5s/30s/2m/10m/1h), drop after 5 attempts (logged)
- Bounded outbox: cap at 10,000 events, drop oldest when over (rare event)
- All events tagged with `device_id` (UUID v4 generated on first launch, stored in `config` table) + `app_version` + `os` + `os_version`
- Default ON; first-launch banner shows opt-out link to Settings; Settings has toggle that flips a `config` key (`telemetry_enabled = false`) — when disabled, track() is a no-op

Events tracked (initial set):
- `app.launched` (per launch)
- `onboarding.step_completed` ({step: "welcome"|"claude_auth"|"risk_disclosure"|"demo_or_repo"})
- `onboarding.completed`
- `workspace.created`
- `agent_run.started` / `agent_run.completed` ({status, duration_ms})
- `tour.completed` / `tour.skipped`
- `error` ({error_kind, recoverable})

### Step 2.4 — CI matrix + Releases (Day 13-14)

`.github/workflows/ci.yml`:
- Job 1 (3-platform matrix): `pnpm install` + `pnpm exec nx affected -t lint test` + `pnpm exec nx run desktop:tauri-build`
- Job 2 (Linux only): `pnpm exec nx run desktop:e2e` (Playwright + tauri-driver smoke tests, with xvfb)
- Job 3 (Linux only, deploy preview): `pnpm exec nx run landing:build` + `pnpm exec nx run web:build` → Cloudflare Pages preview deploy

`.github/workflows/release.yml` (on tag `v*`):
- Build .dmg / .exe / .AppImage on respective runners
- Generate `SHA256SUMS` file
- Create GitHub Release with binaries + SHA256SUMS attached
- Release notes auto-generated from commits since last tag

### Step 2.5 — v0.0.1 acceptance gate

- [ ] Phase 1 gate still passes
- [ ] `app.mozart.build` Clerk login works (GitHub + Google)
- [ ] `/downloads` shows correct binaries with verifiable SHA256
- [ ] Astro landing renders <1s on 3G
- [ ] PostHog dashboard receives events from a real desktop install
- [ ] `git tag v0.0.1 && git push --tags` produces GitHub Release with all 3 binaries

Tag → ship.

---

## Test Plan

### Frameworks (T1 + T2)

| Layer | Framework | Where |
|-------|-----------|-------|
| Rust unit + integration | `cargo test` | `apps/desktop/src-tauri/src/**` |
| Angular component | Vitest + @testing-library/angular | `apps/{desktop,web}/src/**` |
| Astro | Vitest (Astro's native runner) | `apps/landing/src/**` |
| Tauri E2E | Playwright + tauri-driver | `apps/desktop/e2e/` (Linux CI only) |
| Web E2E | Playwright (browser) | `apps/web/e2e/` |

CI gating (T3): `cargo test` + `cargo clippy --all-targets -- -D warnings` + `pnpm exec nx affected -t test lint` + smoke E2E must all pass for merge to main.

### Coverage diagram (gap = needs test, not regression — green-field)

```
RUST (apps/desktop/src-tauri)
  claude_cli.rs
    ├── spawn_run() happy + cancel mid-stream + crash mid-stream     [GAP] [→E2E for happy]
    ├── parse_stdout() Claude output format → StreamEvent             [GAP]
    ├── detect_cli_installed() + version check                        [GAP]
    └── exit handling (success / error / killed)                      [GAP]
  worktree.rs
    ├── create_workspace() happy + dirty + branch missing             [GAP]
    ├── remove_workspace() happy + force + missing                    [GAP]
    ├── cleanup_orphans()                                             [GAP]
    └── edge cases: LFS warn / submodule init / nested refuse / .gitignore [GAP]
  branch_name.rs
    ├── make_initial_branch()                                         [GAP]
    ├── make_task_branch() slugify + length cap                       [GAP]
    └── check-ref-format gate (rejects "../etc")                      [GAP]
  git_query.rs
    ├── list_branches() + dedup remote/local                          [GAP]
    ├── check_git_available() missing case                            [GAP]
    └── validate_repo() not-a-repo + permissions                      [GAP]
  db.rs
    ├── migrations 001 round-trip                                     [GAP]
    ├── tasks/workspaces/threads/runs/events CRUD                     [GAP]
    └── concurrent telemetry write + agent write under WAL            [GAP]
  keychain.rs
    └── set/get/0600 fallback on Linux headless                       [GAP]
  telemetry.rs
    ├── track() enqueues correctly                                    [GAP]
    ├── drain() batches + retries                                     [GAP]
    └── opt-out toggle = no-op                                        [GAP]
  tour_repo.rs
    ├── extract_bundled() tar.gz unpack                               [GAP]
    ├── try_clone_latest() with timeout                               [GAP]
    └── atomic replace                                                [GAP]
  sandbox.rs
    ├── git_checkpoint() pre-run                                      [GAP]
    ├── capture_diff() post-run                                       [GAP]
    └── discard_changes_to(sha) reset                                 [GAP]

ANGULAR DESKTOP (apps/desktop/src)
  AppShellComponent — 3-panel grid + responsive collapse              [GAP]
  SidebarComponent — empty state + workspace item rendering            [GAP]
  WorkspaceItemComponent — 8 status badge mapping + diff counts        [GAP]
  WorkspaceStreamComponent — initializing/running/done states          [GAP] [→E2E]
  ComposerComponent — disabled + send→stop transition                  [GAP]
  DiffPanelComponent — file rows + expansion + empty                   [GAP]
  TerminalPanelComponent — PTY mount                                   [GAP]
  OnboardingComponent — 4 screens + Claude auth state UI               [GAP] [→E2E]
  NewWorkspaceDialogComponent — branch picker + task text required     [GAP]
  AddRepositoryDialogComponent — git validation + recent               [GAP]
  SettingsComponent — telemetry toggle + Claude CLI status             [GAP]

ANGULAR WEB (apps/web/src)
  ClerkService — sign-in + session$                                    [GAP]
  AuthGuard — CanActivate                                              [GAP]
  DownloadsComponent — platform detect + render + SHA256 copy          [GAP] [→E2E web]
  LoginComponent — Clerk hosted UI integration                         [GAP] [→E2E web]

ASTRO LANDING (apps/landing)
  index.astro — render + meta tags + GIF lazy-load                     [GAP]

USER FLOWS [→E2E smoke tests, Linux CI only]
  • Onboarding: install → claude detected + authed → reach shell
  • Onboarding: install → claude not installed → install instructions visible
  • Workspace: create from local repo → first token visible <5s
  • Workspace: agent finishes → diff renders → discard changes works
  • Tour: extract bundled snapshot → 4-step overlay completes
  • Web: visit landing → click signup → Clerk login → reach /downloads → see correct platform binary

REGRESSION RULE: green-field; no regressions to test.

COVERAGE: 0/63 paths tested at start (everything is forward gap)
QUALITY TARGET: ★★★ (behavior + edge + error) for all Rust modules; ★★ (happy path) for Angular components; ★★★ for E2E smoke flows
```

Tests are written **alongside** production code (Beck: red-green-refactor). PR template includes "Tests for this change: [link to test files]" requirement.

### Test plan artifact

Saved separately to `~/.gstack/projects/conductor-copycat/timothy-main-eng-review-test-plan-20260509-072442.md` for `/qa` and `/qa-only` consumption.

---

## Failure Modes Registry

| Failure | Probability | Impact | Mitigation | Critical gap? |
|---------|-------------|--------|------------|---------------|
| Claude Code CLI not installed | High | Hard block | Onboarding detects, shows install link | No (mitigated) |
| Claude Code CLI version drift breaks subprocess parser | Medium | Medium | Pin minimum CLI version in Cargo.toml; show "Update Claude Code" if too old | No |
| `git worktree add` fails on Windows | Medium | High | Spike A; documented Git for Windows requirement | No (spiked Day 1) |
| Tauri Channel buffers tokens instead of streaming | Medium | Medium | Spike C; async_channel unbounded | No (spiked Day 1) |
| SQLite WAL contention with telemetry + agent writes | Low | Low (capacity=1) | Single connection pool; busy_timeout 5s | No |
| `git check-ref-format` rejects user task title slug | Low | Low | Fall back to `agent/wip-{shortid}` if slug invalid | No |
| Bundled tour snapshot version drifts from CLI behavior | Medium | Medium | Tour uses pre-recorded JSON, doesn't call real CLI | No |
| Tour clone fails on first launch (offline / proxy) | High | Low | Bundled snapshot always works | No |
| Cloudflare Pages preview deploy fails CI | Low | Low | Non-blocking job | No |
| Clerk auth fails on /downloads | Medium | Medium | Show error + retry CTA + email link to authentik fallback | No |
| PostHog endpoint down | Medium | Low | Outbox retries; 10K event cap prevents disk balloon | No |
| Tauri-driver flaky on Linux CI | Medium | Medium | Smoke tests only; quarantine flaky tests within 24h | No |
| macOS Gatekeeper blocks unsigned .dmg | High | Medium | Document `xattr -cr` workaround in /downloads page; notarize in v0.0.2 | **YES — manual workaround required for first install** |
| Windows SmartScreen blocks unsigned .exe | High | Medium | Document "More info → Run anyway" in /downloads; EV cert in v0.2 | **YES — manual workaround required** |
| Worktree edge case (LFS / submodule / nested) silently corrupts diff | Medium | High | D16 policy: detect + warn or refuse with AppError | No (mitigated by D16) |
| User runs agent on repo with secrets in env vars | Medium | High (data exfil) | Risk disclosure in onboarding; v0.0.2 add env strip option | **YES — documented but not enforced** |
| Concurrent operations on capacity=1 (user clicks "Stop" while UI is mid-action) | Medium | Low | UI disables conflicting buttons during state transitions | No |
| User hits cmd-Q mid-stream → orphan process | Medium | Low | `kill_on_drop(true)` on tokio Child + orphan cleanup at next launch | No |

---

## Worktree parallelization strategy (for future work, not v0.0.1)

v0.0.1 is sequential by design (one workspace, one task). Cleared roadmap: v0.0.2+ multi-workspace tasks → integration workspace pattern.

For Phase 1 + Phase 2 implementation work itself:

| Step | Modules touched | Depends on |
|------|----------------|------------|
| 1.1 Repo bootstrap | root config, project.json files | — |
| 1.2 Spikes A-E | apps/desktop/src-tauri | 1.1 |
| 1.3 DB layer | apps/desktop/src-tauri/db | 1.2-B |
| 1.4 claude_cli.rs | apps/desktop/src-tauri | 1.2-C |
| 1.5 sandbox.rs | apps/desktop/src-tauri | 1.4 |
| 1.6 worktree.rs | apps/desktop/src-tauri | 1.2-A, 1.3 |
| 1.7 commands + specta | apps/desktop/src-tauri, apps/desktop/src/app/_bindings | 1.3-1.6 |
| 1.8 Angular shell | apps/desktop/src, libs/spartan, libs/design-tokens | 1.7 |
| 1.9 Onboarding | apps/desktop/src | 1.8 |
| 2.1 Astro landing | apps/landing, libs/design-tokens | independent of Phase 1 internals |
| 2.2 Web + Clerk | apps/web, libs/spartan | 2.1 (shared tokens) |
| 2.3 Telemetry | apps/desktop/src-tauri | 1.3 |
| 2.4 CI + Releases | .github/workflows | all of Phase 1 |

**Parallel lanes possible:**
- **Lane A (Phase 1 critical path):** 1.1 → 1.2 → 1.3+1.4+1.6 (parallel sub-tasks) → 1.5 → 1.7 → 1.8 → 1.9 (sequential, single core)
- **Lane B (Phase 2 web track):** 2.1 → 2.2 (independent of Lane A after 1.1)
- **Lane C (Phase 2 telemetry):** 2.3 (depends on 1.3 from Lane A)
- **Lane D (Phase 2 CI):** 2.4 (depends on Lane A complete)

After 1.1 lands (root config), Lane A and Lane B can run in **separate worktrees in parallel**. Lane C joins after 1.3. Lane D last.

Conflict flag: Lane A and Lane B both touch `libs/design-tokens` — coordinate token additions in PRs.

---

## NOT in scope (v0.0.1)

Explicitly deferred (each with rationale):

- **Multiple parallel agents per workspace** → v0.0.2. capacity=1 simpler; multi-workspace integration pattern needs design.
- **Multiple chat threads per workspace** → v0.0.2. Schema supports it (`threads.workspace_id` UNIQUE relaxes); UI deferred.
- **OpenRouter / Mistral / direct Anthropic API** → v0.0.2. v0.0.1 wraps Claude CLI; multi-provider needs tool-use loop.
- **Anthropic tool-use API direct (read_file/write_file/edit_file/bash)** → v0.0.2 (D12). v0.0.1 lets Claude CLI do this internally.
- **In-app GitHub repo cloning** → v0.2 (per cleared PLAN.md). v0.0.1: local folder only.
- **Linear integration** → v0.3+
- **macOS notarization** → v0.0.2. Needs Apple Dev account ($99/yr). v0.0.1 documents `xattr -cr` workaround on /downloads page.
- **Windows EV code signing** → v0.2 (~$200-500/yr). v0.0.1 documents SmartScreen "More info → Run anyway".
- **Auto-updater** → v0.2 (Tauri updater plugin).
- **Identified telemetry (Clerk session bridge to desktop)** → v0.0.2 if cohort data proves valuable.
- **Setup scripts per repo** → v0.0.2 (D16 future).
- **Files-to-copy rules (`.env`, dependencies)** → v0.0.2 (D16 future).
- **Workspace archive/restore** → v0.0.2.
- **Effort level / plan mode in composer** → v0.2.
- **Command palette (⌘K)** → v0.2.
- **File attachments in composer** → v0.2.
- **Workspace status lifecycle (backlog/in-progress/review/done)** → v0.2.
- **"Open in IDE" button** → v0.2.
- **Sandbox via container/OS isolation** → v0.0.2+. v0.0.1 inherits Claude CLI permissions + app guardrails (D13).
- **Cross-platform E2E in CI** → v0.0.2. v0.0.1 has Linux-only E2E + manual Win/Mac QA before tag.
- **Coverage threshold gate** → v0.0.2. v0.0.1 enforces test existence, not %.
- **Spec for advanced Git edge cases (LFS pull, recursive submodules, files-to-copy)** → v0.0.2. v0.0.1 detects + warns/refuses (D16).

---

## What already exists (don't rebuild)

- `~/.gstack/projects/conductor-copycat/PLAN.md` — cleared v0.1 plan; this v0.0.1 plan narrows scope and overrides where listed in the supersedes table above.
- `~/.gstack/projects/conductor-copycat/DESIGN.md` — color tokens + typography + sidebar + composer + right panel specs; reuse verbatim into `libs/design-tokens` + Spartan theming.
- `~/.gstack/projects/conductor-copycat/competitors/conductor/` — Conductor.build research; reference for UX decisions only, don't copy code.
- Reference dashboard mockup at `~/.gstack/projects/t1m4lc-gstack-artifacts-timothy/designs/conductor-copycat-20260509/v3/dashboard-final.png`.
- `~/.gstack/projects/conductor-copycat/timothy-unknown-design-20260508-211553.md` — original office-hours design doc; supersedes by PLAN.md and this file.

To delete:
- `~/accelerate_growth_with/claude-labs/conductor-copycat/CLAUDE.md` — stale, says NestJS sidecar (D15).

---

## v0.0.2 Roadmap (not in v0.0.1, document so direction is visible)

- **Replace Claude CLI subprocess with Anthropic tool-use API direct** (D12). Implement `LlmProvider` trait. Define ~6 tools (read_file, write_file, edit_file, bash, list_dir, grep). Rust executes each tool against the worktree, returns result, agent continues.
- **Add OpenRouter as second `LlmProvider` impl** (reinstate D5). One client unlocks Mistral/Gemini/Llama/Qwen via OpenAI-format SSE. Canonical `StreamEvent` enum + per-provider parsers.
- **Capacity = 4 parallel agents** (per workspace or per task with integration workspace pattern). DashMap<RunId, JoinHandle> + CancellationToken in AppState.
- **Identified telemetry**: Clerk session bridge to desktop via `mozart://launch?token=X` deep link (Tauri custom-scheme registration in `apps/desktop/src-tauri/tauri.conf.json`). PostHog `alias` API merges anonymous device_id → clerk_user_id history.
- **macOS notarization** (Apple Dev account). Replace `xattr -cr` workaround.
- **Cross-platform E2E in CI**: macOS + Windows + Linux Playwright + tauri-driver matrix.
- **Setup scripts per repo** + **files-to-copy rules** (D16 future).
- **Coverage threshold gate** in CI (target 80% line coverage).
- **Multiple chat threads per workspace** (relax `threads.workspace_id` UNIQUE).
- **Workspace archive/restore** with serialization format.
- **Spec advanced Git edge cases**: actual LFS pull, recursive submodules, nested repo diff aggregation.

---

## Cross-Model Tensions Resolved (Codex outside voice)

| # | Codex finding | Decision |
|---|---|---|
| T1 | "Build desktop core first; cut landing/web/Clerk/telemetry from v0.0.1" | **Compromise (D11)**: two-phase build inside one v0.0.1 release |
| T2 | "No stated patch/application model — does agent edit directly? produce diffs?" | **Wrap Claude CLI (D12)** for v0.0.1; document tool-use loop for v0.0.2 |
| T3 | "No terminal/process sandbox model" | **Inherit Claude CLI permissions + app guardrails (D13)**: no `--dangerously-skip-permissions`, force cwd=worktree, git checkpoint, show diff, Stop+Discard, risk disclosure |
| T4 | "Anonymous telemetry without opt-in = trust problem" | **Opt-out with first-launch banner (D14)** matching Conductor's pattern |

### Cross-model tensions noted but not resolved as decisions

| Codex finding | Status |
|---|---|
| "Installable on Win/Mac/Linux false without signing" | Acknowledged; macOS notarization → v0.0.2; Windows EV → v0.2; v0.0.1 documents workarounds on /downloads |
| "Reading credentials.json security trap" | Resolved by D5 reduction (we wrap CLI, no longer read its credentials directly) |
| "Capacity=1 strategically weak" | Accepted trade for Phase 1 speed; capacity=4 in v0.0.2 |
| "No in-app GitHub clone undercuts first-run value" | Accepted trade (D2); bundled tour mitigates first-run friction |
| "Vendoring Spartan early = churn liability" | Accepted; Spartan NG is canonical shadcn-for-Angular, low real churn risk |
| "Worktree edge cases" | Resolved by D16 |
| "Bundled demo can mislead users" | Tour copy must explicitly say "demo with pre-recorded responses" — added to onboarding spec |
| "TTHW ≤10 min not credible" | Resolved 2026-05-09: target set to ≤15 min; tracked via `time_to_first_stream_ms` in PostHog (no CI gate in v0.0.1) |
| "Anonymous telemetry trust" | Resolved by D14 (banner) |
| "Multi-provider distraction" | User explicitly required multi-provider future; accepted as v0.0.2 scope |
| "Smoke E2E only on Linux misses Win/Mac installer risk" | Mitigated by manual Win/Mac QA before tag (Phase 2 acceptance gate) |
| "Onboarding tier 1 E2E depends on Claude CLI state" | E2E uses mocked CLI presence + auth state via env vars |
| "~30 cargo test files = fake precision" | Dropped from spec; coverage diagram now lists actual paths |
| "Playwright + tauri-driver fragile" | Smoke-only scope; quarantine flaky within 24h |

---

## Unresolved decisions (may bite later)

- **TTHW target for v0.0.1**: ≤15 min from binary launch to first streaming token (resolved 2026-05-09). Measurement: `time_to_first_stream_ms` tracked in PostHog from `app.launched` to first `agent_run.started` event. No hard CI gate in v0.0.1 — product health metric. Revisit after 10 users complete onboarding; tighten to ≤10 min target if telemetry confirms it. The /plan-devex-review measured 12 min on the happy path (CLI pre-installed) — the 15 min budget absorbs first-time Claude CLI install overhead.
- **Open question (operational, not a review tension)**: where on disk does the new `mozart` repo live? Cleared CLAUDE.md was at `~/accelerate_growth_with/claude-labs/conductor-copycat/` (to be deleted per D15). Suggest `~/dev/mozart/` or similar; user to confirm before bootstrap.

---

## TODOS (post-review)

- [ ] **D15** — `rm -rf ~/accelerate_growth_with/claude-labs/conductor-copycat/` (after confirming no untracked content)
- [ ] **D16** — Apply 6-table SQL schema in Step 1.3 (replaces cleared PLAN.md schema)
- [ ] Pick repo location for new code repo before Step 1.1 bootstrap
- [ ] Find 5 Conductor users on Discord/X asking for Windows/Linux — screenshots become first testimonials (carried from cleared PLAN.md)
- [x] ✅ DONE 2026-05-09 (CEO review HOLD SCOPE pass) — **Brand chosen: Mozart**. Placeholder era closed.
- [x] ✅ DONE 2026-05-09 — **Domain chosen: `mozart.build`** (RDAP-confirmed available; .dev is the defensive backup). Reservation moved to Step 0.0 above.
- [ ] **Migrate gstack specs into monorepo `docs/` at Step 1.1 bootstrap** — copy `~/.gstack/projects/conductor-copycat/{PLAN-v0.0.1.md,DESIGN.md,timothy-main-eng-review-test-plan-20260509-072442.md,competitors/}` into `<repo>/docs/`. Commit as `docs: migrate v0.0.1 specs from gstack project into monorepo`. After commit, archive the gstack copies to `~/.gstack/projects/conductor-copycat/archive/migrated-2026-05-09/`.
- [x] ✅ DONE 2026-05-09 — **/plan-design-review HOLD-FOCUS pass closed all 7 gaps**: onboarding 5-screen (D3), terminal 13px/1.5 (D4), dialogs platform-adaptive (D5), settings, empty/loading/error matrix (D6 warm-helpful voice), banners (risk-amber + telemetry persistent), a11y 12-shortcut moderate set (D7). DESIGN.md grew from 244 → ~720 lines. Initial 7/10 → 9/10.
- [ ] **CI guard: anti-rename-leak grep** — add a CI step that fails if any `conductor` string lands outside `docs/competitors/conductor/` (research folder). ~5 lines.
- [ ] After merging the rename: rename PostHog project from `conductor-copycat` → `mozart` (or create fresh `mozart` project — events are generic so backfill is irrelevant for v0.0.1 since no real users yet).
- [ ] Apple Dev account setup before v0.0.2 (start now, ~24h enrollment)
- [ ] Windows EV cert research (~$200-500/yr) for v0.2
- [ ] Add tour copy that explicitly says "demo with pre-recorded responses" (Codex finding)
- [ ] PR template with "Tests for this change: [link]" required field
- [ ] Phase 1 acceptance checklist as a CI workflow on `phase1-done` branch
- [ ] Document `xattr -cr` macOS workaround on /downloads page
- [ ] Document SmartScreen "More info → Run anyway" workaround on /downloads page
- [ ] After 20 active users: Station F outreach (carried from cleared PLAN.md)
- [ ] After 50 active users: Mistral developer relations conversation

---

## Naming Lock — Mozart (added 2026-05-09 CEO review)

Every external-facing string in v0.0.1 maps from the `conductor*` placeholder to the Mozart brand. CI grep guard above blocks regressions. Reference for implementers:

| Surface | Placeholder | Mozart |
|---|---|---|
| Repo name | `conductor-copycat` | `mozart` |
| Primary domain | `conductor.dev` | `mozart.build` |
| Web app subdomain | `app.conductor.dev` | `app.mozart.build` |
| Tauri bundle ID | (unspec) | `build.mozart.desktop` |
| Tauri product name | (unspec) | `Mozart` |
| Cargo crate (apps/desktop/src-tauri/Cargo.toml `[package].name`) | (unspec) | `mozart-desktop` |
| pnpm workspace name (root `package.json`) | (unspec) | `mozart` |
| Nx workspace name (`nx.json`) | (unspec) | `mozart` |
| Astro site URL (`apps/landing/astro.config.mjs site:`) | `https://conductor.dev` | `https://mozart.build` |
| Clerk allowed redirects | `https://app.conductor.dev/sso-callback` | `https://app.mozart.build/sso-callback` |
| Deep-link scheme (Tauri custom-scheme) | `conductor://` | `mozart://` |
| PostHog project | `conductor-copycat` | `mozart` |
| Demo tour repo (D6) | `conductor-quickstart-demo` | `mozart-quickstart-demo` |
| Onboarding copy | "Conductor copycat uses Claude Code CLI..." | "Mozart uses Claude Code CLI..." |
| Release artifact prefix | `conductor-copycat-*` | `mozart-*` (e.g. `mozart-0.0.1.dmg`, `mozart-0.0.1-x64.exe`, `mozart-0.0.1-x86_64.AppImage`) |
| README + landing page H1 | "Conductor Copycat" | "Mozart" |
| GitHub org (suggested) | n/a | `mozart-build` |

**Strings to KEEP unchanged** (these refer to the competitor, not us):
- `competitors/conductor/` (research folder)
- `Conductor.build`, `Conductor's pattern`, "Conductor v0.6.0" (proper nouns referring to the competitor product)
- D15 path `~/accelerate_growth_with/claude-labs/conductor-copycat/` (the stale folder we are deleting; reference path stays accurate until rm)

---

## Completion Summary

- Step 0: **Scope reduced** (multi-provider deferred to v0.0.2; capacity=4 → 1; web+Clerk+landing kept but sequenced in Phase 2; auth chain collapsed from 3 tiers to 1)
- Architecture review: **7 issues found, 7 resolved** (Nx+Tauri, type safety, deployment, Clerk Angular, Claude CLI, PostHog, tour offline)
- Code quality review: **4 issues found, 4 resolved** (lib boundaries, auth tier UX, SSE parser drift → simplified by D5 reduction, telemetry DB sharing)
- Test review: **1 diagram produced, 63 paths identified, all are forward gaps (green-field, no regressions)**
- Performance review: **1 issue found, 1 resolved** (bundle budgets day 1)
- Outside voice: **ran codex; 4 substantive tensions surfaced, all addressed** (4 decisions: D11/D12/D13/D14)
- Failure modes: **3 critical gaps flagged** (macOS unsigned, Windows unsigned, env-var secrets in agent runs — all documented + workarounds; mitigation moved to v0.0.2)
- NOT in scope: **23 items written**
- What already exists: **5 artifacts identified, 1 stale to delete**
- TODOS: **14 items captured**
- Parallelization: **4 lanes identified** (Phase 1 sequential, Phase 2 lanes B/C/D parallelizable in worktrees)
- Lake score: **18/22 recommendations chose complete option** (deferred: capacity=4, GitHub clone, multi-provider, notarization)
- Unresolved decisions: **0** (TTHW target resolved 2026-05-09: ≤15 min)

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 2 (cleared v0.1, HOLD SCOPE 2026-05-09 v0.0.1) | CLEAR | v0.0.1: brand locked (Mozart / mozart.build), Step 0.0 added, Naming Lock appended, TODOs #5/#6 closed; 0 critical gaps; 1 design routing → /plan-design-review queued |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 (diff review N/A pre-code) | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 (cleared v0.1, this v0.0.1) | CLEAR (PLAN) | v0.0.1: 12 issues, 12 resolved + 4 codex tensions resolved + 1 unresolved (TTHW) |
| Design Review | `/plan-design-review` | UI/UX gaps | 3 (cleared v0.1, plus 2026-05-09 narrow gap-fill pass on Mozart) | CLEAR (FULL) | 7 gaps closed: onboarding 5-screen (D3 GIF rotator), terminal 13px/1.5 (D4), dialogs platform-adaptive (D5), settings, component states (D6 warm-helpful empty), banners + risk-amber + telemetry, a11y moderate 12-shortcut set (D7). Initial 7/10 → 9/10. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 1 (cleared) | CLEAR | 5.4/10, TTHW currently unresolved for v0.0.1 |

- **CODEX:** ran outside voice during eng review; surfaced 4 substantive tensions (sequencing, agent action model, sandbox, telemetry consent) — all four resolved with D11-D14. CEO HOLD SCOPE 2026-05-09 skipped fresh outside voice (rename + design routing scope didn't warrant it).
- **CROSS-MODEL:** Codex and in-conversation review agreed on architecture overcomplexity; user chose two-phase compromise rather than full Codex collapse.
- **UNRESOLVED:** 0 — all decisions closed.
- **VERDICT:** CEO + ENG + DESIGN + DX CLEARED for v0.0.1. Brand locked: Mozart / mozart.build. DESIGN.md now specs all 11 Step 1.8 components + 5 onboarding screens + state matrix + accessibility. TTHW target: ≤15 min (`time_to_first_stream_ms` in PostHog). Plan ready to implement Phase 1 once Step 0.0 reservations complete.
