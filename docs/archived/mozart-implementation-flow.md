# MOZART — Implementation Flow (Pane-Inspired, Atomic Steps)

**Purpose:** Rigorous atomic implementation workflow for `mozart.build`, adapted from Pane's `/discussion → /plan → /implement` pipeline to MOZART's exact stack (Nx + PNPM + Angular + Tauri + Rust + Astro).  
**Stack:** `apps/desktop` (Angular+Tauri), `apps/web` (Angular+Clerk), `apps/landing` (Astro), `libs/spartan`, `libs/design-tokens`  
**Reference plan:** `PLAN-v0.0.1.md` (Phase 1 first, Phase 2 after local desktop works)

---

## Prerequisites Before Any Implementation Session

### Repository Infrastructure (Do Once)

**1. Create AGENTS.md at repo root (< 100 lines)**
```markdown
# AGENTS.md
## Project: MOZART (mozart.build)
## Structure: Nx monorepo, PNPM workspaces
## Apps: apps/desktop (Angular+Tauri), apps/web (Angular+Clerk), apps/landing (Astro)
## Libs: libs/spartan (vendored Hlm), libs/design-tokens
## Commands:
  - pnpm dev:desktop    → Tauri dev mode
  - pnpm typecheck      → nx run-many --target=typecheck
  - pnpm lint           → nx run-many --target=lint
  - pnpm test           → vitest + cargo test
## Conventions: 2-space indent, camelCase vars, PascalCase components, kebab-case files
## Imports: @mozart/* aliases only, never relative ../../
## Types: cross-app types live in libs/design-tokens or shared types file
## DB: SQLite WAL mode, 6-table schema (Task/Workspace/Thread/AgentRun/AgentEvent/WorkspaceChanges)
```

**2. Grow CLAUDE.md over time**
- Full 3-panel layout architecture
- Tauri IPC command patterns (tauri-specta generated bindings)
- Rust AppError patterns
- Angular service conventions
- Every decision from PLAN-v0.0.1.md § Decision Audit Trail

**3. Set up .claude/ directory**
- Copy Pane's agents as starting point: https://github.com/dcouple/Pane/tree/main/.claude/agents
- Adapt skill commands to MOZART's validation commands
- Hook: block `cargo build --release` on non-main branch, block `git push --force`

**4. Install Compound Engineering Plugin (optional but recommended)**
```
/plugin marketplace add EveryInc/compound-engineering-plugin
/plugin install compound-engineering
```
Use `/ce-strategy` first to lock STRATEGY.md. Use `/ce-compound` after every atomic step.

---

## PHASE 1: Desktop Core (Atomic Milestones)

> All Phase 1 steps must be complete and locally working before Phase 2 starts.

---

### M1 — Nx Monorepo Bootstrap

**Goal:** Clean monorepo scaffold with all apps + libs created, CI scripts working.

**Discussion before coding:**
```
/discussion
→ "Show me the exact pnpm workspace + Nx config needed for apps/desktop, apps/web, apps/landing, libs/spartan, libs/design-tokens"
→ "What's the correct Nx executor to wrap tauri-cli? Show me how nx:run-commands would call tauri dev"
→ "What node version pin strategy works across Linux CI + macOS dev?"
```

**Atomic tasks (implement in this order — each independently verifiable):**
1. `pnpm init` + `pnpm-workspace.yaml` with all 3 apps + 2 libs
2. `nx.json` + root `project.json` with `typecheck`, `lint`, `test`, `build` targets
3. `apps/desktop` scaffold: `cargo create-tauri-app` output restructured into Nx app
4. `apps/web` scaffold: `ng new` Angular app in Nx
5. `apps/landing` scaffold: `create astro` in Nx
6. `libs/spartan` scaffold: Hlm components directory
7. `libs/design-tokens` scaffold: SCSS tokens from `DESIGN.md`
8. Root scripts: `pnpm typecheck`, `pnpm lint`, `pnpm test` that delegate via Nx

**Validation gate (must pass before M2):**
```bash
pnpm typecheck && pnpm lint && pnpm test
# All 3 apps and 2 libs must report clean
```

**Compound after M1:** Document Nx executor config for Tauri, workspace alias setup.

---

### M2 — Design Tokens + Spartan Hlm Foundation

**Goal:** `libs/design-tokens` exports all SCSS vars from `DESIGN.md`. `libs/spartan` has base components.

**Discussion before coding:**
```
/discussion
→ "How do Angular apps consume an SCSS library in an Nx monorepo? Show me the tsconfig paths + style imports"
→ "In libs/spartan, should Hlm components use Angular standalone components or NgModules?"
```

