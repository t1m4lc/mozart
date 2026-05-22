#!/usr/bin/env bash
# Ensures every Nx project.json carries an ownership tag. Accepts
# either the legacy `scope:*` axis (workspace-wide UI/shared libs)
# or the new `app:*` axis (per-app domain libs). A project may carry
# both during the migration. Run locally or in CI before relying on
# @nx/enforce-module-boundaries — a missing tag silently exempts the
# project from the rule.

set -euo pipefail

missing=0
bad=0

while IFS= read -r f; do
  scope_count=$(jq -r '[.tags[]? | select(startswith("scope:"))] | length' "$f")
  app_count=$(jq -r '[.tags[]? | select(startswith("app:"))] | length' "$f")
  if [ "$scope_count" = "0" ] && [ "$app_count" = "0" ]; then
    echo "MISSING scope:* or app:* tag in $f"
    missing=$((missing + 1))
  elif [ "$scope_count" -gt 1 ]; then
    echo "MULTIPLE scope:* tags in $f ($scope_count)"
    bad=$((bad + 1))
  elif [ "$app_count" -gt 1 ]; then
    echo "MULTIPLE app:* tags in $f ($app_count)"
    bad=$((bad + 1))
  fi
done < <(find apps libs -name project.json -not -path '*/node_modules/*' | sort)

if [ "$missing" -gt 0 ] || [ "$bad" -gt 0 ]; then
  echo
  echo "FAIL: $missing missing, $bad duplicates"
  exit 1
fi

echo "OK: every project has an ownership tag (scope:* and/or app:*)"
