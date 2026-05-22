#!/usr/bin/env bash
# Ensures every Nx project carries an ownership tag. Reads the Nx
# project graph (via `nx graph`) instead of scanning project.json
# files directly, so the check is anchored to what Nx actually sees.
# Accepts either the `scope:*` axis (workspace-wide UI/shared libs)
# or the `app:*` axis (per-app domain libs). A project may carry
# both during migration. Run locally or in CI before relying on
# @nx/enforce-module-boundaries — a missing tag silently exempts the
# project from the rule.

set -euo pipefail

graph_file=$(mktemp -t nx-graph.XXXXXX.json)
trap 'rm -f "$graph_file"' EXIT

pnpm nx graph --file="$graph_file" >/dev/null

missing=0
bad=0

while IFS=$'\t' read -r name scope_count app_count; do
  if [ "$scope_count" = "0" ] && [ "$app_count" = "0" ]; then
    echo "MISSING scope:* or app:* tag in $name"
    missing=$((missing + 1))
  elif [ "$scope_count" -gt 1 ]; then
    echo "MULTIPLE scope:* tags in $name ($scope_count)"
    bad=$((bad + 1))
  elif [ "$app_count" -gt 1 ]; then
    echo "MULTIPLE app:* tags in $name ($app_count)"
    bad=$((bad + 1))
  fi
done < <(jq -r '
  .graph.nodes
  | to_entries[]
  | [
      .key,
      ([.value.data.tags[]? | select(startswith("scope:"))] | length),
      ([.value.data.tags[]? | select(startswith("app:"))] | length)
    ]
  | @tsv
' "$graph_file")

if [ "$missing" -gt 0 ] || [ "$bad" -gt 0 ]; then
  echo
  echo "FAIL: $missing missing, $bad duplicates"
  exit 1
fi

echo "OK: every project has an ownership tag (scope:* and/or app:*)"