**Atomic tasks:**
1. `libs/design-tokens/src/index.scss` — all tokens from `DESIGN.md` (bg, border, text, status, motion)
2. `libs/design-tokens/src/index.ts` — TypeScript constants for tokens used in Angular (for runtime theming)
3. `libs/spartan` — base Hlm components needed for M3: Button, Badge, Tooltip, Separator
4. Wire `libs/design-tokens` into `apps/desktop` + `apps/web` via angular.json `stylePreprocessorOptions`
5. Smoke test: a single Angular component using a token renders correctly

**Validation gate:** `pnpm typecheck && pnpm lint` clean + visual smoke test in browser

**Compound after M2:** Document how libs are consumed in Angular in this Nx setup.

---

### M3 — Tauri Shell: 3-Panel Layout

**Goal:** Tauri app opens with exact 3-panel layout from `DESIGN.md`. No agent functionality yet.

**Discussion before coding:**
```
/discussion
→ "Show me all files in apps/desktop related to the main window setup and Angular router"
→ "How should the 3-panel layout (sidebar 220px + center flex + right 320px) be structured in Angular? Single shell component or router outlets?"
→ "What Tauri window config (min size, decorations, vibrancy) matches the dark IDE aesthetic?"
```

**Atomic tasks (in this exact order — Tauri bindings must exist before Angular uses them):**
1. Tauri `main.rs` — window config: dark, min-width 900px, transparent title bar
2. `tauri.conf.json` — correct permissions, CSP, bundle identifiers
3. Angular `app-shell.component.ts` — 3-panel layout using design tokens
4. Sidebar component: project list placeholder, agent status dots
5. Center panel: agent stream placeholder with empty state
6. Right panel: diff viewer placeholder + terminal placeholder
7. Top bar: 36px, Mozart logo + workspace name

**Validation gate:**
```bash
pnpm dev:desktop  # Tauri opens, 3 panels visible, no console errors
pnpm typecheck && pnpm lint
```

**Compound after M3:** Document Tauri window config patterns, Angular-Tauri IPC setup.

---

### M4 — SQLite Schema + Rust Backend Foundation

**Goal:** 6-table SQLite schema running in Tauri. tauri-specta bindings generated. No UI yet.

**Discussion before coding:**
```
/discussion
→ "Show me the exact 6-table schema referenced in PLAN-v0.0.1.md (Task/Workspace/Thread/AgentRun/AgentEvent/WorkspaceChanges)"
→ "How does tauri-specta generate TypeScript types from Rust commands? Show me the setup"
→ "What's the WAL mode + writer task pattern for SQLite in Tauri?"
```

**Atomic tasks:**
1. `Cargo.toml` — add `rusqlite`, `tauri-specta`, `serde`, `tokio`
2. `src-tauri/src/db/schema.rs` — all 6 tables, migrations pattern
3. `src-tauri/src/db/mod.rs` — connection pool, WAL mode setup
4. `src-tauri/src/error.rs` — `AppError` enum (tauri-specta exported to TS)
5. `src-tauri/src/commands/workspace.rs` — CRUD commands for Workspace
6. tauri-specta bindings generation step in build process
7. Angular `workspace.service.ts` — typed wrapper around generated IPC bindings
8. Cargo test: schema creation, basic CRUD, WAL mode

**Validation gate:**
```bash
cargo test -p desktop
pnpm typecheck  # Generated TS bindings must type-check
```

**Compound after M4:** Document Rust → TS binding generation flow, AppError pattern.

---

### M5 — Claude Code CLI Detection + Auth

**Goal:** App detects if Claude Code CLI is installed and authenticated. Runs `claude auth login` in PTY if not. (D9 from plan.)

**Discussion before coding:**
```
/discussion
→ "How do I detect if the `claude` binary is on PATH from Tauri/Rust? What Tauri command does this?"
→ "How does PTY spawning work in Tauri on macOS + Linux? Which crate? What's the angular component that renders PTY output?"
→ "What exactly does `claude auth login` output that tells us auth is complete?"
```

**Atomic tasks:**
1. `src-tauri/src/commands/claude_cli.rs` — `check_claude_installed()` command
2. `src-tauri/src/commands/claude_cli.rs` — `check_claude_authed()` (runs `claude status` or equivalent)
3. `src-tauri/src/pty/mod.rs` — PTY spawner using `portable-pty` or `libc`
4. `src-tauri/src/commands/auth.rs` — `spawn_claude_auth_login()` → streams PTY output as events
5. Angular `setup.component.ts` — onboarding screen showing auth state
6. Angular `pty-terminal.component.ts` — renders streaming PTY output
7. Wire: Q2 from plan — setup screen shows active auth state explicitly, user can override

**Validation gate:**
```bash
# Manual test: run app without claude installed → setup screen shows correct error
# Manual test: run app with claude installed + authed → passes through to main shell
pnpm typecheck && pnpm lint
```

**Compound after M5:** Document PTY spawn pattern + auth state detection for future agent runs.

---

