#!/usr/bin/env bash
# Wipe Mozart desktop auth state to test a clean sign-in flow.
#
# Usage:
#   tools/reset-auth.sh            # keyring + wrangler cache only
#   tools/reset-auth.sh --all      # also wipes DB + webview localStorage
#
# Linux-only as written (secret-tool from libsecret-tools). The
# equivalent macOS commands are noted inline.
#
# Why this exists: the OS keyring entries used by the `keyring` Rust
# crate carry their account name under attribute `username`, not
# `account` — so the obvious `secret-tool clear service mozart account
# auth_session` silently misses every entry and returns success. This
# script uses the correct attribute and verifies the result.

set -euo pipefail

reset_all=0
if [[ "${1:-}" == "--all" ]]; then
  reset_all=1
fi

step() { printf '\n\033[1;36m==>\033[0m %s\n' "$1"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$1"; }

step "Killing Mozart desktop processes…"
pkill -9 -f "tauri" 2>/dev/null || true
pkill -9 -f "mozart-desktop" 2>/dev/null || true
# Match the Tauri-launched binary by name without catching this script
pkill -9 -x "mozart" 2>/dev/null || true
sleep 1
remaining=$(ps -ef | grep -iE "tauri|mozart" \
  | grep -vE "grep|nx-mcp|wrangler|reset-auth|claude" \
  | wc -l)
if [[ "$remaining" -eq 0 ]]; then
  ok "no desktop processes alive"
else
  warn "$remaining processes still alive — inspect:"
  ps -ef | grep -iE "tauri|mozart" \
    | grep -vE "grep|nx-mcp|wrangler|reset-auth|claude" \
    | sed 's/^/      /'
fi

step "Clearing keyring slots (service=mozart, attr=username)…"
# macOS equivalent per slot:
#   security delete-generic-password -s mozart -a <slot>
for slot in auth_session github_token github_token_kind anthropic_api_key; do
  if secret-tool search service mozart username "$slot" >/dev/null 2>&1; then
    secret-tool clear service mozart username "$slot"
    ok "cleared $slot"
  else
    ok "$slot already empty"
  fi
done

step "Verifying keyring is clean…"
label_lines=$(secret-tool search service mozart 2>&1 | grep -c "^label" || true)
if [[ "$label_lines" -eq 0 ]]; then
  ok "no mozart secrets remain"
else
  warn "$label_lines mozart secret(s) still present:"
  secret-tool search service mozart 2>&1 | grep "^attribute.username" | sed 's/^/      /'
fi

step "Clearing wrangler dev cache…"
if [[ -d apps/web/.wrangler ]]; then
  find apps/web/.wrangler -mindepth 1 -delete 2>/dev/null || true
  rmdir apps/web/.wrangler 2>/dev/null || true
  ok "removed apps/web/.wrangler"
else
  ok "apps/web/.wrangler not present"
fi

if [[ "$reset_all" -eq 1 ]]; then
  step "Wiping SQLite DB (seed-demo --clean)…"
  pnpm reset-db
  ok "db reset"

  step "Clearing Tauri webview localStorage (Linux path)…"
  ls_dir="$HOME/.local/share/build.mozart.desktop/localstorage"
  # macOS equivalent: ~/Library/Application Support/build.mozart.desktop/localstorage
  if [[ -d "$ls_dir" ]]; then
    find "$ls_dir" -mindepth 1 -delete 2>/dev/null || true
    ok "cleared $ls_dir"
  else
    ok "$ls_dir not present"
  fi
fi

printf '\n\033[32mDone.\033[0m '
if [[ "$reset_all" -eq 1 ]]; then
  printf 'Full reset (keyring + db + webview).\n'
else
  printf 'Auth reset only — rerun with --all to also wipe db + webview.\n'
fi
printf 'Next: \033[1mpnpm dev:web\033[0m in one shell, \033[1mpnpm dev\033[0m in another.\n'
