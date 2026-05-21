//! Sandbox policy for the Claude CLI agent runner.
//!
//! Plan refs: `docs/specs/plan-mozart-dogfood-readiness.md` § P0.1
//! (atoms S0.1.B → S0.1.F) and the local atom-fix plan at
//! `~/.claude/plans/plan-the-fix-of-elegant-manatee.md`.
//!
//! This file ships in atom S0.1.B with only the [`SandboxLevel`] type
//! and its DB-string round-trip helpers. The argv builder
//! (`build_sandbox_flags`, chat-mode → `--allowedTools` mapping, L2
//! sibling enumeration) lands in S0.1.C; the path-canonicalize guard
//! that reuses the level lands in S0.1.D.
//!
//! Three levels, in order of widening allowed roots:
//!
//! | Level         | `--add-dir` roots                                   | Use case                |
//! |---------------|-----------------------------------------------------|-------------------------|
//! | `L3Workspace` | Only this workspace's worktree                      | Tightest; one execution |
//! | `L2Project`   | All sibling worktrees in this project (default)     | Default — share repo    |
//! | `L1Mozart`    | `~/.mozart/worktrees` + `~/.mozart/projects`        | Mozart-wide             |
//!
//! Default is [`SandboxLevel::L2Project`] — see migration 010.

use std::fmt;
use std::path::PathBuf;
use std::str::FromStr;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Three-tier isolation knob for an agent run's filesystem reach and
/// (in S0.1.C) tool surface. Persisted as a TEXT column on
/// `workspaces`; the DB string is the PascalCase variant name, which
/// also matches what serde emits — so a round-trip through JSON, SQL,
/// or [`Display`]/[`FromStr`] is byte-stable.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub enum SandboxLevel {
    /// Mozart-wide baseline. Agent may reach anything under
    /// `~/.mozart/worktrees` or `~/.mozart/projects`. Always-on
    /// floor — no level loosens further.
    L1Mozart,
    /// Default. Agent may reach every sibling worktree of the active
    /// project. The project (= repo) is the natural sharing unit:
    /// useful when the agent needs cross-workspace context but never
    /// the rest of the user's machine.
    L2Project,
    /// Tightest. Agent is confined to this workspace's worktree.
    /// Picked when the run must not see sibling work — e.g. an
    /// isolated experiment branch.
    L3Workspace,
}

impl SandboxLevel {
    /// Default applied to every new workspace at insert time. Mirrors
    /// the `'L2Project'` literal in migration 010 — keep these in sync
    /// or `default_matches_migration_default` (in tests) fails first.
    pub const DEFAULT: Self = SandboxLevel::L2Project;
}

impl fmt::Display for SandboxLevel {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            SandboxLevel::L1Mozart => "L1Mozart",
            SandboxLevel::L2Project => "L2Project",
            SandboxLevel::L3Workspace => "L3Workspace",
        })
    }
}

impl FromStr for SandboxLevel {
    type Err = AppError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "L1Mozart" => Ok(SandboxLevel::L1Mozart),
            "L2Project" => Ok(SandboxLevel::L2Project),
            "L3Workspace" => Ok(SandboxLevel::L3Workspace),
            other => Err(AppError::Validation(format!(
                "unknown sandbox level: {other}"
            ))),
        }
    }
}

/// Chat-mode → tool allowlist mapping (S0.1.C + TODO-011). The
/// `--allowedTools` flag is the CLI-level enforcement of Mozart's
/// agent / plan / ask split; it fires regardless of any UI gate.
///
/// - `agent` — full toolset: `Read,Write,Edit,Bash,Glob,Grep,WebFetch`.
///   The user wants the agent to act on the workspace.
/// - `plan`  — write/exec-free: `Read,Glob,Grep,WebFetch`. Lets the
///   agent draft a plan with research but never mutate.
/// - `ask`   — provably read-only: `Read,Glob,Grep`. This closes
///   TODO-011 (the freeze bypass that lets ask through the freeze
///   guard is safe only because Write/Edit/Bash are excluded here).
///
/// Unknown modes fall through to the `ask` allowlist — refuse to
/// widen on input we don't recognise.
pub fn allowed_tools_for_mode(mode: &str) -> &'static str {
    match mode {
        "agent" => "Read,Write,Edit,Bash,Glob,Grep,WebFetch",
        "plan" => "Read,Glob,Grep,WebFetch",
        _ => "Read,Glob,Grep",
    }
}

