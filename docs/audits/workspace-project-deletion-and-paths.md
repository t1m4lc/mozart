# Audit: Workspace / Project Deletion & App Data Paths

**Date:** 2026-06-08  
**Branch:** `develop`  
**Scope:** Rust backend (`apps/desktop-tauri/src/`) + Angular frontend deletion flows + live filesystem state

---

## 1. What this audit covers

- Current workspace and project deletion flow (what actually runs)
- Every filesystem location Mozart owns in dev and prod
- What is Mozart-owned and safe to delete vs what must never be touched
- Confirmed bugs and inconsistencies found in live data
- Naming: `worktree` vs `workspace`

---

## 2. Filesystem locations — complete map

### 2.1 Path authority: `paths.rs`

All Mozart-owned paths are derived from a single file:  
`apps/desktop-tauri/src/paths.rs` — the only place that decides "where does Mozart's data live."

| Purpose           | Linux path                             | Override env var                          |
| ----------------- | -------------------------------------- | ----------------------------------------- |
| Data root         | `~/.local/share/build.mozart.desktop/` | `MOZART_DATA_DIR`                         |
| Config root       | `~/.config/build.mozart.desktop/`      | `MOZART_CONFIG_DIR`                       |
| Cache root        | `~/.cache/build.mozart.desktop/`       | `MOZART_CACHE_DIR`                        |
| SQLite DB         | `<data>/mozart.db`                     | `MOZART_DB_PATH`                          |
| Workspaces root   | `<data>/workspaces/`                   | `MOZART_WORKTREES_ROOT`                   |
| Projects root     | `<data>/projects/`                     | `MOZART_WORKTREES_ROOT` (derives sibling) |
| Get-started clone | `<projects>/get-started/`              | —                                         |
| Chime sound       | `<cache>/chime.wav`                    | —                                         |
| Global settings   | `<config>/settings.json`               | —                                         |

macOS: replace `~/.local/share` → `~/Library/Application Support`, etc.  
Windows: `%APPDATA%` / `%LOCALAPPDATA%`.

### 2.2 App identifier

`apps/desktop-tauri/tauri.conf.json` → `"identifier": "build.mozart.desktop"`.  
There is **no separate dev identifier** — dev and prod write to the same paths unless `MOZART_*` env vars are set. This is a known gap (see §6.3).

### 2.3 Auth tokens / secrets

Stored exclusively in the **OS keyring** (macOS Keychain, Linux Secret Service, Windows Credential Manager):

- `credentials/keyring_store.rs`: service `"mozart"`, accounts `"anthropic_api_key"` and `"github_token"`
- `auth/keyring_store.rs`: service `"mozart"`, account `"auth_session"` (Clerk JWT)

No plaintext file fallback. No tokens in the DB or config files.

### 2.4 Updater key

Public minisign key embedded in `tauri.conf.json` → `plugins.updater.pubkey`.  
Private key is a publish-time secret (not in repo). Endpoint: `https://dl.mozart.build/latest.json`.

### 2.5 Legacy orphan directory: `~/.mozart/worktrees/`

Before `paths.rs` was introduced, Mozart stored git worktrees at `$HOME/.mozart/worktrees/` (UUID-named).  
That root is **no longer written to** by any code. The live data shows 13 UUID dirs still present:

```
~/.mozart/worktrees/
├── 2f67bd8d-aaa1-4b51-8568-0d59b6d769f4/   ← legacy orphan
├── 69ec3cb4-f5fc-46e4-9ec2-c77bdd08b124/   ← legacy orphan
…  (10 UUID dirs total)
└── mozart/                                  ← legacy project dir
```

These are **not referenced by any DB row** (the DB now stores new-scheme paths like `~/.local/share/build.mozart.desktop/workspaces/mozart/<name>`). They are safe to delete but no migration code exists to do so.

---

## 3. What is Mozart-owned (safe to delete)

| Path                                       | Owner           | Safe to auto-delete?                                    |
| ------------------------------------------ | --------------- | ------------------------------------------------------- |
| `<data>/workspaces/<project>/<workspace>/` | Mozart          | Yes — created by Mozart, contains only the git worktree |
| `<data>/projects/<project>/`               | Mozart          | Yes — sandbox clone, not the user's original repo       |
| `<data>/projects/get-started/`             | Mozart          | Yes — Mozart-managed template clone                     |
| `<data>/mozart.db`                         | Mozart          | Only on full uninstall                                  |
| `<config>/settings.json`                   | Mozart          | Only on full uninstall                                  |
| `<cache>/chime.wav`                        | Mozart          | Yes — derived, safe to regenerate                       |
| `~/.mozart/worktrees/<uuid>/`              | Mozart (legacy) | Yes — orphans, no DB references                         |

