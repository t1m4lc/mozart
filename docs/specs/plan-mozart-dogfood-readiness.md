# Plan — Mozart dogfood readiness

> Status: draft, awaiting Ultraplan review per [[feedback_plan_ultraplan]].
> Cross-refs: [`plan-v0.1.0-beta.1.md`](./plan-v0.1.0-beta.1.md) Phases 1, 4, 7;
> [`mozart-product-architecture-specs.md`](./mozart-product-architecture-specs.md).
> Vocabulary: locked per CLAUDE.md (never expose `worktree`, `branch_name`,
> `HEAD`, `detached HEAD`, `agent/wip-*` in UI surfaces).

## How to use this plan (read first if you came here cold)

This document is the single source of truth for the dogfood-readiness
work. Anything you want to do — review, refine, implement, track — you
start here. No other artifact is required.

### Per-scenario navigation

| Goal | Section to open |
|---|---|
| Re-read / review the plan | "Phasing" → "Architectural decisions log" → "NOT in scope" → "TODOs" → "Completion summary" |
| Refine the plan (add / change / cut an atom) | edit the relevant phase section in place; commit; no remote review tool required |
| Pick the next atom to implement | "Worktree parallelization strategy" — work through lanes top to bottom |
| Understand a locked decision | "Architectural decisions log" (AD-01 through AD-06). Re-open a decision only with a strong reason. |
| Trace failure scenarios | "Failure modes — production scenarios" + the "Critical gaps" callouts |
| Find what already exists in the codebase | "What already exists" section |
| Track progress | the `[ ]` checkboxes flip to `[x]` as atoms ship. `grep '\[x\]'` to see what's done. |

### Per-atom implementation template (drop into a fresh chat)

Each atom in this plan is a self-contained, commitable functional
slice (per [[feedback_atom_unit]]). When starting an atom in a
context-clean session, paste this prompt — replace `<ATOM_ID>` with
the atom you want (e.g. `P0.1.B`, `A1.2.A`, `P3.4`):

```
Implement atom <ATOM_ID> from docs/specs/plan-mozart-dogfood-readiness.md.

Rules:
- Read the atom's section in full; follow CLAUDE.md; honor auto-loaded
  memory (Viewed principle, Repo init principle, etc.).
- One atom = one functional slice. Do NOT do the whole phase.
- End with the atom's "Manual checkpoint" so I can verify before commit.
- Do not commit until I confirm the checkpoint passes.
```

That's the entire bootstrap. Memory auto-loads, CLAUDE.md auto-loads,
the plan section is self-describing. No other context-priming
required.

### Recommended implementation order

Three waves. Inside a wave, atoms are independent — run them in
parallel chats (each cleared on completion) without merge conflict.

```
Wave 1 (start anywhere, atoms are independent):
  P3.4    Remove Archive button (smallest — use to learn the flow)
  P3.1    Composer effort/mode/model heights + chevron
  P3.2    Dot loader trim
  P0.1.B  SandboxLevel enum + DB migration
  P1.1.A  Audit aside tab state (no code, just a doc-comment)

Wave 2 (depends on Wave 1):
  P0.1.C  build_sandbox_flags + production argv
  P0.1.D  Path canonicalize guard at IPC boundary
  P0.2.A  isFrozen signal
  P0.2.B  Frontend UI gates for freeze
  P0.3.A  serde_json preserve_order + IndexMap DTO
  P1.1.B  Move tab state to UiStateStore per-workspace

Wave 3 (depends on Wave 2):
  P0.1.E  Sandbox-level toggle UI
  P0.2.C  Rust IPC guards for freeze
  P0.3.B  Detector + probe (5 stacks)
  P0.3.C  Schema validator
  P1.2.A  FileTreeCache signal store
  P1.3.A/B/C  Chat-panel refactor (sequential within this group)

Wave 4 and beyond: see "Worktree parallelization strategy" section.
```

### Anti-regression rules (DO NOT do these while implementing)

- Do not edit `libs/ui/**` — vendored Spartan primitives, read-only
  per CLAUDE.md.
- Do not expose `worktree`, `branch_name`, `HEAD`, `detached HEAD`,
  `agent/wip-*`, `checkpoint sha` in user-facing strings.
- Do not auto-`git add` or auto-commit `.mozart/` files
  ([[mozart-repo-init-principle]]).
- Do not gate Merge-now / Create PR / commit on the Viewed state —
  soft warning only ([[mozart-viewed-principle]]).
- Do not run `/ultraplan` from inside Claude Code — it is broken for
  this account/branch as of 2026-05-19 and not on the critical path.
  Refine this plan in-place and commit deltas.
- Do not bulk `git add` — the project hook blocks it. Add specific
  files only.

---

## Why this plan

The author wants to dogfood Mozart on Mozart itself. That requires three
things that are not yet in place:

1. **A real agent permission sandbox.** Today `runner.rs:147-152` ships
   `claude -p` with zero permission flags (no `--add-dir`, no
   `--permission-mode`, no `--allowedTools`). The directory named
   `src-tauri/src/sandbox/` is a git-checkpoint module, not a permission
   sandbox. Until L1/L2/L3 isolation exists, agent runs can in principle
   read or mutate anything the user can.
2. **A complete review surface.** The diff viewer is read-only, has no
   unified/split toggle, no Edit mode, no per-file Viewed state, no
   grouped-hunk expansion, no context menu. The composer is rebuilt
   per-view instead of being a shared frame. Markdown files render
   instead of opening as code.
