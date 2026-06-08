# RCA — Windows terminal-spawn loop & flashing console windows

**Date:** 2026-06-08
**Scope:** `apps/desktop-tauri` (Rust/Tauri backend) + `libs/desktop-workspaces-data-access` (install lifecycle)
**Severity:** Critical — makes the app unusable on Windows (workspace creation spawns terminal windows in a loop).

> Verification note: this analysis was produced on a **Linux** host. Every
> *behavioral* claim about Windows below is derived from the source + the
> documented semantics of `CreateProcessW` / Rust's `std::process` /
> `tokio::process`, **not** from a live Windows run. The items under
> "Windows-only manual verification" must be confirmed on a real Windows
> box once the fix lands.

---

## 1. Symptoms

- Onboarding completes, but creating a workspace spawns terminal/console
  windows repeatedly — closing one spawns more ("infinite loop" feel).
- Brief flashing windows (open → immediately close) during onboarding,
  most visibly around Git probes / Git auth.
- Net effect: cannot create or use a workspace.

These are **two distinct defects** that compound on Windows.

---

## 2. Root cause

### Defect A — no spawn sets `CREATE_NO_WINDOW` (the flashing)

The desktop binary is built as a GUI-subsystem app:

- `apps/desktop-tauri/src/main.rs:2` —
  `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`

On Windows, when a process **without** a console spawns a
**console-subsystem** child (`git.exe`, `npm`, `node`, `powershell.exe`,
the `claude` CLI, …) via `CreateProcessW`, the OS allocates a **brand-new
console window** for that child unless the creation flag
`CREATE_NO_WINDOW (0x08000000)` is passed.

Every process launch in the backend builds a bare `std::process::Command`
/ `tokio::process::Command` and **never** sets that flag. So every
short-lived `git`/`powershell` invocation flashes a console; every
long-lived child (the `claude` agent) opens a console that lingers.

Representative pre-fix spawn sites (all missing the flag):

| Site | What it runs |
|------|--------------|
| `sandbox/mod.rs` `run_git_capture` | every checkpoint/diff/reset/clone/branch git (the central git path) |
| `git_query.rs` `check_git_available`, `check_lfs_available` | onboarding git probes |
| `commands/mod.rs` `git_version`, `git_identity` | onboarding Git-step probes (flashing during onboarding) |
| `get_started/mod.rs` `ensure_template` | `git clone` of the starter template |
| `commands/mod.rs` `install_workspace_packages` | `npm/pnpm/yarn install` |
| `claude_cli/install.rs` `check_installed` | `claude --version` probe |
| `claude_cli/runner.rs` `spawn_run` | the long-lived `claude` agent |
| `sound.rs` `play_file` | `powershell … SoundPlayer` end-of-turn chime |
| `ide_launch.rs` `spawn_detached` | IDE launchers, file-manager |
| `commands/mod.rs` `open_path_in_file_manager` | `explorer` |

Because macOS/Linux never allocate a window for a child process, **none
of this is visible off-Windows** — which is why it shipped.

### Defect B — setup/install command never converges, and the lifecycle re-runs it (the loop)

Three Windows-only failures make package-manager / setup commands fail
*every* time, and the install lifecycle reacts by re-running them — each
attempt flashing windows (Defect A) per child process in the tree.

1. **`.cmd`/`.bat` shims aren't resolved.**
   `install_workspace_packages` (`commands/mod.rs:201`) ran
   `Command::new("npm"|"pnpm"|"yarn")`. On Windows these tools are
   `npm.cmd` / `pnpm.cmd` shims. Rust's `Command` only appends `.exe`
   when searching `PATH` (it does **not** honor `PATHEXT`), so the spawn
   fails with `ENOENT` / "program not found".

2. **POSIX `-c` flag passed to `cmd.exe`.**
   The Run/Setup PTY path (`terminal.rs:128-134`) always appended `-c
   "<command>"`. `default_shell()` (`terminal.rs:195`) falls back to
   `cmd.exe` on Windows, but `cmd.exe` uses **`/C`**, not `-c` — so the
   setup command exits immediately with a usage error. PowerShell would
   need **`-Command`**. The flag was never shell-aware.

