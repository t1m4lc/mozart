//! Branch-name construction for agent worktrees (Step 1.6).
//!
//! Two public surfaces:
//! - `make_initial_branch(short_id)` — deterministic `mozart/wip-{short_id}`
//!   placeholder branch, used at workspace creation time before a task
//!   title exists, and as the fallback whenever slug derivation or
//!   `git check-ref-format` validation fails.
//! - `make_task_branch(title, short_id)` — derives a slug from a
//!   human-readable task title, validates it via `git check-ref-format`,
//!   and either returns `mozart/{slug}` on acceptance or falls back to
//!   `make_initial_branch(short_id)` on rejection.
//!
//! Phase 1 prefix is `mozart/` (formerly `agent/`); once GitHub auth
//! ships the prefix becomes `{github-username}/` per Phase 1 spec.
//!
//! Locked decisions (plan §4):
//! - **D1.6-A** — slug rules: lowercase, replace non-`[a-z0-9]` with `-`,
//!   collapse runs, trim leading/trailing `-`, truncate to 40 chars then
//!   re-trim trailing `-`.
//! - **D1.6-B** — every candidate branch goes through
//!   `git check-ref-format refs/heads/<candidate>`; on rejection we
//!   `log::warn!` and fall back to the deterministic wip branch.
//!
//! No `tracing` crate use here by design — Mozart's app-side logging
//! uses the `log` facade so the tauri logger plugin captures it.

use crate::sandbox::run_git;
use std::path::Path;

/// Build the deterministic placeholder branch used at workspace creation
/// time. Format: `mozart/wip-{short_id}`.
pub fn make_initial_branch(short_id: &str) -> String {
    format!("mozart/wip-{short_id}")
}

/// Derive a branch name from a task `title`, validate it via
/// `git check-ref-format`, and either return `mozart/{slug}` on success
/// or fall back to `make_initial_branch(short_id)` on any rejection.
pub async fn make_task_branch(title: &str, short_id: &str) -> String {
    let slug = slugify(title);
    if slug.is_empty() {
        return make_initial_branch(short_id);
    }
    let candidate = format!("mozart/{slug}");
    let cwd = std::env::current_dir().unwrap_or_else(|_| Path::new(".").to_path_buf());
    match run_git(
        &cwd,
        &["check-ref-format", &format!("refs/heads/{candidate}")],
    )
    .await
    {
        Ok(_) => candidate,
        Err(_) => {
            log::warn!(
                "branch_name: '{candidate}' rejected by git check-ref-format; falling back to wip"
            );
            make_initial_branch(short_id)
        }
    }
}

/// D1.6-A slug rules. Pure / deterministic / no I/O.
///
/// Reused by `worktree.rs` to derive the on-disk path segments
/// `<project-slug>/<workspace-slug>` for each new worktree (atom 5 —
/// friendly nested paths). Same lowercase / alphanumeric / hyphen
/// rules work for both filesystem segments and git refs on every
/// platform Mozart targets.
pub(crate) fn slugify(title: &str) -> String {
    let mut out = String::with_capacity(title.len());
    let mut prev_dash = false;
    for c in title.chars() {
        let lc = c.to_ascii_lowercase();
        if lc.is_ascii_alphanumeric() {
            out.push(lc);
            prev_dash = false;
        } else if !prev_dash && !out.is_empty() {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.len() > 40 {
        out.truncate(40);
        while out.ends_with('-') {
            out.pop();
        }
    }
    out
}

/// Test seam: thin wrapper over `crate::sandbox::run_git` that returns a
/// bool so tests can assert acceptance/rejection without depending on
/// `AppError` shape.
#[cfg(test)]
pub(crate) async fn validate_branch_via_git(name: &str) -> bool {
    let cwd = std::env::current_dir().unwrap_or_else(|_| Path::new(".").to_path_buf());
    crate::sandbox::run_git(&cwd, &["check-ref-format", &format!("refs/heads/{name}")])
        .await
        .is_ok()
}

/// `true` iff the local branch `name` already exists in `repo_path`.
/// Powers atom 6 — workspace creation suffixes both the dir and the
/// branch with `-N` so a lingering branch from a previously-archived
/// workspace doesn't block `git worktree add -b`.
pub(crate) async fn branch_exists(repo_path: &Path, name: &str) -> bool {
    crate::sandbox::run_git(
        repo_path,
        &[
            "show-ref",
            "--verify",
            "--quiet",
            &format!("refs/heads/{name}"),
        ],
    )
    .await
    .is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn skip_if_no_git() -> bool {
        if !crate::sandbox::git_available() {
            eprintln!("skipping: git not available on PATH");
            true
        } else {
            false
        }
    }

    #[tokio::test]
    async fn happy_slug() {
        if skip_if_no_git() {
            return;
        }
        let b = make_task_branch("Add OAuth login", "abcd1234").await;
        assert_eq!(b, "mozart/add-oauth-login");
    }

    #[tokio::test]
    async fn all_special_char_title_falls_back_to_wip() {
        if skip_if_no_git() {
            return;
        }
        let b = make_task_branch("!!! @@@ ###", "abcd1234").await;
        assert_eq!(b, "mozart/wip-abcd1234");
    }

    #[tokio::test]
    async fn long_title_is_truncated_to_40() {
        if skip_if_no_git() {
            return;
        }
        let title = "a".repeat(200);
        let b = make_task_branch(&title, "abcd1234").await;
        let expected = format!("mozart/{}", "a".repeat(40));
        assert_eq!(b, expected);
    }

    #[tokio::test]
    async fn non_ascii_title_is_slugified() {
        if skip_if_no_git() {
            return;
        }
        let b = make_task_branch("Café noir", "abcd1234").await;
        assert_eq!(b, "mozart/caf-noir");
    }

    #[tokio::test]
    async fn leading_hyphen_is_trimmed() {
        if skip_if_no_git() {
            return;
        }
        let b = make_task_branch("---hello", "abcd1234").await;
        assert_eq!(b, "mozart/hello");
    }

    #[tokio::test]
    async fn git_check_ref_format_rejects_dotted_segment() {
        if skip_if_no_git() {
            return;
        }
        // `mozart/.invalid` has a segment starting with `.`, which
        // `git check-ref-format` rejects.
        let ok = validate_branch_via_git("mozart/.invalid").await;
        assert!(!ok);
    }

    #[test]
    fn make_initial_branch_is_deterministic() {
        assert_eq!(make_initial_branch("abcd1234"), "mozart/wip-abcd1234");
    }
}
