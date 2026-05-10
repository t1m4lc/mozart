# Pane's .claude Setup — Patterns and Architecture

**Source:** https://github.com/dcouple/Pane/tree/main/.claude  
**Purpose:** Reference for setting up MOZART's own .claude infrastructure

---

## Directory Structure

```
.claude/
├── agents/                     # Subagent definitions (spawned by skills)
│   ├── codebase-explorer.md
│   ├── implementer.md
│   ├── implementation-reviewer.md
│   ├── plan-reviewer.md
│   ├── research-dossier-writer.md
│   └── researcher.md
├── commands/                   # Slash commands
│   └── parsa/
│       ├── cl/                 # Core pipeline commands
│       ├── linter/             # Codebase-wide linting fixes
│       ├── refactor/           # 3 granularity levels
│       ├── review/             # 11-agent parallel review orchestrator
│       ├── templates/          # Plan templates
│       ├── create-prp.md
│       ├── fix-bug.md
│       ├── implement-plan.md
│       ├── medium-plan.md
│       ├── review-plan.md
│       ├── review-prp.md
│       └── simple-plan.md
├── skills/                     # Skill definitions with SKILL.md files
│   ├── commit/
│   ├── create-plan/
│   ├── discussion/
│   ├── implement/
│   ├── investigate/
│   ├── prepare-pr/
│   ├── research-web/
│   ├── review/
│   ├── share-fix/
│   └── simple-plan/
├── hooks/
│   └── block-terraform-destructive.sh
├── settings.json
├── statusline-command.sh
└── statusline-command.ps1
```

---

## settings.json

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "includeCoAuthoredBy": false,
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-terraform-destructive.sh"
          }
        ]
      }
    ]
  },
  "statusLine": {
    "type": "command",
    "command": "bash .claude/statusline-command.sh"
  }
}
```

**Notable patterns:**
- `includeCoAuthoredBy: false` — clean git history
- `PreToolUse` hook on Bash to block destructive ops
- Custom status line command for agent visibility

---

## Agent Definitions — Key Patterns

### codebase-explorer
```
model: opus
tools: Read, Grep, Glob, LS
```
- **Only documents existing code** — never suggests improvements
- Returns `file:line` references for everything
- Groups findings by purpose: implementation, tests, config, types, docs

### implementer
```
model: opus
color: cyan
```
- Reads the entire plan before starting
- Checks off completed tasks with `[x]` markers
- Default: finish the whole assigned chunk, don't further split
- Implementation order: API = validator → service → controller → route
- Database changes: schema first, migration SQL handled by parent skill after review
- Frontend: types → API client → hooks → components
- Quality loop after each chunk: typecheck → lint → format → fix

### plan-reviewer
```
model: opus
color: yellow
tools: Glob, Grep, Read
```
- Never asks user direct questions mid-review
- Reports decisions clearly labeled for the parent workflow to aggregate
- Reviews: repo accuracy, fact purity, intent fidelity, reconciliation quality

### researcher
```
model: opus
color: green
```
- Tries `https://<site>/llms.txt` for known tools
- Multiple search angles before concluding
- Includes current year in searches for recency
- Prioritizes official documentation

---

## Skills (Pane's Core Pipeline)

### /discussion
- Conversation only — never modifies source code
- Spawns codebase-explorer + researcher as needed
- Writes summary to `.context/context.md` when complete
- Context file is shared across worktrees

### /plan (create-plan)
- Codebase analysis + external research + plan generation
- Structured template with pseudocode, file refs, error handling, task list
- Saves to `./tmp/ready-plans/`
- Auto-spawns plan-reviewer in iterative loop until satisfied

### /implement
- Reads plan from `./tmp/ready-plans/`
- Parallelizes chunks respecting dependency order
- Each chunk: implement → typecheck → lint → format → fix
- Auto-spawns implementation-reviewer on completion
- Moves plan: `ready-plans/` → `done-plans/`

### /commit
- Groups commits by done-plans
- Never uses `git add .`
- Matches changed files to the plan they belong to

### /prepare-pr
- Rebase → build → Codex adversarial review → PR create/update
- `--force-with-lease` always

### /review (master orchestrator)
- Spawns 11 principle-specific review agents in parallel
- Most critical reviewer: "single way to do things"

---

## Plan Template Structure (plan_base.md)

Based on blog references, a good plan includes:
- **Verified Repo Truths** — present-tense, evidence-backed facts only (no proposal language)
- **Intent / Why** — locked decisions, non-goals, success criteria  
- **Pseudocode** — per task
- **File references** — specific existing files with `file:line` anchors
- **Error handling strategy**
- **Task list in execution order** — parallelizable chunks marked
- **Validation gates** — typecheck + lint commands to run

Plan lifecycle dirs:
```
./tmp/
├── ready-plans/    # Plans ready for /implement
└── done-plans/     # Completed plans (source for /commit grouping)
```

---

## Key Hooks Pattern

```bash
# .claude/hooks/block-terraform-destructive.sh
# Runs before every Bash tool use
# Blocks commands like: terraform destroy, terraform apply -destroy
# Pattern: check $CLAUDE_TOOL_INPUT for dangerous patterns, exit 1 to block
```

Apply same pattern to MOZART for: `rm -rf`, `git push --force`, `tauri build` on wrong branch, etc.