3. **The lifecycle treats failure as "retry".**
   `workspace.facade.ts` `runInstall` (lines 336-391) wraps both the
   custom-setup path and the `installPackages` path in
   `retry({ count: 2 })`, and additionally treats `ran:false` (no
   `package.json` seen yet) as a throw to retry. With Defect B-1/B-2 the
   command can never succeed, so it burns its retries — and each real
   `npm install` fans out into a child-process tree, **every child
   flashing a console** (Defect A). The combination reads as an endless
   stream of terminal windows.

There was also **no idempotency guard**: nothing stopped a second
concurrent/duplicate `runInstall` for the same workspace from launching
another full install tree.

---

## 3. Exact sequence that produces the loop

1. User finishes onboarding; Git-step probes (`git_version`,
   `git_identity`, `check_git_available`) each flash a console window
   (Defect A) — the "flashing during onboarding" clue.
2. User creates a workspace. The worktree is created (central git path,
   Defect A → more flashes).
3. The frontend fires `runInstall(workspaceId)`.
   - **Custom-setup path:** `startSetup` spawns a PTY running the setup
     command via `cmd.exe -c "<cmd>"` → `cmd.exe` rejects `-c`, exits
     non-zero immediately → `installFor` sees `exited`/non-zero →
     `retry({count:2})` re-spawns. (Defect B-2)
   - **Auto-install path:** `installPackages` spawns
     `Command::new("npm")` → not found (`.cmd` not resolved) → throws →
     `retry({count:2})`. When it *does* resolve, every child in the
     install tree opens a console (Defect A). (Defect B-1 + A)
4. Each retry, and each child process, opens another console window.
   Closing one does nothing to the others still being spawned → the
   "windows keep appearing" experience.

---

## 4. Why Windows-only

| Cause | macOS / Linux | Windows |
|-------|---------------|---------|
| Console window per child | Never allocated | Allocated unless `CREATE_NO_WINDOW` |
| `npm`/`pnpm`/`yarn` resolution | `execvp` finds the binary | `.cmd` shim not found (no `PATHEXT`) |
| One-shot run flag | `/bin/sh -c` is correct | `cmd.exe` needs `/C`, PS needs `-Command` |

All three triggers are Windows-specific; none fire on macOS/Linux.

---

## 5. Fix (phased)

- **Phase 1 — centralize.** New `src/platform.rs` "platform/process
  layer" with explicit, testable, semantic helpers:
  - `NoWindow::no_window()` — extension trait on `std`/`tokio` `Command`
    that sets `CREATE_NO_WINDOW` on Windows, no-op elsewhere.
  - `resolve_executable` / `command_available` — `PATH` walk that is
    Windows-extension-aware (`.exe`/`.cmd`/`.bat`).
  - `resolve_package_manager` — lockfile detection **+** resolves the
    real shim path so `npm.cmd` is found.
  - `shell_command` — shell-aware one-shot invocation (`/C` for cmd.exe,
    `-Command` for PowerShell, `-c` for POSIX shells).
  - `spawn_background` — fire-and-forget detached spawn that always
    applies `no_window` + redacted diagnostics.
  - `open_in_terminal` — the **intentionally visible** terminal opener
    (kept window-ful), co-located so the visible/hidden split is
    auditable in one file.
  - Redacted spawn logging (`log_spawn`) — logs program, args, cwd; URL
    credentials masked; no env vars / tokens logged.
- **Phase 2 — apply.** Route every *background* spawn site through the
  layer (`no_window` + helpers). The only deliberately window-ful path is
  `open_in_terminal` ("Open in Terminal").
- **Phase 3 — converge & dedupe.** Resolve the real package-manager
  program; make `install_workspace_packages` idempotent per workspace so
  a duplicate/concurrent call no-ops instead of spawning a second tree.

---

## 6. Windows-only manual verification (cannot run on this Linux host)

1. Release build (`windows_subsystem = "windows"`); confirm **no** console
   flashes during onboarding Git probes.
2. Create a workspace in a Node project → exactly **one** silent install,
   **zero** visible console windows, install succeeds.
3. `npm` / `pnpm` / `yarn` shims resolve (`*.cmd`).
4. A custom setup command runs via the correct shell flag (`cmd.exe /C`,
   PowerShell `-Command`, Git-Bash `-c`).
5. "Open in Terminal" still opens a **visible** terminal.
6. End-of-turn chime plays with **no** PowerShell window flash.
7. Duplicate `runInstall` for the same workspace does not start a second
   install.
