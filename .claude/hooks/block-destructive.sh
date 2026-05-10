#!/usr/bin/env bash
# PreToolUse hook for Bash. Reads JSON on stdin, blocks dangerous commands.
# Exit 0 = allow. Exit 2 + stderr = block with reason shown to Claude.

set -euo pipefail

input="$(cat)"
cmd="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' 2>/dev/null || true)"

[ -z "$cmd" ] && exit 0

block() {
  echo "BLOCKED by .claude/hooks/block-destructive.sh: $1" >&2
  exit 2
}

# git push --force / -f to a protected branch
if echo "$cmd" | grep -qE 'git[[:space:]]+push.*(--force([^-]|$)|--force-with-lease[^=]|[[:space:]]-f([[:space:]]|$))'; then
  if echo "$cmd" | grep -qE '(main|master|release/)'; then
    block "force-push targets main/master/release. Use a feature branch or ask the user."
  fi
fi

# rm -rf with absolute or parent-traversal paths
if echo "$cmd" | grep -qE 'rm[[:space:]]+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)[[:space:]]+(/|\.\./|~|\$HOME)'; then
  block "rm -rf against absolute path, \$HOME, or parent dir. Scope to a relative subpath under the repo."
fi

# Release builds on non-main branch (slow + wrong context for dev)
if echo "$cmd" | grep -qE '(cargo[[:space:]]+build.*--release|tauri[[:space:]]+build([^-]|$))'; then
  branch="$(git -C "${CLAUDE_PROJECT_DIR:-.}" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  if [ "$branch" != "main" ] && [ "$branch" != "master" ]; then
    block "Release build on branch '$branch'. Run release builds only on main, or have the user confirm."
  fi
fi

# git add . / -A / -u — enforce explicit staging (one-way rule from AGENTS.md)
if echo "$cmd" | grep -qE 'git[[:space:]]+add[[:space:]]+(-A|-u|--all|\.([[:space:]]|$))'; then
  block "Bulk 'git add' is forbidden. Stage the files listed in the current TASKS.md atom explicitly."
fi

exit 0