### M6 — Workspace Management + Worktree Create

**Goal:** User can add a local folder as a workspace. App creates a git worktree for it. (Core of D2 — local folder only.)

**Discussion before coding:**
```
/discussion
→ "Show me the Workspace table schema we created in M4. What fields does a workspace have?"
→ "How do git worktrees work on the filesystem? What commands do we run to create one?"
→ "Where should worktrees live? Inside the project? ~/.mozart/worktrees/?"
→ "What does the 'Add Workspace' flow look like in the sidebar?"
```

**Atomic tasks:**
1. `src-tauri/src/commands/workspace.rs` — `add_workspace(path)` → validates git repo, creates entry in DB
2. `src-tauri/src/worktree/mod.rs` — `create_worktree(workspace_id, branch_name)` using `git worktree add`
3. `.env` auto-copy to new worktree (Pane pattern — do this from day 1)
4. Angular `add-workspace-dialog.component.ts` — file picker + validation
5. Angular `workspace-list.component.ts` in sidebar — shows workspaces with status dots
6. Angular `workspace.service.ts` — IPC calls + reactive state (RxJS/signals)

**Validation gate:**
```bash
# Manual test: add a local git repo → worktree created on disk → appears in sidebar
pnpm typecheck && pnpm lint
cargo test  # workspace CRUD
```

**Compound after M6:** Document worktree creation strategy + .env copy pattern.

---

### M7 — Claude Code CLI Agent Loop (Streaming)

**Goal:** App can run Claude Code CLI in a worktree and stream output to the center panel. Single agent, sequential runs. (D4, D5 from plan.)

**Discussion before coding:**
```
/discussion
→ "How do we spawn `claude` as a subprocess in a specific working directory from Tauri/Rust?"
→ "What streaming output events does Claude Code CLI produce? How do we parse them?"
→ "What's the minimal parser for Claude CLI output we need (Q3 from plan — keep it minimal)?"
→ "How does the AgentRun/AgentEvent schema from M4 map to the streaming events?"
```

**Atomic tasks:**
1. `src-tauri/src/agent/runner.rs` — spawn `claude` subprocess in worktree cwd, stream stdout
2. `src-tauri/src/agent/parser.rs` — minimal Claude CLI output parser (StreamEvent enum, minimal — Q3)
3. `src-tauri/src/commands/agent.rs` — `start_agent_run(workspace_id, prompt)`, `stop_agent_run(run_id)`
4. `src-tauri/src/db/agent_events.rs` — persist AgentEvents from stream to SQLite
5. Angular `agent-stream.component.ts` (center panel) — renders streaming events as they arrive
6. Angular `agent-controls.component.ts` — Start / Stop / Discard buttons
7. Safety: `git checkpoint` (commit) before each run (D13 from plan)
8. Safety: force `cwd=worktree`, never agent's own dir

**Validation gate:**
```bash
# Manual test: add workspace → start agent with "hello" prompt → see streaming output in center panel
# Manual test: Stop button terminates subprocess cleanly
pnpm typecheck && pnpm lint
cargo test  # agent runner unit tests (mocked claude binary)
```

**Compound after M7:** Document Claude CLI subprocess patterns + streaming event parsing.

---

### M8 — Diff Viewer + Git Checkpoint

**Goal:** Right panel shows diff of worktree changes after agent run. User can commit or discard.

**Discussion before coding:**
```
/discussion
→ "Show me how the right panel placeholder is structured from M3"
→ "What git commands give us the diff of worktree changes vs. the checkpoint commit?"
→ "How do we syntax-highlight diffs in Angular? Which lib? Or hand-rolled with design tokens?"
```

**Atomic tasks:**
1. `src-tauri/src/commands/git.rs` — `get_worktree_diff(worktree_path)` → returns parsed diff
2. Angular `diff-viewer.component.ts` — syntax-highlighted diff (Pane pattern — built-in, not external)
3. `src-tauri/src/commands/git.rs` — `commit_changes(worktree_path, message)` keyboard-triggered
4. `src-tauri/src/commands/git.rs` — `discard_changes(worktree_path)` → resets to checkpoint
5. Angular keyboard shortcuts: `⌘Enter` commit, `⌘D` discard

**Validation gate:**
```bash
# Manual test: run agent → changes appear in diff viewer with syntax highlighting
# Manual test: commit → git log shows new commit in worktree
# Manual test: discard → working tree clean
```

**Compound after M8:** Document diff viewer implementation + keyboard shortcut wiring in Angular+Tauri.

---

### M9 — Onboarding Tour

**Goal:** First-launch onboarding with bundled tour. (D6, A7 from plan.)