3. **A merge/clôture loop.** `Create PR` exists in the right-aside
   header; `Merge now` (local merge into the workspace's base) does
   not. A merged workspace stays editable — there is no freeze on
   `done`.

This plan covers exactly those gaps plus the bugs and polish items the
author has hit while using the existing build. Out-of-scope (Bucket E in
the scope analysis) is captured in [§ NOT in scope](#not-in-scope).

## Phasing

```
P0 — Security gate                                  blocks dogfood
   ├── P0.1  Agent permission sandbox (L1 / L2 / L3)
   ├── P0.2  Workspace freeze enforcement
   └── P0.3  Repo init flow + .mozart/ files

P1 — Bugs + frame                                   solid foundation
   ├── P1.1  Right-aside tab persistence (per-workspace)
   ├── P1.2  File-tree caching + skeleton on switch
   └── P1.3  Chat-panel + composer frame refactor

P2 — Review UX                                      productive review
   ├── P2.1  Code editor (CodeMirror 6) + line numbers
   ├── P2.2  Diff toolbar + Viewed state + soft warning
   ├── P2.3  Grouped diff hunks + expand bars
   ├── P2.4  Tab-aware file open behavior
   ├── P2.5  Context menu on Changes
   ├── P2.6  Merge-now + scenario routing
   └── P2.7  Auto-route to Changes on agent-run end

P3 — Polish                                         cosmetic
   ├── P3.1  Composer effort/mode/model select height + chevron
   ├── P3.2  Dot loader size
   ├── P3.3  Global `select-none` with allow-list
   ├── P3.4  Remove Archive button from workspace menu
   ├── P3.5  Tauri app icons (request set from author)
   └── P3.6  Rename `ui-markdown-view` to chat-scoped name

P4 — Follow-ups (NOT in this plan, captured for tracking)
   ├── OS-level sandbox fence (sandbox-exec / bubblewrap / AppContainer)
   ├── Keyboard shortcuts for review nav (←/→ between unviewed)
   ├── Inline 3-way conflict editor
   ├── "Move config to repository" / "Adopt repo config" migrations
   ├── Per-file "Translate markdown" context-menu action
   └── "Copy chat to another workspace" cross-workspace context import
```

Each phase ends with a **demoable milestone** (per Phase A/B methodology
in `plan-v0.1.0-beta.1.md:38`). Each atom inside a phase ends with a
**manual checkpoint** (per [[feedback_atom_checkpoint]]).

## Architectural decisions log

The five locked architectural decisions, with one-line rationale.

| # | Decision | Rationale |
|---|---|---|
| AD-01 | **Sandbox** = Claude CLI flags (`--add-dir` whitelist + `--permission-mode acceptEdits` + `--allowedTools` per mode) + Rust path-canonicalize at IPC boundary; OS-level fence deferred to P4. | Ship dogfood-safe security now without per-OS fence complexity. |
| AD-02 | **Merge routing** = `.mozart/run.json` derives no merge preference; per-project `mergeMode` lives in **Mozart local DB** (`project_local_config`); per-workspace `last_merge_action` overrides it for the primary-button label, IDE-button style. | User-specific preference, never shared with team. Last-action memory mirrors the existing Open-in-IDE pattern. |
| AD-03 | **Viewed state** = passive review aid only. Decoupled from staging. Auto-set on diff open. Content-hash stale detection. Soft warning at merge/PR/commit, single-click bypass. See [[mozart-viewed-principle]]. | Reduces review cognitive load without ceremony. |
| AD-04 | **Editor** = CodeMirror 6 + `@codemirror/merge`. One library drives Diff (unified+split) and Edit modes. `.md` files open as code. | Lightweight, modular, minimal-feeling, ~250KB gzipped. Monaco is heavier and harder to keep visually minimal. |
| AD-05 | **Freeze** = frontend `isFrozen` signal + Rust IPC guards on every mutating command with new `AppError::Frozen` variant. Belt-and-braces. | Single-source enforcement (frontend-only) is fragile; layered is robust. |
| AD-06 | **Repo init** = dedicated screen before first workspace creation. Two-file split (`.mozart/settings.json` + `.mozart/run.json`). Default storage = **Keep local** for imported repos. Mozart never auto-commits. See [[mozart-repo-init-principle]]. | Mozart is not an IDE that opens a folder; it manages workspaces. Imported repos belong to the user. |

---

# P0 — Security gate

Demoable milestone (end of P0): the author can spin up a workspace on
the `mozart-go` repo, ask the agent to make a change, observe that the
agent cannot read `~/.ssh` or write outside `~/.mozart/worktrees`, mark
the workspace `done` and see it freeze, and reopen it through the
status menu with a confirmation.

## P0.1 — Agent permission sandbox (L1 / L2 / L3)

### Goal

Three-level isolation:

```
                ┌─────────────────────────────────────────────────┐
L1 Mozart       │ --add-dir ~/.mozart/worktrees                   │
   (always-on,  │ --add-dir ~/.mozart/projects                    │
   no-dismiss)  │ Rust IPC: canonicalize() any path arg from agent │
                │ reject if outside L1 whitelist                  │
                └─────────────────────────────────────────────────┘
                           │ caller may downgrade ↓
                ┌─────────────────────────────────────────────────┐
L2 Project      │ --add-dir <all worktrees of this project>       │
   (default,    │ Lets agent peek at sibling workspaces (context) │
   dismissable) │ Project is the natural sharing unit.             │
                └─────────────────────────────────────────────────┘
                           │ user may tighten ↓
                ┌─────────────────────────────────────────────────┐
L3 Workspace    │ --add-dir <this worktree only>                  │
   (tightest,   │ --disallowedTools=Bash,WebFetch for plan/ask    │
   dismissable) │ Strictest: only this isolated execution attempt │
                └─────────────────────────────────────────────────┘
```

Plus mandatory on every run regardless of level:
- `--permission-mode acceptEdits` (so tools actually fire in `-p` mode)
- `--allowedTools` whitelist derived from `chat.mode`:
  - `agent` → `Read,Write,Edit,Bash,Glob,Grep,WebFetch`
  - `plan` → `Read,Glob,Grep,WebFetch` (no Write, no Bash)
  - `ask` → `Read,Glob,Grep` (no WebFetch either)

### S0.1.A probe outcome — hypothesis falsified, security urgency raised

The "silent tool deny in `-p` mode" hypothesis was verified on
2026-05-19 (claude CLI v2.1.144). Running Mozart's exact argv against
a scratch repo:

```
BEFORE: foo.txt = "old"
ARGV:   claude -p "edit foo.txt to say new" --output-format=stream-json
        --include-partial-messages --verbose
AGENT:  Bash(ls foo.txt) → Read(foo.txt) → Edit(old→new)
AFTER:  foo.txt = "new"
permission_denials: []   (every tool call fired)
```

**Conclusion:** Claude CLI in `-p` mode does NOT silently refuse tool
calls. Tools fire under the default policy. The "dogfood broken by
missing permission flag" framing is wrong.

**What this changes for P0.1:** the urgency *increases* rather than
decreases. The agent in today's Mozart shell has **full ambient
filesystem authority** via `Read` / `Write` / `Edit` / `Bash` with no
`--add-dir` ceiling and no path canonicalization at the IPC boundary.
A misbehaving or jailbroken agent could read `~/.ssh`, write into
`~/.config`, or execute anything the user can. P0.1 stops being "fix
a bug AND add layering" and becomes "wall off the wide-open agent
before any external user gets near Mozart."

The `--permission-mode` knob still matters but for a different reason:
`acceptEdits` is the right default for an agentic workspace (don't
prompt per tool call); the alternative `plan` mode pairs naturally with
Mozart's read-only chat modes (P0.1.C `allowed_tools_for_mode` mapping).
Both are still in scope for P0.1.

### Atoms

#### Atom S0.1.A — Verify the silent-tool-deny hypothesis ✅ DONE 2026-05-19

- [x] Probe executed against `claude` v2.1.144 in a scratch git repo.
      Result: tools fire by default in `-p` mode. See
      [§ S0.1.A probe outcome](#s01a-probe-outcome--hypothesis-falsified-security-urgency-raised)
      above.
- [x] Cost: ~$0.18 / 13s. Session id `b6ef60fc-...` retained for audit.
- [ ] **Follow-up:** Add a doc-comment on `runner.rs:147-152` capturing
      "tools fire by default; sandbox flags are about WHERE they fire,
      not WHETHER they fire." This is a 1-line code change folded into
      S0.1.C.

Outcome shaped P0.1 framing: the urgency is no longer "fix silent
deny + add layering," it is "wall off a wide-open agent."

#### Atom S0.1.B — `SandboxLevel` enum + default plumbing

- [ ] New Rust type `SandboxLevel { L1Mozart, L2Project, L3Workspace }`
      in `claude_cli/sandbox_policy.rs` (new file alongside `runner.rs`).
- [ ] DB migration: add `sandbox_level TEXT NOT NULL DEFAULT
      'L2Project'` to `workspaces` table.
- [ ] Workspaces start at L2Project. UI exposes a level toggle in the
      workspace status menu (P0 just wires the data + Tauri command;
      the actual UI control is a P2.1 follow-on atom).
- [ ] **Manual checkpoint:** Open SQLite browser, verify new column,
      verify existing workspaces backfilled to `L2Project`. App boots
      without runtime error.

Files: ~5 (migration, models.rs, schema mirror, facade, store).

#### Atom S0.1.C — Build the argv from `SandboxLevel`

- [ ] In `claude_cli/sandbox_policy.rs`, function
      `build_sandbox_flags(workspace, level) -> Vec<String>`. Pure,
      no IO except resolving paths via `canonical_worktrees_root()`.
- [ ] Returns `--add-dir` flags for the level's directory set:
      - L1: `[~/.mozart/worktrees, ~/.mozart/projects]`
      - L2: all worktree paths of workspaces in the same project
      - L3: just `workspace.worktree_path`
- [ ] Returns `--permission-mode acceptEdits` always.
- [ ] Returns `--allowedTools` from the active chat's mode.
- [ ] `runner.rs:command_argv_for_test` is renamed `production_argv` and
      now takes `(workspace, run, chat_mode, level)`. The locked-flag
      test in `runner.rs:567` updates to assert the **new** flag set
      (presence of `--add-dir` for L1, `--permission-mode=acceptEdits`,
      `--allowedTools=…`, and continued absence of
      `--dangerously-skip-permissions`).
- [ ] **Manual checkpoint:** Run a real agent turn through Mozart with
      L2 default. Open `~/.mozart/logs/*.log` (or stderr capture), grep
      for the argv. Verify `--add-dir` is present for every workspace
      in the active project and only those. Try a prompt that asks the
      agent to read `~/.ssh/id_rsa` — agent should report it cannot.

Files: ~3 (sandbox_policy.rs new, runner.rs argv site, parser test).
Tests: 6 unit tests in sandbox_policy_test.rs covering level → flag-set
matrix.

#### Atom S0.1.D — Rust path-canonicalize guard at IPC boundary

- [ ] New `path_guard.rs` exporting
      `validate_agent_path(path: &Path, ws: &Workspace) -> Result<PathBuf,
      AppError>` that:
      1. `canonicalize()` the input
      2. Asserts the canonical form starts with the resolved canonical
         root (`canonical_worktrees_root()` for L1, project worktrees
         set for L2, single worktree for L3)
      3. Rejects symlinks pointing outside via standard
         `fs::canonicalize` behavior (canonicalize resolves symlinks)
- [ ] Every Tauri command that takes a path *originating from agent
      output* threads it through this guard. Audit list (initial):
      `file_read`, `file_write`, `file_diff::*`, `commit::*`,
      `discard_changes_to`. Identified via `grep "tauri::command"`.
- [ ] Returns `AppError::PathRefused { canonical, level }`.
- [ ] **Manual checkpoint:** Write a Cargo test that crafts a path with
      `..` traversal and a path that targets a symlink pointing outside
      the canonical root. Both must reject. Manually try via the agent:
      "edit ../../etc/hosts" — must surface the rejection in the
      timeline.

Files: ~2 + audit edits across ~6 command sites. Tests: 8 cases (happy
+ traversal + symlink-out + non-existent + relative + UNC on Windows
guarded via `#[cfg(unix)]` for now).

#### Atom S0.1.E — Sandbox-level toggle UI (workspace status menu)

- [ ] Add a `SandboxLevelMenu` Hlm-menu primitive inside the existing
      `workspace-status-menu` component.
- [ ] Three radio options labelled in product vocab — never expose the
      underlying enum:
      - "Full project access (default)"
      - "Workspace only"
      - "Mozart-wide" (L1 — only available if explicitly enabled via
        a debug toggle; not user-facing by default since L1 is the
        always-on floor, not a normal pick)
- [ ] Mutation calls a new Tauri command
      `set_workspace_sandbox_level(ws_id, level)` that writes the DB
      column. Next agent run picks it up.
- [ ] **Manual checkpoint:** Switch to L3 ("Workspace only") in a
      workspace, run an agent prompt asking it to read a file in a
      sibling workspace. Agent should fail. Switch back to L2, retry,
      should succeed.

Files: ~3 (menu component, facade method, store action). Tests: 1
e2e per level transition.

#### Atom S0.1.F — Audit: every other agent-touching IPC command

- [ ] Grep `claude_cli` callers; ensure none bypass the new policy.
- [ ] Grep all places that spawn `claude` directly — should be exactly
      one (`runner.rs:spawn_run`).
- [ ] **Manual checkpoint:** `rg "Command::new\\(\"claude" apps/desktop` →
      exactly one hit, in `claude_cli/runner.rs`.

Files: 0 (audit). Output: a comment in `runner.rs` documenting the
"single spawn site" invariant.

### Test coverage diagram for P0.1

```
[+] src-tauri/src/claude_cli/sandbox_policy.rs
  ├── build_sandbox_flags(ws, L1)            [GAP] [★★★ needed]
  ├── build_sandbox_flags(ws, L2)            [GAP] [★★★ needed]
  ├── build_sandbox_flags(ws, L3)            [GAP] [★★★ needed]
  ├── allowed_tools_for_mode('agent')        [GAP] [★★ needed]
  ├── allowed_tools_for_mode('plan')         [GAP] [★★ needed]
  └── allowed_tools_for_mode('ask')          [GAP] [★★ needed]

[+] src-tauri/src/path_guard.rs
  ├── validate_agent_path: happy path        [GAP] [★★ needed]
  ├── validate_agent_path: '..' traversal    [GAP] [★★★ REGRESSION]
  ├── validate_agent_path: symlink out       [GAP] [★★★ REGRESSION]
  ├── validate_agent_path: non-existent      [GAP] [★★ needed]
  └── validate_agent_path: relative input    [GAP] [★★ needed]

[+] src-tauri/src/claude_cli/runner.rs (modified)
  ├── unit_argv_has_locked_flag_set          [TEST EXISTS — UPDATE]
  │                                          (was asserting absence of
  │                                          --dangerously-skip-permissions;
  │                                          now also asserts presence of
  │                                          --add-dir, --permission-mode,
  │                                          --allowedTools)
  └── spawn_run uses validate_agent_path     [GAP] [→E2E]

USER FLOWS
[+] Sandbox L2 default
  ├── [GAP] [→E2E] Agent reads sibling workspace file — succeeds
  ├── [GAP] [→E2E] Agent reads ~/.ssh/id_rsa — fails with timeline error
  └── [GAP] [→E2E] Agent writes file outside ~/.mozart/worktrees — fails

[+] Sandbox level toggle
  └── [GAP] [→E2E] L2→L3 switch, sibling read fails after switch

COVERAGE: 0/14 paths covered (0%)  |  GAPS: 14
QUALITY target: ★★★:5 ★★:7 ★:0  |  REGRESSION TESTS: 2 (path traversal)
```

---

## P0.2 — Workspace freeze enforcement

### Goal

When `workspaces.status == 'done'`, the workspace is read-only.
Vocabulary locks (from your design):

| Surface | Copy |
|---|---|
| Status menu action | `Mark as done` |
| State label | `Done` |
| Read-only banner above composer | `This workspace is done and read-only` |
| Reopen action | `Reopen workspace` |
| Reopen confirmation | `Reopen this workspace? Future changes will modify a workspace previously marked as done.` |

### Mental model lock

> active workspace = on travaille
> done workspace = on consulte
> reopen workspace = on retravaille explicitement

### Blocked when frozen

- New agent runs / new prompts
- File edits / file saves
- Setup / Run script execution
- Terminal input (PTY stays alive for read-only scrollback)
- Discard changes
- Any mutating action on the workspace

### Allowed when frozen

- File reads
- Diff reads
- Run / agent log inspection
- Terminal scrollback
- Final commit / Create PR if those are part of the closure flow

### Atoms

#### Atom F0.2.A — `WorkspacesFacade.isFrozen(workspaceId)` signal

- [ ] Computed from `workspace.status === 'done'`.
- [ ] **Manual checkpoint:** In devtools, observe signal flips when
      status changes via `update_status`. Composer reads the signal.

Files: 1 (facade extension).

#### Atom F0.2.B — Frontend UI gates

- [ ] Composer: receive new `[disabled]="frozen()"` input, render
      `chat-empty-state` slot with the banner copy when true.
- [ ] CodeMirror editor (P2.1 dependency — flag this as a P2 prereq
      checklist item): `readOnly` extension when frozen.
- [ ] Run / Setup tab buttons: `disabled` when frozen.
- [ ] Discard / Discard-all buttons in Changes tab: hidden when frozen.
- [ ] Terminal input: textarea `readonly`; PTY itself untouched.
- [ ] Workspace status menu shows `Reopen workspace` instead of `Mark as
      done` when current status is `done`.
- [ ] **Manual checkpoint:** Mark a workspace done. Verify each gate.
      Reopen via menu (with confirmation). Verify all gates lift.

Files: ~6 (composer input plumbing, run/setup tab disables, discard
hide, terminal-input readonly, status-menu copy, banner component).

#### Atom F0.2.C — Rust IPC `AppError::Frozen` + guards

- [ ] New error variant `AppError::Frozen { workspace_id }` mapped to a
      typed Tauri-specta error.
- [ ] Helper `assert_workspace_active(ws_id) -> Result<(), AppError>`
      reads `workspaces.status` and returns `Frozen` if `done`.
- [ ] Guard added to (audit list):
      - `spawn_run` (runner.rs)
      - `send_prompt` if present (else `spawn_run` covers it)
      - `file_write`, `file_save` (any FS-mutating commands)
      - `run_script` (setup/run launcher — to be created in P0.3 or
        re-used from existing terminal_registry)
      - `terminal_input` (terminal.rs)
      - `discard_changes_to` (sandbox/reset.rs)
- [ ] Allowed: `git_commit`, `create_pr` (closure flow).
- [ ] **Manual checkpoint:** From devtools, force-call a Tauri command
      that's supposed to be blocked. Verify the typed error reaches
      the frontend.

Files: ~4 (error.rs, helper, ~5 command sites). Tests: 6 unit tests,
one per guarded command path returning `Frozen`.

#### Atom F0.2.D — Reopen flow

- [ ] Tauri command `reopen_workspace(ws_id, target_status: 'ready')`
      with confirmation dialog at the UI layer.
- [ ] Status reverts to `ready`. `isFrozen()` recomputes. All gates
      lift.
- [ ] **Manual checkpoint:** Click Reopen, confirm, send a new prompt.
      Agent runs. Mark done again. Cycle stable.

Files: ~2.

### Test coverage diagram for P0.2

```
[+] WorkspacesFacade.isFrozen
  └── computed from status === 'done'           [GAP] [★★ needed]

[+] Tauri command guards (each returns Frozen when status=done)
  ├── spawn_run                                 [GAP] [★★★ REGRESSION]
  ├── file_write                                [GAP] [★★★ REGRESSION]
  ├── run_script                                [GAP] [★★★ REGRESSION]
  ├── terminal_input                            [GAP] [★★★ REGRESSION]
  └── discard_changes_to                        [GAP] [★★★ REGRESSION]

[+] reopen_workspace
  ├── status: done → ready                      [GAP] [★★ needed]
  └── isFrozen flips after reopen               [GAP] [★★ needed]

USER FLOWS
  ├── [GAP] [→E2E] Mark done → composer banner shown, send button disabled
  ├── [GAP] [→E2E] Reopen with confirmation → all gates lift
  └── [GAP] [→E2E] Terminal scrollback still works after freeze

COVERAGE: 0/10  |  REGRESSION TESTS: 5 (one per guard)
```

---

## P0.3 — Repo init flow + `.mozart/` files

### Goal

Lock the project onboarding flow per [[mozart-repo-init-principle]]:

```
Add project
   │
   ▼
Detect project
   │
   ├── Mozart template (.mozart/ generated)  → skip Repo init
   ├── Existing .mozart/ present             → read-only summary, proceed
   └── No .mozart/                           → Repo init screen
                                                ┌──────────────┐
                                                │ [Cancel]     │
                                                │ [Keep local] │
                                                │ [Add config  │
                                                │  to repo]    │
                                                └──────────────┘
                                                       │
                                                       ▼
                                                Create first workspace
```

### File split

```
.mozart/settings.json  — project metadata (minimal in P0):
                         { "version": "0.1" }
.mozart/run.json       — { "scripts": { "setup": "...", "run": "..." } }
                         JSON key order drives Run/Setup tab order.

Mozart local DB        — project_local_config table:
                         user-specific, never in repo:
                         mergeMode, sandbox preference defaults,
                         IDE preference, last_merge_action per workspace.
```

### Hard rules

- Never auto-`git add`. Files appear in next Changes diff for explicit
  user commit.
- Never overwrite existing `.mozart/*` files.
- Schema validator at read **and** write rejects keys matching
  `/(password|secret|token|api[_-]?key)/i` and any value that
  `Path::is_absolute()`.
- Workspace creation is **blocked** until project has config (repo or
  local).

### Inference probe order (5 stacks, hardcoded in Rust)

```
Probe 1: pnpm-workspace.yaml | nx.json | yarn.lock | package.json
  manager = pnpm | yarn | npm (from lockfile)
  setup = "<manager> install"
  run   = first of: scripts.dev, scripts.start, scripts.serve,
                    scripts.tauri

Probe 2: Cargo.toml
  setup = "cargo build"
  run   = "cargo run" (only if [[bin]] section present)

Probe 3: pyproject.toml
  setup = "poetry install"  if [tool.poetry] present
        | "uv sync"         if uv.lock exists
        | "pip install -r requirements.txt"
                            if requirements.txt exists
  run   = "" (no Python convention; left empty)

Probe 4: go.mod
  setup = "go mod download"
  run   = "go run ."

Probe 5: Makefile with setup: or dev: targets
  setup = "make setup"  if target exists
  run   = "make dev"    if target exists

Else: both empty + warning toast "Could not detect setup/run commands.
Edit them below."
```

For Mozart-go: Probe 1 wins via `pnpm-workspace.yaml`; setup=`pnpm
install`, run=`pnpm dev` (or whichever script the user picks).

### Prerequisite: enable `serde_json` `preserve_order`

`apps/desktop/src-tauri/Cargo.toml` currently has plain
`serde_json = "1.0"`. P0.3 must change this to
`serde_json = { version = "1.0", features = ["preserve_order"] }`
or the JSON-key-order-drives-tab-order behavior cannot work.

### Atoms

#### Atom R0.3.A — `serde_json preserve_order` + `IndexMap` DTO

- [ ] Enable feature flag.
- [ ] `RunConfig` DTO uses `Vec<(String, String)>` for `scripts` (not
      `HashMap`).
- [ ] **Manual checkpoint:** Parse a JSON with `{"run":..., "setup":...}`
      and confirm vec preserves insertion order in a unit test.

Files: 2 (Cargo.toml, dto module).

#### Atom R0.3.B — Detector + probe

- [ ] `mozart_config/detect.rs` exporting `detect_project(root: &Path)
      -> ProjectDetection`.
- [ ] `ProjectDetection { has_mozart_dir, inferred_run: RunConfig,
      package_manager: Option<String> }`.
- [ ] Pure function; one async call to read manifests via `tokio::fs`.
- [ ] **Manual checkpoint:** Point at `mozart-go` repo → returns
      `{ has_mozart_dir: false, inferred: { setup: "pnpm install",
      run: "pnpm dev" } }`. Point at a `Cargo.toml`-only repo → returns
      cargo defaults.

Files: 1 + 5 unit tests (one per probe).

#### Atom R0.3.C — Schema validator

- [ ] `mozart_config/validate.rs` exporting `validate_config(json:
      &Value) -> Result<(), AppError>`.
- [ ] Walks the object; rejects:
      - Any key (at any depth) matching forbidden regex
      - Any string value matching `Path::is_absolute()` heuristic
      - Schema-version mismatch (settings.json `version` must match
        a known set)
- [ ] **Manual checkpoint:** Hand-edit `.mozart/run.json` to include
      `"setup": "/Users/timothy/install.sh"` (absolute path) → Mozart
      surfaces the validation error on next read. App does not start
      a workspace.

Files: 1 + 4 unit tests.

#### Atom R0.3.D — Tauri commands

- [ ] `detect_project_for_init(path) -> ProjectDetection`
- [ ] `init_project_repo(project_id, repo_path, run_config)` — writes
      `.mozart/settings.json` + `.mozart/run.json`. Validates first.
      Errors if files exist.
- [ ] `init_project_local(project_id, run_config)` — writes a row to
      new `project_local_config` table.
- [ ] `read_project_config(project_id) -> ProjectConfig` — checks repo
      first, falls back to local DB, errors if neither exists.
- [ ] **Manual checkpoint:** Call each from devtools; verify FS or DB
      effects match.

Files: 4 commands + 1 facade + 1 DB module + 1 migration. Tests: 4 e2e.

#### Atom R0.3.E — Repo init UI

- [ ] New `feature-repo-init` component in domain
      `apps/desktop/src/app/domains/projects/feature-repo-init/`.
- [ ] Route: `/projects/init?path=<absolute_path>` — gated, only
      reachable from the "Add project" flow.
- [ ] Layout:
      ```
      ┌─────────────────────────────────────────────────────────┐
      │  Prepare repository for Mozart                          │
      │                                                          │
      │  Before creating your first workspace, Mozart needs a   │
      │  small project configuration to set up and run agent    │
      │  workspaces.                                             │
      │                                                          │
      │  Detected stack: pnpm workspace                         │
      │  .mozart/ directory: not present                        │
      │                                                          │
      │  Setup command:  [pnpm install              ] (editable)│
      │  Run command:    [pnpm dev                  ] (editable)│
      │                                                          │
      │                  [Cancel]  [Keep local] [Add to repo]   │
      └─────────────────────────────────────────────────────────┘
      ```
- [ ] On `Add to repo` → calls `init_project_repo`, transitions to
      workspace-creation.
- [ ] On `Keep local` → calls `init_project_local`, transitions to
      workspace-creation.
- [ ] On `Cancel` → deletes the in-flight project record, returns to
      dashboard.
- [ ] **Manual checkpoint:** Import `mozart-go` as a new project → see
      detected stack → click Keep local → arrive at workspace-create.
      Git status is clean (no `.mozart/` appeared). Repeat with Add to
      repo → `.mozart/settings.json` + `.mozart/run.json` appear in
      Changes diff, but no commit was made.

Files: ~6 (component, route, facade methods, copy strings i18n
placeholder). Tests: 2 e2e (one per path) + 1 cancel path.

#### Atom R0.3.F — Existing `.mozart/` summary banner

- [ ] When detect returns `has_mozart_dir: true`, skip Repo init
      screen but show a one-shot banner on the workspace-create page:
      _"Mozart configuration read from .mozart/. Setup: <cmd>. Run:
      <cmd>."_ with a `Dismiss` button.
- [ ] **Manual checkpoint:** Pre-create `.mozart/run.json` in a test
      repo. Import it → workspace-create shows the banner; no init
      screen.

Files: 2.

#### Atom R0.3.G — Workspace creation gate

- [ ] In the workspace-create flow, before issuing the Tauri command,
      check `read_project_config(project_id)` exists. If not, redirect
      to `/projects/init?path=...`.
- [ ] **Manual checkpoint:** Try to navigate directly to
      `/projects/<id>/workspaces/new` for a project that hasn't been
      initialized → redirected to Repo init.

Files: 1 (route guard).

#### Atom R0.3.H — `project_local_config` DB migration

- [ ] New table:
      ```sql
      CREATE TABLE project_local_config (
        project_id   TEXT PRIMARY KEY,
        run_json     TEXT NOT NULL,     -- mirrors .mozart/run.json shape
        merge_mode   TEXT NOT NULL DEFAULT 'pr',  -- 'pr' | 'local'
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
      ```
- [ ] **Manual checkpoint:** Migration applies on app launch; existing
      installs survive because the table is brand new.

Files: 1 migration.

### Test coverage diagram for P0.3

```
[+] mozart_config/detect.rs
  ├── probe 1 (pnpm)                    [GAP] [★★★ needed]
  ├── probe 1 (yarn)                    [GAP] [★★ needed]
  ├── probe 1 (npm)                     [GAP] [★★ needed]
  ├── probe 2 (cargo)                   [GAP] [★★ needed]
  ├── probe 3 (poetry)                  [GAP] [★★ needed]
  ├── probe 3 (uv)                      [GAP] [★★ needed]
  ├── probe 3 (pip)                     [GAP] [★★ needed]
  ├── probe 4 (go)                      [GAP] [★★ needed]
  ├── probe 5 (make)                    [GAP] [★★ needed]
  └── probe miss                        [GAP] [★★ needed]

[+] mozart_config/validate.rs
  ├── happy path                        [GAP] [★★ needed]
  ├── reject "api_key" key              [GAP] [★★★ REGRESSION risk]
  ├── reject absolute path value        [GAP] [★★★ REGRESSION risk]
  └── reject unknown version            [GAP] [★★ needed]

[+] Tauri commands
  ├── init_project_repo writes files    [GAP] [★★ needed]
  ├── init_project_repo refuses overwrite [GAP] [★★★ INVARIANT]
  ├── init_project_local writes DB row  [GAP] [★★ needed]
  └── read_project_config: repo > local [GAP] [★★ needed]

USER FLOWS
  ├── [GAP] [→E2E] Import mozart-go → Repo init → Keep local → workspace
  ├── [GAP] [→E2E] Import w/ existing .mozart/ → summary banner → workspace
  ├── [GAP] [→E2E] Import → Cancel → project record cleaned up
  └── [GAP] [→E2E] Direct nav to workspace-new w/o init → redirect

COVERAGE: 0/22  |  REGRESSION TESTS: 3 (overwrite refusal + 2 schema)
```

---

# P1 — Bugs + frame

Demoable milestone: switch between three workspaces rapidly; each
remembers its own tab and file selection; file tree renders instantly
or shows a skeleton (never the previous workspace's stale tree); the
composer stays visible whether the middle shell shows chat or a file.

## P1.1 — Right-aside tab persistence (per-workspace)

### Bug surface

`feature-workspace-aside.ts:495-502` reads the bottom-tab from the URL
`?tab=...` — that's global per-route, not per-workspace. The Files
sub-tab (tree vs changes) is local component state, also not keyed by
workspace. `FileTabsService.activeByWorkspace()` correctly keys *file
paths* per workspace, but the panel-level UI choices leak.

### Fix

Move three pieces of state into a per-workspace dict in `UiStateStore`:

```ts
type WorkspaceAsideState = {
  bottomTab: 'files' | 'terminal' | 'run' | 'changes'
  filesSubTab: 'all' | 'changes'      // P1.1 also reorganizes this
                                       // so 'changes' becomes a peer of
                                       // 'files' bottom-tab if we choose,
                                       // OR stays a sub-tab — decided
                                       // during atom A
  activeFilePath: string | null        // already per-ws via FileTabsService
};

const asideStateByWorkspace = signal<Record<string, WorkspaceAsideState>>({});
```

Persisted in localStorage via the existing UiStateStore persistence
adapter (verify path).

### Atoms

#### Atom A1.1.A — Audit current tab plumbing + decide sub-tab vs top-tab

- [ ] Read the 717-line `feature-workspace-aside.ts` end-to-end.
      Document where each piece of tab state lives.
- [ ] Decide: keep "All files" / "Changes" as a sub-tab inside Files,
      OR promote "Changes" to a peer bottom-tab. **Recommendation:**
      keep as sub-tab (current shape) so the existing URL `?tab=...`
      semantic stays simple. The user's request "tab-aware open
      behavior" (P2.4) only needs the sub-tab signal.
- [ ] **Manual checkpoint:** A one-page doc-comment at top of
      `feature-workspace-aside.ts` listing every tab signal and its
      scope (per-workspace / global / URL).

Files: 0 (audit + comment).

#### Atom A1.1.B — Move tab state to UiStateStore keyed by workspaceId

- [ ] Add `asideStateByWorkspace` signal to `UiStateStore`.
- [ ] `feature-workspace-aside` reads via `uiState.asideStateFor(id)`
      (returns a default if unset).
- [ ] URL `?tab=` no longer drives state — it becomes a one-time
      hydration hint on initial nav, then UI state owns.
- [ ] Persist via existing UiStateStore persistence.
- [ ] **Manual checkpoint:** Switch from workspace A (Run tab) to B
      (Files tab) to A → A still on Run. Restart app → both
      remembered.

Files: ~3 (ui-state store + facade + aside component refactor).

#### Atom A1.1.C — Regression test

- [ ] Playwright/Cypress test exercising the exact bug: switch ws,
      assert the right tab; restart, assert persisted; switch back,
      assert.
- [ ] **Manual checkpoint:** Test fails on `main`, passes on this
      branch.

Files: 1 e2e spec.

---

## P1.2 — File-tree caching + skeleton on switch

### Bug surface

`feature-file-tree.ts` (158 lines) refetches on every workspace switch
and every Files-sub-tab toggle. The previous workspace's tree shows
during the fetch — an incoherent state that mixes two repos.

### Fix

```
On workspace switch:
1. Hide previous tree IMMEDIATELY (don't render stale data).
2. If cache hit for new workspace AND cache fresh
   (debounce window or FS-watcher revision matches):
   render cached tree.
3. Else: render `<file-tree-skeleton>` (5-7 grey rows).
4. Async: fetch fresh tree; on resolve, replace skeleton.
```

Cache lives in `repositories` domain as
`FileTreeCache(workspaceId, revision) → Tree`. Revision is the
FS-watcher event count for that worktree.

### Atoms

#### Atom A1.2.A — `FileTreeCache` signal store

- [ ] New facade method `repositories.cachedTreeFor(workspaceId)` →
      `Signal<Tree | null>`. Returns null on miss; computed against
      the watcher revision.
- [ ] Cache invalidation on FS-watcher event.
- [ ] **Manual checkpoint:** Switch ws back-and-forth fast — tree
      renders instantly the second visit.

Files: ~2.

#### Atom A1.2.B — `file-tree-skeleton` component

- [ ] Dumb component in `repositories/ui-file-tree-skeleton/`. Renders
      7 grey shimmer rows with random widths.
- [ ] `feature-file-tree` shows skeleton when cached signal is null
      AND fetch is in flight.
- [ ] **Manual checkpoint:** Throttle the FS adapter (test seam) to
      simulate slow load → skeleton appears, never the previous tree.

Files: ~2.

#### Atom A1.2.C — Regression test

- [ ] Tests both bugs: switch reveals stale (assert it does not), and
      switch back is instant (assert via timing or absence of
      skeleton).

Files: 1 e2e.

---

## P1.3 — Chat-panel + composer frame refactor

### Current shape

```
                  ┌───────────────────────────────┐
                  │ feature-workspace-detail      │
                  │  (host of middle shell)       │
                  │                                │
                  │  ┌─────────────────────────┐  │
                  │  │ feature-chat-panel      │  │  ← only shape
                  │  │   <MessageList>          │  │
                  │  │   <mz-composer>          │  │
                  │  └─────────────────────────┘  │
                  └───────────────────────────────┘
```

The composer lives inside `feature-chat-panel`. When the middle shell
should show a file (Diff or Edit), there is no shared frame for the
composer — it would be re-mounted or absent.

### Target shape

```
                  ┌───────────────────────────────┐
                  │ feature-workspace-detail      │
                  │                                │
                  │  ┌─────────────────────────┐  │
                  │  │ chat-tab-bar (existing)  │  │ ← tabs row
                  │  └─────────────────────────┘  │
                  │  ┌─────────────────────────┐  │
                  │  │ <router-outlet           │  │ ← content slot
                  │  │  name="middle">          │  │   (chat | file)
                  │  └─────────────────────────┘  │
                  │  ┌─────────────────────────┐  │
                  │  │ <mz-composer>            │  │ ← shared frame
                  │  └─────────────────────────┘  │
                  └───────────────────────────────┘
```

Composer is hoisted to `feature-workspace-detail`. Content is a named
router-outlet (or `<ng-content>` with a child component) that swaps
between `<feature-chat-content>` and `<feature-file-content>`.

### Rename rationale

The current component is named `feature-chat-panel` but, after the
refactor, "chat" describes only one of two content modes. Rename to
`feature-workspace-middle` (parent) and split into:

- `feature-workspace-middle` (parent — tab bar + content slot +
  composer)
- `feature-chat-content` (chat-only — `MessageList`)
- `feature-file-content` (file-only — diff or editor depending on
  Diff/Edit mode)

The `feature-file-content` is the home of CodeMirror integration in
P2.1.

### Atoms

#### Atom A1.3.A — Audit + plan child slot pattern

- [ ] Decide: router-outlet (named) vs `<ng-content>` with switch.
      Recommendation: `<ng-content select="[middle-content]">` —
      simpler than introducing a named router-outlet, no extra route
      definitions. The parent provides the frame; the child element
      passed in is the content.
- [ ] **Manual checkpoint:** Sketch the new template in a comment.

Files: 0.

#### Atom A1.3.B — Lift composer to `feature-workspace-middle`

- [ ] Rename `feature-chat-panel` directory → `feature-workspace-middle`.
- [ ] Move the `<mz-composer>` markup + its inputs/outputs up.
- [ ] Extract message-list block into `feature-chat-content`.
- [ ] Existing callers update imports.
- [ ] **Manual checkpoint:** Smoke-test all existing chat behavior:
      send message, mode change, model change, scroll-to-bottom, stop
      run. All should still work — no behavior change at this atom.

Files: ~5 (rename + extract + import updates).

#### Atom A1.3.C — Add `feature-file-content` shell

- [ ] Stub component that just renders `{{ activeFilePath() }}` for
      now. P2.1 fills it with CodeMirror.
- [ ] Wire the click-on-file behavior from `feature-workspace-aside` to
      route through `feature-workspace-middle` so the child slot swaps.
- [ ] **Manual checkpoint:** Click a file in All Files → middle shell
      shows the file path (stub). Composer remains pinned to bottom.
      Click a chat tab → middle reverts to chat content. Composer
      unchanged across the switch (no re-mount flash).

Files: ~3.

---

# P2 — Review UX

Demoable milestone: after an agent run, the right-aside auto-routes to
the Changes tab, the user clicks through 5 files (each auto-marked
viewed on open), uses the diff toolbar to flip one to unified view, one
to Edit mode and tweaks a line, marks all viewed for the trivial ones,
clicks `Merge now`, the workspace transitions to `done` and freezes.

## P2.1 — Code editor (CodeMirror 6) + line numbers

### Library choice

`@codemirror/state`, `@codemirror/view`, `@codemirror/commands`,
`@codemirror/language`, `@codemirror/merge`, plus language packs:
`@codemirror/lang-javascript`, `@codemirror/lang-html`,
`@codemirror/lang-css`, `@codemirror/lang-markdown`,
`@codemirror/lang-json`, `@codemirror/lang-rust`. ~250KB gzipped
total. All under MIT.

### Theme

Match Mozart minimal aesthetic — light bg, faint line-number gutter,
current line `bg-foreground/5`, selection `bg-blue-400/20`. Theme
exposed as a CodeMirror `EditorView.theme` extension lives in
`libs/mozart-ui/codemirror-theme/` (new lib).

### Atoms

#### Atom A2.1.A — Add CodeMirror deps + Mozart theme lib

- [ ] `pnpm add @codemirror/state @codemirror/view ...` at workspace
      root.
- [ ] New `libs/mozart-ui/codemirror-theme/` exporting
      `mozartLightTheme` and `mozartDarkTheme`.
- [ ] **Manual checkpoint:** Build the desktop app → bundle grows by
      the expected ~250KB. No runtime errors.

Files: ~5 (lib scaffolding + theme).

#### Atom A2.1.B — `MzCodeEditor` standalone component

- [ ] In `libs/mozart-ui/code-editor/`, a standalone component
      wrapping a `viewChild(ElementRef)` host and an `EditorView`.
- [ ] Inputs: `value`, `language` (string → extension), `readOnly`,
      `theme`.
- [ ] Outputs: `valueChange` (debounced).
- [ ] Uses `viewChild` signal per [[feedback_viewchild_signal]] —
      no `inject(ElementRef)` on `this`.
- [ ] **Manual checkpoint:** Render in sandbox app (`apps/sandbox`)
      with a TS file → syntax highlighted, line numbers visible, edit
      works.

Files: ~2 + sandbox demo page.

#### Atom A2.1.C — Replace the placeholder in `feature-file-content`

- [ ] Component receives `filePath`, `mode: 'diff' | 'edit'`,
      `diffMode: 'unified' | 'split'`.
- [ ] For Edit mode: render `<mz-code-editor>` reading file contents
      via a Tauri command.
- [ ] For Diff mode: render `<mz-code-diff>` using `@codemirror/merge`,
      reading both sides from `sandbox::capture_diff`.
- [ ] `.md` files always open as code (not rendered).
- [ ] **Manual checkpoint:** Click a `.md` file in All Files → opens
      in code editor, not the markdown view. Edit a line, save (P2.1.D
      below), reload, change persists.

Files: ~3.

#### Atom A2.1.D — File save command

- [ ] New Tauri command `file_save(workspace_id, relative_path,
      content)` that:
      1. Calls `validate_agent_path` (P0.1.D) — same guard rails.
      2. Returns `Frozen` if the workspace is done.
      3. Writes file atomically (tmp + rename).
- [ ] **Manual checkpoint:** Edit a file in Mozart, observe `git
      status` shows the change.

Files: ~2 + 3 tests.

---

## P2.2 — Diff toolbar + Viewed state + soft warning

### Toolbar layout (per user spec)

```
┌──────────────────────────────────────────────────────────────────┐
│  src/foo.ts             ✓ Viewed   [⌫]   [Unified|Split]  [Diff|Edit]│
└──────────────────────────────────────────────────────────────────┘
   ▲ filename badge       ▲ checkbox  ▲ discard  ▲ diff mode  ▲ file mode
   (path/filename)
```

### Viewed state (see [[mozart-viewed-principle]] for the design lock)

- DB table `workspace_file_views(workspace_id, path, viewed_at,
  viewed_at_hash)`.
- Auto-set on diff-open.
- Stale = content-hash mismatch.
- Visual states in Changes tab only: `not viewed` / `viewed` (muted) /
  `changed since viewed` (small ↻ marker) / `staged` (orthogonal chip).
- Discreet visuals — never in All Files or file tree.

### Soft warning at merge/PR/commit

Modal title: _"Some changes haven't been reviewed"_
Body: _"You haven't viewed N files."_
Actions: `[Review remaining]` (close modal, route to first unviewed)
/ `[Continue anyway]`. No hard gate.

### Atoms

#### Atom A2.2.A — DB migration `workspace_file_views`

- [ ] Migration script + Rust model + insert/get/list_for_workspace
      mutators.
- [ ] **Manual checkpoint:** Insert a row via test, query back.

Files: ~3 + 1 migration.

#### Atom A2.2.B — Tauri commands

- [ ] `mark_file_viewed(workspace_id, path)` — computes content hash
      on the Rust side (sha256 truncated to 16 chars), upserts.
- [ ] `list_file_views(workspace_id)` — returns map of path → state
      (`viewed` | `changed_since_viewed`) by comparing stored
      `viewed_at_hash` to current content hash for each changed file.
- [ ] `mark_all_viewed(workspace_id)` — bulk upsert.
- [ ] `clear_file_view(workspace_id, path)` — for discard flow.
- [ ] **Manual checkpoint:** Sanity each command via devtools.

Files: ~4 commands.

#### Atom A2.2.C — `FileViewsFacade` + signal store

- [ ] Per-workspace map signal driving the Changes tab.
- [ ] On agent-run-end event (P2.7), re-fetch.
- [ ] **Manual checkpoint:** Agent edits a viewed file → state flips
      to `changed since viewed` after run completion.

Files: ~3.

#### Atom A2.2.D — Diff toolbar component

- [ ] New `feature-file-toolbar` in the repositories domain.
- [ ] Renders the layout above. Inputs: filePath, viewedState,
      isFrozen, currentDiffMode, currentFileMode. Outputs: toggle
      events.
- [ ] **Manual checkpoint:** Render in sandbox app with each state.
      Verify discreet visual treatment matches the lock.

Files: ~3.

#### Atom A2.2.E — Soft-warning modal

- [ ] On `merge-now` or `create-pr` click, if any file has state ≠
      `viewed`, open modal. On `[Review remaining]`, route to first
      unviewed file. On `[Continue anyway]`, proceed with the action.
- [ ] **Manual checkpoint:** Trigger with 0 unviewed → no modal.
      Trigger with 2 unviewed → modal with correct count.

Files: ~2.

---

## P2.3 — Grouped diff hunks + expand bars

### Visual target

```
─────────────────────────────────────────────
   ↑     ____________________________________
─────────────────────────────────────────────
44   some code to see context
45   some code to see context
46   some changes                              ← hunk 1
47   some code to see context
48   some code to see context
─────────────────────────────────────────────
   ↑                                         ↓ ← expand bar between hunks
─────────────────────────────────────────────
122  some code to see context
123  some code to see context
124  some other changes                        ← hunk 2
125  some code to see context
126  some code to see context
─────────────────────────────────────────────
   ↓     ____________________________________
─────────────────────────────────────────────
```

Bar with `↑` expand-above and `↓` expand-below buttons between hunks
loads N lines of context (default 10). Above first hunk and below last
hunk, single-direction expand bars.

### Atoms

#### Atom A2.3.A — `util-diff-parser` extension

- [ ] Extend the existing parser to group hunks. Output:
      `Hunk { startLine, endLine, addedLines, removedLines }[]`.
- [ ] **Manual checkpoint:** Unit-test against the existing fixture
      diffs in `src-tauri/tests/fixtures/`.

Files: ~2.

#### Atom A2.3.B — `ui-hunk-expand-bar` component

- [ ] Standalone dumb component. Inputs:
      `direction: 'up' | 'down' | 'both'`, `linesAvailable: number`.
      Output: `expand` event with a `count` (default 10, double on
      shift-click).
- [ ] **Manual checkpoint:** Render in sandbox.

Files: ~2.

#### Atom A2.3.C — Wire into `ui-diff-view`

- [ ] Group hunks via the parser. Render expand bars between groups.
      `expand` event re-renders that hunk with more context lines.
- [ ] **Manual checkpoint:** Open a real long-file diff with multiple
      hunks → expand bars work, context loads in-place.

Files: ~2.

---

## P2.4 — Tab-aware file open behavior

### Spec

| Source tab | Click on file | Opens in |
|---|---|---|
| All files | a file | **Edit mode** in middle shell |
| Changes | a file | **Diff mode** in middle shell |
| Anywhere else | a file (e.g. context-menu "View") | **Diff mode** by default |

The middle shell's `fileMode` signal is set by the click handler in
`feature-workspace-aside` based on the current sub-tab.

### Atom A2.4.A

- [ ] Two click handlers (one per sub-tab) call
      `featureWorkspaceMiddle.openFile(path, { mode: 'edit' | 'diff' })`.
- [ ] **Manual checkpoint:** Open same file from All files (Edit) and
      from Changes (Diff). Both modes work; switching back and forth
      remembers mode per file (per workspace).

Files: ~2.

---

## P2.5 — Context menu on Changes

### Items (in order)

```
View
Staged                          ← toggle, shows ✓ when staged
─────
Copy path
─────
Discard changes
```

`Staged` runs `git add <path>` if unchecked or `git reset HEAD <path>`
if checked. `Discard changes` requires confirmation since destructive.

### Atom A2.5.A

- [ ] New `ui-changes-context-menu` component using `HlmMenu`.
- [ ] New Tauri commands `stage_file`, `unstage_file`, `is_staged`.
      The existing `discard_changes_to` is reused for the destructive
      action.
- [ ] **Manual checkpoint:** Each menu item exercised; staged badge in
      file row flips correctly.

Files: ~4.

---

## P2.6 — Merge-now + scenario routing

### Routing model (from architecture decision AD-02)

```
Primary button (top-left of right-aside header):

  Default label = workspace.last_merge_action
                   ?? project_local_config.merge_mode
                   ?? auto-detect from git remote

  Dropdown ALWAYS shows both options:
   ┌──────────────────────────────┐
   │ (icon PR) Create PR           │ ← disabled with tooltip if no GH
   │ (icon merge) Merge now        │
   └──────────────────────────────┘

  After click, persist `last_merge_action` to workspace row.
```

### Merge-now flow

```
1. Has uncommitted changes? → toast "Commit your changes before merging."
2. Origin exists AND remote-aware mode ON? → git fetch origin
3. Base ahead of origin? → toast "Pull <base name> first." with button
4. git merge --no-ff <workspace-branch> into <base name>
5. Conflict?
   ├── workspace.status = 'conflict' (existing status, see models.rs:45)
   ├── Mark conflicting files in Changes tab with red badge
   ├── Toast "Conflicts in N files. Resolve in your editor — Open in IDE"
   └── DO NOT open inline conflict editor (P4 follow-up)
6. Success?
   ├── workspace.status = 'done'
   ├── Freeze (P0.2 kicks in automatically)
   ├── Toast "Merged into <base name>"
   └── Worktree NOT deleted; user browses it as read-only
```

### Atoms

#### Atom A2.6.A — Workspace DB column `last_merge_action`

- [ ] Migration adds `last_merge_action TEXT` (nullable; default
      NULL).
- [ ] Mutators in `db/workspaces.rs`.
- [ ] **Manual checkpoint:** Verify column.

Files: ~2.

#### Atom A2.6.B — Tauri command `merge_workspace_locally`

- [ ] Implementation in new `merge.rs`. Uses `sandbox::run_git`
      (existing helper) for the merge.
- [ ] Returns `MergeOutcome { status: 'done' | 'conflict',
      conflicting_files: Vec<String> }`.
- [ ] Sets `workspace.status` on success, `'conflict'` on conflict.
- [ ] **Manual checkpoint:** Hand-craft a conflict via raw git, call
      the command, observe outcome.

Files: ~2 + 4 tests (happy / conflict / dirty-tree / base-ahead).

#### Atom A2.6.C — Right-aside header button refactor

- [ ] Replace the single `Create PR` button with a dropdown button.
      Primary label from the routing model above. Chevron opens
      dropdown.
- [ ] Persist `last_merge_action` on click.
- [ ] **Manual checkpoint:** Cycle through projects (one with GH
      remote, one without). Verify primary label and dropdown options.

Files: ~2 (shell-aside + new dropdown component).

#### Atom A2.6.D — Conflict surfacing in Changes tab

- [ ] When `workspace.status == 'conflict'`, file rows in Changes tab
      with conflict markers (parsed from `git diff --check`) get a red
      badge. No inline editor.
- [ ] **Manual checkpoint:** Force a conflict; tab shows red badges.

Files: ~2.

---

## P2.7 — Auto-route to Changes on agent-run end

### Atom A2.7.A

- [ ] On `AgentRunTerminated` event (already exists per
      `runner.rs:51`), if `status == 'done'` and the run produced a
      non-empty diff (check `workspace_changes` count), set
      `uiState.asideStateFor(ws_id).bottomTab = 'changes'`.
- [ ] No modal, no toast — silent route.
- [ ] **Manual checkpoint:** Agent run completes → right-aside auto-
      shows Changes tab.

Files: ~1 (signal listener in workspace store).

---

# P3 — Polish

## P3.1 — Composer effort/mode/model select height + chevron

### Bug

`libs/mozart-ui/composer/src/lib/mz-composer-{effort,mode,model}-select.ts`
render at 80px height. Should be standard button height (~28-32px,
matching the rest of the composer chip row). Icon currently shows two
chevrons; should be single chevron.

### Atom A3.1.A

- [ ] Inspect the three files, remove any explicit `h-*` or
      `min-h-*` not matching the chip-row baseline.
- [ ] Replace double-chevron icon usage with `lucideChevronDown`.
- [ ] **Manual checkpoint:** Open composer, visual diff against the
      mz-composer-plus-menu button next to it — heights match.

Files: 3.

---

## P3.2 — Dot loader size

### Atom A3.2.A

- [ ] Find the dot-loader component (likely `libs/mozart-ui/...` or
      `libs/ui/...`). Trim the trailing two dots; keep the icon.
- [ ] If it's in `libs/ui/`, do **not** modify per CLAUDE.md design-
      system rule — instead wrap it in `libs/mozart-ui/` with the
      desired sizing.
- [ ] **Manual checkpoint:** Storybook/sandbox visual check.

Files: 1-2 depending on lib placement.

---

## P3.3 — Global `select-none` with allow-list

### Rule

```
Default: select-none on the app shell <body>.

Exempted (user can select text):
- chat composer textarea
- chat message bodies (user + agent)
- code editor (CodeMirror)
- terminal (xterm.js)
- any <input>, <textarea> in dialogs/forms
- file path badges in toolbars (so you can copy them)
```

### Atom A3.3.A

- [ ] Add `select-none` to the app root in `app-shell.ts` host.
- [ ] Add `select-text` (Tailwind) on each allowed surface.
- [ ] **Manual checkpoint:** Try to select text in random UI chrome →
      cannot. In chat / editor / terminal → can.

Files: ~6 (one per allowed surface).

---

## P3.4 — Remove Archive button

### Atom A3.4.A

- [ ] Delete archive option from
      `workspace-context-menu.ts:95-97` and the icon import on line 11.
- [ ] Grep for any associated popover/dialog and remove if orphaned.
- [ ] **Manual checkpoint:** Right-click a workspace tile → no
      Archive entry.

Files: 1-2.

---

## P3.5 — Tauri app icons (request set)

### Action item to author

The current Tauri icons in `apps/desktop/src-tauri/icons/` are the
default scaffold logos (Square*Logo, icon.icns, icon.ico). To replace
them with the Mozart brand, the author should provide one **master
SVG or 1024×1024 PNG** sourced from `libs/mozart-assets/` (or wherever
the canonical Mozart logo lives). Mozart will then generate the full
set via `pnpm tauri icon path/to/master.png`, which emits all the
required platform sizes:

- `32x32.png`, `128x128.png`, `128x128@2x.png`
- `icon.icns` (macOS), `icon.ico` (Windows)
- Square{30,44,71,89,107,142,150,284,310}x..Logo.png (MS Store)
- `StoreLogo.png`

### Atom A3.5.A

- [ ] Request master from author.
- [ ] Run `pnpm tauri icon`.
- [ ] Commit the new icon files; `tauri.conf.json` icon list stays
      the same (filenames unchanged).
- [ ] **Manual checkpoint:** Build the app, observe the new icon in
      OS dock/taskbar and in the title bar (if `decorations: true`).

Files: ~14 icon binaries.

---

## P3.6 — Rename `ui-markdown-view` to chat-scoped name

### Rationale

After P2.1, the only consumer of `ui-markdown-view` is chat message
rendering. The name should reflect that scope so future readers know
it is **not** for arbitrary `.md` files.

### Atom A3.6.A

- [ ] Rename `apps/desktop/src/app/domains/repositories/ui-markdown-view/`
      → `apps/desktop/src/app/domains/chat/ui-message-markdown/`.
- [ ] Update imports.
- [ ] **Manual checkpoint:** App builds. Chat agent messages still
      render markdown.

Files: 1 directory move + import updates.

---

# Test coverage summary

Aggregate from per-section diagrams:

```
PATH COVERAGE TARGET
  P0.1 sandbox       14 paths,  2 regression tests (path traversal)
  P0.2 freeze        10 paths,  5 regression tests (one per IPC guard)
  P0.3 repo init     22 paths,  3 regression tests (overwrite refusal,
                                schema rejects)
  P1.1 tab persist    4 paths,  1 regression test (the bug itself)
  P1.2 tree cache     3 paths,  1 regression test (stale tree)
  P1.3 chat refactor  6 paths,  0 regression tests (refactor — same
                                behavior, covered by existing tests)
  P2.1 editor         5 paths,  0
  P2.2 viewed         8 paths,  0
  P2.3 hunks          4 paths,  0
  P2.4 tab-aware      2 paths,  0
  P2.5 context menu   4 paths,  0
  P2.6 merge-now      6 paths,  0
  P2.7 auto-route     2 paths,  0
  P3 polish           0 paths,  0 (visual; sandbox/storybook check)

TOTAL: 90 paths to cover, 12 mandatory regression tests
TARGET QUALITY: ★★★ for regression + security; ★★ minimum for the rest
```

Each atom's "Manual checkpoint" is the user-facing acceptance test.
The 12 regression tests are mandatory (per the skill's iron rule).

---

# Failure modes — production scenarios

For each new codepath, one realistic failure scenario and whether the
plan covers it:

| Codepath | Failure scenario | Test? | Handler? | User-visible? |
|---|---|---|---|---|
| P0.1 sandbox argv | `claude` binary upgrade changes flag names | ❌ | ✓ (error surfaces in stderr → timeline) | ✓ |
| P0.1 path guard | Agent crafts symlink loop | ✓ | ✓ (canonicalize errors) | ✓ |
| P0.1 sandbox L2 | Project has 100+ workspaces → argv > shell limit | ❌ | ❌ | **CRITICAL GAP** — see below |
| P0.2 freeze | Race: status flips to `done` mid-spawn_run | ✓ | ✓ (status read fresh at spawn) | ✓ |
| P0.2 reopen | Two windows open same workspace, one reopens, one stays frozen | ❌ | ✓ (Tauri events propagate) | ✓ |
| P0.3 detect | Repo path with non-UTF8 bytes (cursed filenames) | ❌ | ❌ | partial — `Path` handles, error message may lose info |
| P0.3 write | Disk full when writing `.mozart/run.json` | ✓ | ✓ (IO error → toast) | ✓ |
| P1.1 tab persist | localStorage cleared by user → defaults restore | ✓ | ✓ (defaults are sensible) | silent |
| P1.2 tree cache | FS watcher misses an event (Linux inotify limit) | ❌ | partial — full refetch on next visit | silent |
| P2.6 merge | Power loss mid-merge → repo in interrupted state | ❌ | ❌ | **CRITICAL GAP** — see below |

## Critical gaps

**CG-1 — Sandbox L2 argv too long for very large projects.**
A project with, say, 200 workspaces would produce 200 `--add-dir` args
in a single argv. On most Unixes the argv limit is ~128KB; this is
unlikely to hit but the wire shape should defend. **Fix in plan:**
P0.1.C: cap L2 to the 20 most-recently-active workspaces (DB query
order by `updated_at DESC LIMIT 20`); document the cap. Agent gets a
sensible subset of sibling context without unbounded growth.

**CG-2 — Mid-merge interruption.**
If the app crashes during `git merge`, the worktree could be in
mid-merge state on next launch. **Fix in plan:** P2.6.B atom adds an
init-time check that detects an in-progress merge (`.git/MERGE_HEAD`
exists in worktree) and sets `workspace.status = 'conflict'` so the
user can resolve via IDE — same flow as a normal conflict.

---

# Worktree parallelization strategy

Module-level dependency map (per [[feedback_atom_unit.md]] — atoms run
end-to-end and commit independently):

| Step | Modules touched | Depends on |
|---|---|---|
| P0.1 sandbox | src-tauri/claude_cli/, src-tauri/path_guard, workspaces domain | — |
| P0.2 freeze | src-tauri/error, src-tauri/db/workspaces, multiple cmd sites, workspaces domain | — |
| P0.3 repo init | src-tauri/mozart_config (new), src-tauri/db (new table), projects domain | — |
| P1.1 tab persist | ui-state domain, workspaces/feature-workspace-aside | — |
| P1.2 tree cache | repositories domain | P1.1 (small overlap on uiState) |
| P1.3 chat refactor | chat domain rename → workspaces/feature-workspace-middle | — |
| P2.1 editor | libs/mozart-ui/code-editor (new), repositories/feature-file-content | P1.3 |
| P2.2 viewed | src-tauri/db (new table), repositories/feature-file-toolbar | P2.1 |
| P2.3 hunks | repositories/util-diff-parser, repositories/ui-diff-view | P2.1 |
| P2.4 tab-aware | workspaces/feature-workspace-aside, workspaces/feature-workspace-middle | P1.3, P2.1 |
| P2.5 context menu | repositories | — |
| P2.6 merge-now | src-tauri/merge (new), workspaces domain | P0.2 (uses freeze) |
| P2.7 auto-route | workspaces domain | P1.1 |
| P3 polish | scattered | — |

### Parallel lanes

```
Lane A: P0.1 (sandbox)           ← independent
Lane B: P0.2 (freeze)            ← independent
Lane C: P0.3 (repo init)         ← independent
Lane D: P1.1 (tab persist)       ← independent
Lane E: P1.3 (chat refactor)     ← independent

Launch A, B, C, D, E in parallel worktrees. Merge in any order.

Then:
Lane F: P1.2 (tree cache)        ← after D (slight overlap)
Lane G: P2.1 (editor)            ← after E
Lane H: P2.5 (context menu)      ← independent (can also run in P0 wave)

Then:
Lane I: P2.2 (viewed)            ← after G
Lane J: P2.3 (hunks)             ← after G
Lane K: P2.4 (tab-aware)         ← after D, E, G
Lane L: P2.6 (merge-now)         ← after B
Lane M: P2.7 (auto-route)        ← after D

Then:
Lane N: P3.* polish              ← after corresponding feature lane,
                                   else independent
```

**Conflict flags:**
- P1.1 ↔ P1.2: both touch `ui-state.store.ts`. Schedule sequentially
  in the same lane OR ensure the same author runs both atoms back-to-
  back to avoid merge conflicts on the store file.
- P2.1 ↔ P1.3: both touch `feature-workspace-middle` and the
  file-content slot. P1.3 must land before P2.1 — sequential.
- P2.6 ↔ P0.2: P2.6 introduces the `'done'` transition via merge.
  P0.2 establishes the freeze guards. Order matters: P0.2 ships
  first, then P2.6 trusts the guards exist.

---

# NOT in scope

The following were considered and **explicitly deferred** to P4 or
later. Each has a one-line rationale.

- **OS-level sandbox fence** (sandbox-exec / bubblewrap / AppContainer)
  — adds ~2 weeks per OS; not on the dogfood critical path; the CLI-
  flag sandbox covers the common attack surface.
- **Inline 3-way conflict editor** — its own multi-week feature; the
  P2.6 conflict detection + Open-in-IDE escape is enough for solo
  dogfood.
- **Keyboard shortcuts for review nav** (←/→ to next-unviewed file) —
  explicit user direction: "pour le moment ne fait pas les raccourci
  clavier. Mais note qq part." (Noted here.)
- **"Translate this .md" context-menu action** — productizing the
  rendered-markdown view as an opt-in per-file mode; revisit after
  CodeMirror lands and the workflow matures.
- **"Copy chat to another workspace"** context-menu action —
  cross-workspace context import; the user's note: "à l'avenir il
  sera possible d'importer du contexte d'un autre workspace". Captured
  here for the TODOS layer.
- **"Move config to repository" / "Adopt repo config"** migrations —
  flipping a project's storage mode after the fact. Not blocking P0.
- **Per-workspace `terminal kill on freeze` setting** — current rule
  (PTY stays, input refused) is the safe default; no toggle in v0.
- **Plugin model for inference detectors** — hardcoded 5-stack probe
  is sufficient until a 6th stack is needed.

---

# What already exists

Reusable pieces the plan leans on (no rebuild):

- `sandbox::run_git`, `sandbox::canonical_worktrees_root` — the git
  helper layer in `src-tauri/src/sandbox/mod.rs` is well-shaped; the
  freeze and merge work reuse it.
- `claude_cli::runner` argv builder + `MOZART_CLAUDE_BIN` test seam —
  sandbox argv changes layer in cleanly on top of the existing test
  scaffolding.
- `FeatureCreatePrDialog`, `FeatureCommitDialog` — keep as-is; the
  merge dropdown adds `Merge now` as a sibling action.
- `WorkspacesFacade.activeId()`, `WorkspacesFacade.hasOtherUnreadInProject()`
  — facade already has the per-workspace selectors needed by the new
  freeze signal and tab-state work.
- `FileTabsService.activeByWorkspace()` — per-workspace file-tab
  mapping is the right shape; P1.1 brings the surrounding bottom-tab
  state to the same level.
- `UiStateStore` + persistence — the place to put the new
  `asideStateByWorkspace` signal.
- `HlmTabs`, `HlmDialog`, `HlmMenu`, `HlmSidebar`, `HlmTooltip` —
  every Spartan primitive needed for the new UI surfaces is already
  vendored in `libs/ui/`.
- `mz-composer` + the `mz-composer-*-select` primitives — the
  composer refactor is a parent extraction, not a composer change.
- `lucideChevronDown`, `lucideGitMerge`, `lucideCircleStop`, `lucidePlay`
  — already imported via `@ng-icons/lucide`. Add `lucideEye`,
  `lucideRotateCcw`, `lucideUnfoldVertical` for new toolbar/expand
  controls.
- `agent_events`, `agent_runs`, `workspace_changes` tables — solid
  schema for run lifecycle and diff snapshots; new tables sit
  alongside.

---

# TODOS proposed

Each below is a candidate item for `TODOS.md` (or your equivalent
backlog). Format follows the per-item template: What, Why, Pros, Cons,
Context, Depends-on.

### TODO-001 — OS-level sandbox fence (P4)

**What:** Add macOS Seatbelt profile and Linux bubblewrap profile that
constrain the `claude` subprocess to `~/.mozart/` at the OS level.
**Why:** Defense-in-depth. If the CLI permission gate has a bug, the
OS fence still blocks egress.
**Pros:** Real security posture for shipping beyond solo dogfood.
**Cons:** Per-OS work; sandbox-exec deprecated by Apple (still
functional); bubblewrap needs user-namespaces enabled in the kernel;
Windows AppContainer adds weeks.
**Context:** AD-01 explicitly defers this. Re-evaluate before any
external beta.
**Depends on:** P0.1 landing (the CLI flags must already be the source
of truth so the OS fence is additive).

### TODO-002 — Inline 3-way conflict editor

**What:** When `workspace.status == 'conflict'`, open conflicting
files in a 3-way merge view (ours / theirs / merged) directly inside
Mozart. Resolve in-app, mark file resolved, finalize merge.
**Why:** Solo dogfood currently routes to external IDE for conflict
resolution; if Mozart is the daily driver, in-app resolution becomes
necessary.
**Pros:** Closes the merge loop end-to-end inside Mozart.
**Cons:** ~2 weeks. UI is non-trivial. CodeMirror has `@codemirror/merge`
but 3-way conflict needs a custom layer.
**Context:** P2.6 conflict surfacing is detection-only. Open-in-IDE is
the escape hatch.
**Depends on:** P2.1 (CodeMirror) + P2.6 (conflict detection).

### TODO-003 — Keyboard nav for review

**What:** `→` next unviewed file, `←` previous file. Possibly `j` /
`k` Vim-style. Possibly `Mark viewed and next` on `Shift+→`.
**Why:** Power-user review flow once the visual review is solid.
**Pros:** Significantly faster review on large diffs.
**Cons:** Conflicts with browser/OS shortcuts; needs focus management.
**Context:** Explicitly punted from P2.
**Depends on:** P2.2 (Viewed state) — the data model needs to exist
to compute "next unviewed".

### TODO-004 — Per-file "Translate this markdown"

**What:** Context-menu action on `.md` files to open in the existing
`ui-message-markdown` view (post-rename) for rendered preview, with
back-toggle to code view.
**Why:** Sometimes you want the rendered version (READMEs).
**Pros:** Best-of-both UX. Reuses the existing component.
**Cons:** Requires routing logic for the per-file mode preference.
**Context:** P2.1 makes `.md` always-code; this TODO restores opt-in
rendered preview.
**Depends on:** P2.1.

### TODO-005 — "Copy chat to another workspace"

**What:** Right-click a chat tab → "Copy to another workspace" →
target picker → chat history (and optionally model/mode) is duplicated
into the target.
**Why:** Move context between workspaces without re-prompting.
**Pros:** Big productivity win for iterative work.
**Cons:** Chat-history schema needs to support copy (currently chats
are workspace-scoped via foreign key — needs duplicate-and-rebind).
**Context:** User's freeze-related note: "il sera quand même
recommander de créer un nouveau workspace (plus propre)... il sera
toutefois possible d'importer du contexte d'un autre workspace à
l'avenir."
**Depends on:** P0.2 (freeze) lands first.

### TODO-006 — "Move config to repository" / "Adopt repo config"

**What:** Two project-settings actions: promote local config to repo
(creates `.mozart/` files), and adopt repo config (replaces local with
the freshly-detected repo state).
**Why:** Lets a project flip storage modes after the fact.
**Pros:** Smoothes the local↔repo migration story.
**Cons:** Edge case soup (what if both exist? what if local has
diverged?).
**Context:** P0.3 ships the two storage modes; P0.3 ships no
migration. AD-06 footnote.
**Depends on:** P0.3.

### TODO-007 — Markdown rendering for the **chat** message bubbles only

**What:** After the rename to `ui-message-markdown`, make sure its
allowed sub-set of markdown is locked (no arbitrary HTML, no
JavaScript) and that link-clicks are intercepted via the existing
`OpenInMenu` pattern.
**Why:** XSS hardening; consistent open-in-browser behavior.
**Pros:** Closes a small attack surface.
**Cons:** Minor renderer audit work.
**Context:** Tightens the rename.
**Depends on:** P3.6.

---

# Completion summary

- Step 0 — Scope Challenge: **scope reduced** per phased plan (P0–P3 +
  P4 follow-ups). User accepted P0→P1→P2→P3 phasing.
- Architecture Review: **6 issues found / locked** (AD-01 through
  AD-06).
- Code Quality Review: **0 issues** (the existing code surface is
  well-shaped; the plan extends rather than refactors except for the
  P1.3 chat-panel refactor which is an intentional re-shaping).
- Test Review: **diagram produced**, **90 paths to cover**, **12
  regression tests mandatory** (path traversal, IPC freeze guards,
  schema rejects, overwrite refusal, tab-persistence bug,
  stale-tree bug).
- Performance Review: **2 issues found** — argv length cap (CG-1),
  in-progress merge detection (CG-2). Both fixed in-plan.
- NOT in scope: written.
- What already exists: written.
- TODOS: **7 items proposed**, expected to land in `TODOS.md` or
  equivalent backlog.
- Failure modes: **2 critical gaps flagged**, both addressed in plan
  atoms.
- Outside voice: **skipped** — user prefers Ultraplan for plan
  review per [[feedback_plan_ultraplan]]; this plan doc is the
  artifact to send.
- Parallelization: **7 lanes**, **5 parallel**, **2 sequential** (P1.2
  after P1.1; P2.1 after P1.3).
- Lake Score: **6 / 6** decisions chose the complete option (sandbox
  3-level, freeze 2-layer, viewed full design, editor full-CM6, repo
  init full screen + 5-stack probe, merge with conflict detection
  + status update).

---

# Unresolved decisions

None blocking. Two intentional under-specifications:

- **Mozart-asset master logo location.** P3.5 atom A3.5.A asks the
  author to point at the canonical master file. `libs/mozart-assets/`
  exists; need to confirm which file inside it is the canonical
  source. Resolved by author message during P3 implementation.
- **Bundle-size budget for P2.1 CodeMirror integration.** Plan
  assumes ~250KB gzipped is acceptable. If the perf-backlog
  (`docs/perf-backlog.md`) sets a stricter budget, revisit lang-
  pack selection.