/// Build the sandbox-specific argv tail for a single agent run. Pure
/// function — the caller resolves project siblings (S0.1.C `db::
/// workspaces::list_active_siblings_for_project`) and L1 roots
/// (`sandbox::canonical_{worktrees,projects}_root`) and passes them
/// in, so this stays synchronously testable with no IO.
///
/// Returned flags, in order:
/// 1. `--add-dir <path>` per allowed root for `level`
///    - `L1Mozart`   → each entry in `l1_roots`
///    - `L2Project`  → each entry in `project_siblings`
///    - `L3Workspace`→ exactly `workspace_worktree`
/// 2. `--permission-mode=acceptEdits` (always; tools fire without per-
///    call prompts since the CLI is acting on the user's behalf)
/// 3. `--allowedTools=<csv>` from [`allowed_tools_for_mode`]
///
/// The runner's `production_argv` prepends the locked output-format
/// flags (`-p prompt`, `--output-format=stream-json`, etc.) before
/// these — see `runner.rs` for the full argv composition.
pub fn build_sandbox_flags(
    workspace_worktree: &str,
    chat_mode: &str,
    level: SandboxLevel,
    project_siblings: &[String],
    l1_roots: &[PathBuf],
) -> Vec<String> {
    let mut argv = Vec::new();
    match level {
        SandboxLevel::L1Mozart => {
            for root in l1_roots {
                argv.push("--add-dir".to_string());
                argv.push(root.display().to_string());
            }
        }
        SandboxLevel::L2Project => {
            for sib in project_siblings {
                argv.push("--add-dir".to_string());
                argv.push(sib.clone());
            }
        }
        SandboxLevel::L3Workspace => {
            argv.push("--add-dir".to_string());
            argv.push(workspace_worktree.to_string());
        }
    }
    argv.push("--permission-mode=acceptEdits".to_string());
    argv.push(format!(
        "--allowedTools={}",
        allowed_tools_for_mode(chat_mode)
    ));
    argv
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_is_l2_project() {
        assert_eq!(SandboxLevel::DEFAULT, SandboxLevel::L2Project);
    }

    #[test]
    fn default_matches_migration_default() {
        // The migration column default is the literal `'L2Project'`.
        // If a future refactor renames the variant, this assertion
        // fires before existing rows fail to round-trip.
        assert_eq!(SandboxLevel::DEFAULT.to_string(), "L2Project");
    }

    #[test]
    fn display_round_trips_via_from_str() {
        for level in [
            SandboxLevel::L1Mozart,
            SandboxLevel::L2Project,
            SandboxLevel::L3Workspace,
        ] {
            let parsed: SandboxLevel = level.to_string().parse().unwrap();
            assert_eq!(parsed, level);
        }
    }

    #[test]
    fn from_str_rejects_unknown_string() {
        let err = SandboxLevel::from_str("L4-cosmic").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn from_str_rejects_lowercase() {
        // The DB column is stored as PascalCase. A lowercase row
        // indicates corruption, not a legitimate value.
        let err = SandboxLevel::from_str("l2project").unwrap_err();
        assert!(matches!(err, AppError::Validation(_)));
    }

    #[test]
    fn serde_serializes_as_pascal_case() {
        // The tauri-specta binding in S0.1.E marshals this type across
        // the IPC boundary; assert the wire shape directly here so a
        // serde rename rename can't silently break the frontend.
        let json = serde_json::to_string(&SandboxLevel::L1Mozart).unwrap();
        assert_eq!(json, "\"L1Mozart\"");
        let back: SandboxLevel = serde_json::from_str("\"L3Workspace\"").unwrap();
        assert_eq!(back, SandboxLevel::L3Workspace);
    }

    // --- allowed_tools_for_mode -------------------------------------

    #[test]
    fn allowed_tools_agent_includes_write_edit_bash() {
        let tools = allowed_tools_for_mode("agent");
        for required in ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "WebFetch"] {
            assert!(tools.contains(required), "agent must include {required}");
        }
    }

    #[test]
    fn allowed_tools_plan_excludes_write_and_bash() {
        let tools = allowed_tools_for_mode("plan");
        assert!(tools.contains("Read"));
        assert!(tools.contains("WebFetch"));
        for forbidden in ["Write", "Edit", "Bash"] {
            assert!(
                !tools.contains(forbidden),
                "plan must NOT include {forbidden}, got: {tools}"
            );
        }
    }

    #[test]
    fn ask_mode_is_provably_read_only_regression_for_todo_011() {
        // TODO-011 regression: ask mode used to skip the freeze guard
        // but Claude was still able to fire Edit/Write/Bash because no
        // CLI-level enforcement existed. Now the allowlist itself is
        // the enforcement — Write/Edit/Bash/WebFetch must all be out.
        let tools = allowed_tools_for_mode("ask");
        for forbidden in ["Write", "Edit", "Bash", "WebFetch"] {
            assert!(
                !tools.contains(forbidden),
                "ask must NOT include {forbidden} (TODO-011 regression), got: {tools}"
            );
        }
        // And the read surface stays open.
        for required in ["Read", "Glob", "Grep"] {
            assert!(tools.contains(required), "ask must include {required}");
        }
    }

    #[test]
    fn allowed_tools_unknown_mode_falls_through_to_strictest() {
        // Defense-in-depth: if a future code path passes an unknown
        // mode string (typo, deprecated value), we widen to the
        // smallest allowlist (== `ask`) rather than the largest.
        assert_eq!(
            allowed_tools_for_mode("evil"),
            allowed_tools_for_mode("ask"),
        );
    }

    // --- build_sandbox_flags ----------------------------------------

    fn pb(p: &str) -> PathBuf {
        PathBuf::from(p)
    }

    #[test]
    fn build_sandbox_flags_l1_emits_one_add_dir_per_l1_root() {
        let roots = vec![pb("/home/u/.mozart/worktrees"), pb("/home/u/.mozart/projects")];
        let argv = build_sandbox_flags(
            "/home/u/.mozart/worktrees/p/ws-a",
            "agent",
            SandboxLevel::L1Mozart,
            &[],
            &roots,
        );
        let add_dir_count = argv.iter().filter(|s| *s == "--add-dir").count();
        assert_eq!(add_dir_count, 2, "L1 must emit one --add-dir per l1 root, argv: {argv:?}");
        assert!(argv.windows(2).any(|w| w[0] == "--add-dir" && w[1] == "/home/u/.mozart/worktrees"));
        assert!(argv.windows(2).any(|w| w[0] == "--add-dir" && w[1] == "/home/u/.mozart/projects"));
    }

    #[test]
    fn build_sandbox_flags_l2_emits_one_add_dir_per_sibling() {
        let siblings = vec![
            "/home/u/.mozart/worktrees/p/ws-a".to_string(),
            "/home/u/.mozart/worktrees/p/ws-b".to_string(),
            "/home/u/.mozart/worktrees/p/ws-c".to_string(),
        ];
        let argv = build_sandbox_flags(
            "/home/u/.mozart/worktrees/p/ws-a",
            "agent",
            SandboxLevel::L2Project,
            &siblings,
            &[],
        );
        let add_dir_count = argv.iter().filter(|s| *s == "--add-dir").count();
        assert_eq!(add_dir_count, 3, "L2 must emit one --add-dir per sibling, argv: {argv:?}");
        for sib in &siblings {
            assert!(
                argv.windows(2).any(|w| w[0] == "--add-dir" && &w[1] == sib),
                "L2 must include sibling {sib}, argv: {argv:?}"
            );
        }
    }

    #[test]
    fn build_sandbox_flags_l3_emits_single_add_dir_for_workspace_only() {
        // Sibling list passed but ignored at L3 — that's the tightest
        // level by design.
        let siblings = vec!["/home/u/.mozart/worktrees/p/ws-b".to_string()];
        let argv = build_sandbox_flags(
            "/home/u/.mozart/worktrees/p/ws-a",
            "agent",
            SandboxLevel::L3Workspace,
            &siblings,
            &[pb("/home/u/.mozart/worktrees")],
        );
        let add_dir_count = argv.iter().filter(|s| *s == "--add-dir").count();
        assert_eq!(add_dir_count, 1, "L3 must emit exactly one --add-dir, argv: {argv:?}");
        assert!(argv.windows(2).any(|w| w[0] == "--add-dir" && w[1] == "/home/u/.mozart/worktrees/p/ws-a"));
        assert!(
            !argv.iter().any(|s| s == "/home/u/.mozart/worktrees/p/ws-b"),
            "L3 must NOT leak sibling paths"
        );
    }

    #[test]
    fn build_sandbox_flags_always_emits_permission_mode_accept_edits() {
        for level in [
            SandboxLevel::L1Mozart,
            SandboxLevel::L2Project,
            SandboxLevel::L3Workspace,
        ] {
            let argv = build_sandbox_flags(
                "/ws",
                "agent",
                level,
                &["/sib".into()],
                &[pb("/l1")],
            );
            assert!(
                argv.iter().any(|s| s == "--permission-mode=acceptEdits"),
                "permission-mode must be set for {level:?}, argv: {argv:?}"
            );
        }
    }

    #[test]
    fn build_sandbox_flags_appends_allowed_tools_from_mode() {
        for mode in ["agent", "plan", "ask"] {
            let argv = build_sandbox_flags(
                "/ws",
                mode,
                SandboxLevel::L2Project,
                &["/sib".into()],
                &[],
            );
            let expected = format!("--allowedTools={}", allowed_tools_for_mode(mode));
            assert!(
                argv.iter().any(|s| s == &expected),
                "expected {expected} in argv for mode {mode}, got: {argv:?}"
            );
        }
    }
}