**Atomic tasks:**
1. Create `mozart-quickstart-demo` public GitHub repo: plain HTML/CSS/JS + `tour-script.json`
2. Bundle snapshot in installer
3. Angular `onboarding.component.ts` — tour overlay triggered on first launch
4. `tour-script.json` parser — step-by-step tour over the 3-panel layout
5. Background: try GitHub clone for fresh content, fall back to bundled snapshot

**Validation gate:**
```bash
# Manual test: fresh install → tour appears → completes → doesn't appear again
```

**Compound after M9:** Document tour bundling + lazy-refresh strategy.

---

### PHASE 1 COMPLETION GATE

```bash
# All must pass before Phase 2 starts:
pnpm typecheck        # clean across all apps + libs
pnpm lint             # clean across all apps + libs
cargo test -p desktop # all Rust unit tests pass
pnpm test             # Vitest tests pass

# Manual smoke tests:
# ✅ App opens (Tauri shell, 3-panel layout, dark IDE)
# ✅ Claude CLI detected + auth flow works
# ✅ Add local git repo as workspace
# ✅ Start agent run → see streaming output
# ✅ Stop agent run → clean subprocess kill
# ✅ Diff viewer shows changes after run
# ✅ Commit from app → git log correct
# ✅ Discard → working tree clean to checkpoint
# ✅ Onboarding tour completes
```

---

## PHASE 2: Production Polish (After Phase 1 Gate Passes)

> Phase 2 ships in the same v0.0.1 release. Don't start until Phase 1 gate is green.

---

### M10 — Astro Landing (apps/landing)

**Atomic tasks:**
1. Astro page with hero, feature grid, download buttons per platform
2. `Cloudflare Pages` deploy wired to `apps/landing` build
3. Lead capture form (email) before download

---

### M11 — Angular Web + Clerk OAuth (apps/web)

**Atomic tasks:**
1. `@clerk/clerk-js` + `clerk.service.ts` (no shared lib — A4 from plan)
2. Sign-in / sign-up pages
3. Protected dashboard redirect to desktop download
4. `Cloudflare Pages` deploy on `app.mozart.build`

---

### M12 — PostHog Telemetry (Rust Outbox)

**Atomic tasks:**
1. `src-tauri/src/telemetry/outbox.rs` — SQLite `events_outbox` table
2. `src-tauri/src/telemetry/drain.rs` — background drain task via `reqwest`
3. First-launch opt-out banner (Conductor's pattern — D14)
4. Anonymous `device_id` only, no PII

---

### M13 — CI + GitHub Releases

**Atomic tasks:**
1. GitHub Actions matrix: macOS, Linux, Windows
2. Tag trigger → `tauri build` per platform → upload artifacts
3. `SHA256SUMS` file attached to release
4. Automated unsigned Windows build (note: code signing deferred to v0.0.2 per plan)

---

## Cross-Cutting Rules (Every Milestone)

### The One-Way Rule (Most Critical)
One way to do everything. If you add a pattern, it must be the only way. Before adding:
- Search codebase for existing similar patterns
- If found: extend it, don't duplicate
- If not found: document it in CLAUDE.md as the canonical pattern

### Validation Loop (Every Atomic Task)
```bash
pnpm typecheck && pnpm lint && cargo test -p desktop
```
Never proceed to next task with a failing validation gate.

### Commit Discipline
- One commit per completed atomic task
- Never `git add .`
- Commit message format: `feat(M{N}): <what>` or `fix(M{N}): <what>`

### Context Sharing
- After each milestone: update CLAUDE.md with new patterns
- Before each /discussion: re-read AGENTS.md + relevant CLAUDE.md sections
- Write `.context/context.md` summaries for decisions that span milestones

### Death Loop Prevention
If agent is stuck on a task for > 30min:
1. Stop the agent run
2. Go back to /discussion
3. Decompose the task further (it's too big)
4. Never push harder on a broken approach

---

## Skill Commands for MOZART (Recommended Setup)

```bash
# In MOZART .claude/skills/:
/discussion   → codebase-explorer + researcher subagents, never modifies code
/plan         → generates plan to ./tmp/ready-plans/, auto plan-reviewer loop
/implement    → reads ready-plans/, parallelizes chunks, moves to done-plans/
/commit       → groups by done-plans, never git add .
/review       → runs review agents in parallel (single-way check is #1 priority)
/compound     → documents learnings after each milestone (from compound-engineering)
```

---

## Notes on Pane Patterns NOT to Copy

- Pane is cross-platform from day 1 (Windows + Mac + Linux). MOZART v0.0.1 is macOS-first per PLAN.
- Pane is agent-agnostic (any CLI). MOZART v0.0.1 wraps Claude Code CLI only (multi-provider in v0.0.2).
- Pane has no cloud execution. MOZART v0.0.1 also local-only. Cloud sandboxing is a future differentiator.
- Pane uses AGPL-3.0. Consider MIT or Apache-2.0 for MOZART if targeting enterprise embedding.
