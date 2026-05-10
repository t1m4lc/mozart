---
name: commit
description: Generates a Conventional Commits message from staged changes (via the haiku-powered commit-message-writer agent) and creates the commit. Optionally takes an atom ID as scope. Refuses to use 'git add .'. Use when you have files staged and want a clean message, or after an /implement atom completes.
---

# /commit

Stage-aware commit helper. Delegates message writing to the cheap+fast `commit-message-writer` (Haiku) and creates the commit locally. Never pushes.

## Inputs

- Optional: atom ID as `$ARGUMENTS` (e.g. `/commit M3.4`) → used as commit scope
- Optional: a hint after the ID (e.g. `/commit M3.4 doc-only`)

## Procedure

### 1. Verify there's something to commit

```sh
git status --short
git diff --staged --stat
```

- If nothing is staged but there are unstaged changes → STOP. Tell the user which files look relevant and ask them to stage explicitly (don't run `git add .` — the hook will block it anyway, and bulk staging violates the workflow).
- If nothing is staged AND nothing is changed → exit, "nothing to commit."

### 2. Sanity-check the staged set

- If TASKS.md has a current in-progress atom and the staged files are NOT all in that atom's `allowed_files` → warn the user and ask before continuing.
- If staged files mix unrelated areas (e.g. `apps/desktop/**` AND `apps/web/**`) → suggest splitting into two commits, ask before proceeding.

### 3. Generate the message

Spawn the `commit-message-writer` subagent with:
- Atom ID if provided (else nothing)
- The "hint" if provided
- Tell it to read the staged diff itself

Capture its output. If output starts with `ERROR:`, surface and exit.

### 4. Show + confirm

Print the proposed message to the user and ask via `AskUserQuestion`:

> Commit with this message?  
> Options: **Commit**, **Edit message** (you provide a new one), **Cancel**

### 5. Commit

```sh
git commit -m "$(cat <<'EOF'
<message from agent>
EOF
)"
```

- Never `--amend` (creates fresh commits is the rule from CLAUDE.md / global guidance)
- Never `--no-verify` (let hooks run; if they fail, fix and re-stage, then run /commit again)
- Never `--no-gpg-sign`

If a pre-commit hook modifies files (e.g. formatter), re-stage the changed files explicitly and re-run `git commit` with the same message — do NOT amend.

### 6. Report

Show:
- New commit SHA (`git log -1 --oneline`)
- Files committed
- If an atom ID was used: remind the user to mark it `[x]` in `TASKS.md` if `/implement` isn't running.

## Hard rules

- **Never `git add .` / `-A` / `-u`.** The hook blocks it; don't try.
- **Never push.** This skill is local-commit only. Use `/ship` (gstack) or a future `/prepare-pr` for push/PR.
- **Never edit the message yourself** if the user picked "Edit message" — let the user write it, then commit verbatim.
- **Never spawn more than one `commit-message-writer` per invocation.** If the user rejects the message, ask them to provide one rather than re-rolling the agent.
