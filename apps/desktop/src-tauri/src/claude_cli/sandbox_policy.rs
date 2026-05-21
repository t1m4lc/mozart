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
}
