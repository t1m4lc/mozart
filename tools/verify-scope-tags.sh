#!/usr/bin/env bash
# Ensures every Nx project.json has exactly one `scope:*` tag.
# Run locally or in CI before relying on @nx/enforce-module-boundaries —
# a missing tag silently exempts the project from the rule.

set -euo pipefail

missing=0
duped=0

while IFS= read -r f; do
  count=$(jq -r '[.tags[]? | select(startswith("scope:"))] | length' "$f")
  if [ "$count" = "0" ]; then
    echo "MISSING scope:* tag in $f"
    missing=$((missing + 1))
  elif [ "$count" != "1" ]; then
    echo "MULTIPLE scope:* tags in $f ($count)"
    duped=$((duped + 1))
  fi
done < <(find apps libs -name project.json -not -path '*/node_modules/*' | sort)

if [ "$missing" -gt 0 ] || [ "$duped" -gt 0 ]; then
  echo
  echo "FAIL: $missing missing, $duped duplicates"
  exit 1
fi

echo "OK: every project has exactly one scope:* tag"