## 4. What must never be deleted automatically

| Path                                                       | Why                                                               |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| The `repos.path` value (user's original repo)              | User's source of truth — Mozart only _reads_ it, never manages it |
| Any git branch currently checked out (`+` in `git branch`) | Would corrupt an active worktree                                  |
| Any path outside the Mozart-owned roots above              | Defense in depth                                                  |

---

## 5. Deletion flows — current implementation

### 5.1 Workspace deletion (`archive_workspace_impl`)

`apps/desktop-tauri/src/commands/mod.rs:679`

Sequence:

1. Cancel per-workspace PTY, run registry, file watcher.
2. Resolve `worktree_path` and `repo_path` from DB.
3. **`worktree::remove(repo_path, worktree_path)`** — runs `git worktree remove --force`, falls back to `remove_dir_all`. ✓
4. Flip `deletion_intent = 1` in the DB row (soft-delete). ✓
5. _(nothing else)_

**What is missing:** the git branch (`workspace.branch_name`) is **never deleted**. After step 3 the worktree directory is gone but the branch `mozart/<slug>` remains in the repo forever.

**Live evidence (2026-06-08):**  
6 archived workspaces (`aretha`, `bowie`, `daft-punk`, `dylan`, `eminem`, `hendrix`) have `deletion_intent=1` and their directories no longer exist on disk — confirming the disk cleanup works. But all 6 branches (`mozart/aretha`, `mozart/bowie`, ...) still exist in the user's git repo.

### 5.2 Project deletion (`remove_repo_impl`)

`apps/desktop-tauri/src/commands/mod.rs:457`

Sequence:

1. Snapshot `repo.path` and all `worktree_path` values from DB before any mutation.
2. `repos::delete()` — cascade-deletes all DB rows (workspaces, tasks, chats, etc.) in one transaction.
3. For each workspace: `worktree::remove(repo_path, wt_path)`. Best-effort (logged, not fatal). ✓
4. `std::fs::remove_dir(parent)` — removes the per-project subdir under `workspaces/` if empty. ✓
5. `std::fs::remove_dir_all(projects_root / project_seg)` — removes the sandbox clone dir. ✓

**What is missing:** git branches are not deleted for any of the workspaces being removed.

**What is safe:** `repo.path` (the user's original repository) is captured but never passed to any delete call. The original repo is untouched.

### 5.3 `cleanup_orphans` — defined but never called

`apps/desktop-tauri/src/worktree.rs:214`

This function walks `workspaces_root()`, compares against DB rows, and removes unreferenced directories. It handles both new `<project>/<workspace>` layout and legacy UUID layout within the current root.

**It is not wired into any production code path.** It appears only in tests. The comment at `commands/mod.rs:486` says "called elsewhere on next workspace list" — this is incorrect. If `worktree::remove()` fails during `archive_workspace_impl` (e.g., permission error, process lock), the orphan directory will persist indefinitely.

**Note:** even if it were wired up, it scans `workspaces_root()` = `~/.local/share/build.mozart.desktop/workspaces/`, so it would not catch the legacy `~/.mozart/worktrees/` UUID dirs (different root).

---

## 6. Inconsistencies found

### 6.1 Git branches never deleted (BUG — HIGH)

**File:** `apps/desktop-tauri/src/commands/mod.rs:679` and `:457`  
**What happens:** workspace archival removes the git worktree directory but leaves the branch.  
**Observed impact:** 6 stale `mozart/*` branches in the registered project repo.  
**Risk:** branch namespace pollution; new workspaces get suffixed `-2`, `-3` etc. due to collision avoidance (`worktree.rs:184`).

### 6.2 `cleanup_orphans` never called in production (BUG — MEDIUM)

**File:** `apps/desktop-tauri/src/worktree.rs:214`  
**What happens:** the crash-recovery cleanup function is dead code in production.  
**Risk:** a failed `worktree::remove()` during archival leaks the directory permanently.

### 6.3 No dev/prod path separation (GAP — MEDIUM)

**File:** `apps/desktop-tauri/tauri.conf.json:5`  
**What happens:** dev and prod both use `identifier: "build.mozart.desktop"`, so both write to `~/.local/share/build.mozart.desktop/`. A dev run can corrupt the prod DB and vice versa.  
**Current mitigation:** `MOZART_DB_PATH` and `MOZART_WORKTREES_ROOT` env vars are set in dev Tauri config. Needs verification.

### 6.4 Legacy `~/.mozart/worktrees/` orphans (CLEANUP — LOW)

**What happens:** 13 UUID-named directories from the pre-`paths.rs` era persist on disk. No code will clean them up.  
**Risk:** disk waste only. No data corruption. Safe to remove manually or via a one-time migration.

### 6.5 `MOZART_WORKTREES_ROOT` env var name (NAMING — LOW)

**File:** `apps/desktop-tauri/src/paths.rs:130`  
The seam env var is named `WORKTREES_ROOT` but `paths.rs` calls the function `workspaces_root()` and the new disk path says `workspaces/`. Internally inconsistent. Not user-facing.

---

## 7. Naming audit: `worktree` vs `workspace`

| Location                                      | Uses `worktree` | User-facing?                                           | Status                            |
| --------------------------------------------- | --------------- | ------------------------------------------------------ | --------------------------------- |
| `worktree.rs` — module name                   | Yes             | No — internal git operations                           | Acceptable                        |
| `workspaces.worktree_path` — DB column        | Yes             | No — wire DTO field                                    | Acceptable                        |
| `WorktreeHandle` — Rust struct                | Yes             | No — internal                                          | Acceptable                        |
| `_bindings.ts:2671` — `worktree_path: string` | Yes             | No — typed envelope, vocabulary contract blocks UI use | Acceptable                        |
| `MOZART_WORKTREES_ROOT` — env var             | Yes             | No — dev/test seam only                                | Minor inconsistency               |
| `~/.mozart/worktrees/` — on-disk path         | Yes             | Visible in file manager                                | Legacy; new path is `workspaces/` |
| UI labels, toasts, dialog text                | No              | —                                                      | ✓ Uses "workspace" throughout     |
| Tauri command names (`archive_workspace`)     | No              | —                                                      | ✓                                 |

**Conclusion:** `worktree` is confined to internal git implementation details. No user-facing label uses it. The only user-visible occurrence is the legacy `~/.mozart/worktrees/` directory which is being superseded by `~/.local/share/build.mozart.desktop/workspaces/`.

---

## 8. Implementation plan (before touching destructive logic)

The three issues worth fixing, ordered by impact:

### Fix 1 — Delete the git branch on workspace archive (HIGH)

**Where:** `archive_workspace_impl` in `commands/mod.rs:697`  
**After** `worktree::remove()` succeeds, add:

```
worktree::delete_branch(repo_path, branch_name)
```

New function in `worktree.rs`:

- Run `git branch -d <branch>` (safe delete — fails if unmerged).
- If that fails, try `git branch -D <branch>` only when `deletion_intent` is explicit (user chose to delete).
- Guard: skip if the branch is currently checked out (`branch_exists` + `worktree list` cross-check or just catch the specific git error).
- Return a descriptive `AppError` if deletion fails — don't silently swallow.
- Same deletion should be applied in `remove_repo_impl` for each workspace being removed.

**Tests needed:**

- `archive_workspace_deletes_branch` — happy path: branch gone after archive
- `archive_workspace_branch_delete_fails_safe` — if branch delete fails, the function still returns Ok (the worktree dir is already gone)
- `archive_workspace_skips_checked_out_branch` — branch currently checked out elsewhere → skip delete, log warning

### Fix 2 — Wire `cleanup_orphans` at startup (MEDIUM)

**Where:** `lib.rs` setup, after DB is initialized  
Call `worktree::cleanup_orphans(&db)` once at startup, log the count.  
No user-visible change — silent background sweep.

### Fix 3 — One-time migration: remove `~/.mozart/worktrees/` legacy dirs (LOW)

Add a DB migration flag (e.g., `migrations` table or a settings row `legacy_worktrees_migrated`).  
On first run after upgrade: scan `$HOME/.mozart/worktrees/`, remove any dir not referenced by a DB row, set the flag.  
**Guard:** only remove dirs whose path starts with `$HOME/.mozart/worktrees/` — never touch anything outside.

### Fix 4 — Rename `MOZART_WORKTREES_ROOT` → `MOZART_WORKSPACES_ROOT` (LOW, optional)

Keep the old name as a fallback alias for backwards compat with existing dev scripts.

---

## 9. What not to do

- Do not delete `repos.path` (the user's original repository) in any automated cleanup.
- Do not add `git branch -D` (force) as the default — only safe delete (`-d`) unless the user explicitly chose a destructive delete.
- Do not call `remove_dir_all` on any path outside `workspaces_root()` or `projects_root()`.
- Do not delete the DB or config on workspace/project delete — only on full uninstall.
