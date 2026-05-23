//! Capture a `DiffSummary` between a recorded base sha and the current
//! `HEAD` of a workspace's worktree. Pairs with `git_checkpoint` (S1.5.1):
//! the runner stores a checkpoint sha pre-spawn and reaches back here
//! post-exit to compute the changes feed (S1.5.4 wires the call-site).
//!
//! Locked decisions (plan §4):
//! - **D1.5-D** — `DiffSummary` lives here, re-exported from `sandbox/mod.rs`.
//!   No `serde`/`specta` derives in v0.1.0-beta.1 (no IPC consumer yet).
//! - **D1.5-F** — numstat decision rule: `(_, 0)` with added > 0 → added;
//!   `(0, _)` with deleted > 0 → deleted; both > 0 → modified; binary
//!   `-\t-\t…` → modified; pure-rename `0\t0\t…` → modified; rows with
//!   fewer than 3 tab-separated fields are skipped.
//! - **D1.5-G** — empty diff returns zeros + empty `diff_text`, never
//!   errors. `git diff` exits 0 with empty stdout when base == HEAD.
//! - **D1.5-K** — both git invocations route through `super::run_git` so
//!   spawn failures map to `AppError::Io` and non-zero exits map to
//!   `AppError::GitCmd` with stderr passthrough.

use std::collections::HashMap;
use std::path::Path;

use super::run_git;
use crate::error::AppError;

/// Summary of the diff between a base sha and `HEAD`.
///
/// `diff_text` is the full unified diff (output of `git diff <base> HEAD`).
/// The three counts are derived from `git diff <base> HEAD --numstat` per
/// D1.5-F. Renames default to `files_modified` (single numstat row); if
/// `diff.renames=false` is set globally, renames degrade to one added +
/// one deleted, accepted for v0.1.0-beta.1 (plan §3).
#[derive(Debug, Clone)]
pub struct DiffSummary {
    pub diff_text: String,
    pub files_added: i64,
    pub files_modified: i64,
    pub files_deleted: i64,
}

/// Compute a `DiffSummary` between `base_sha` and `HEAD` inside
/// `workspace_path`. Empty diff → all zeros + empty string (D1.5-G).
/// Spawn failure → `AppError::Io`; non-zero exit (e.g. unknown revision)
/// → `AppError::GitCmd` with stderr passthrough.
pub async fn capture_diff(
    workspace_path: &Path,
    base_sha: &str,
) -> Result<DiffSummary, AppError> {
    let numstat = run_git(workspace_path, &["diff", base_sha, "HEAD", "--numstat"]).await?;
    let unified = run_git(workspace_path, &["diff", base_sha, "HEAD"]).await?;
    let (files_added, files_modified, files_deleted) = parse_numstat(&numstat);
    Ok(DiffSummary {
        diff_text: unified,
        files_added,
        files_modified,
        files_deleted,
    })
}

/// Parse `git diff --numstat` stdout into a per-file map of
/// `(added_lines, removed_lines)`. Binary diffs (`-\t-\t…`) yield
/// `(0, 0)` so callers can still surface the file without misleading
/// counts. Renames render as one row with `{old => new}` in the path
/// segment; we keep that path string verbatim since callers (file tree,
/// changed-files list) work with workspace-relative paths and the
/// rename arrow is unambiguous enough for v0.1.0-beta.1 UI.
pub fn parse_numstat_per_file(stdout: &str) -> HashMap<String, (i64, i64)> {
    let mut out: HashMap<String, (i64, i64)> = HashMap::new();
    for line in stdout.lines() {
        let mut parts = line.splitn(3, '\t');
        let a = parts.next().unwrap_or("");
        let d = parts.next().unwrap_or("");
        let Some(path) = parts.next() else {
            continue;
        };
        if path.is_empty() {
            continue;
        }
        let normalized = path.replace('\\', "/");
        let (added, removed) = if a == "-" && d == "-" {
            (0, 0)
        } else {
            (a.parse().unwrap_or(0), d.parse().unwrap_or(0))
        };
        out.insert(normalized, (added, removed));
    }
    out
}

/// Parse `git diff --numstat` stdout into `(added, modified, deleted)`
/// per D1.5-F. Pure function — unit-tested without git.
fn parse_numstat(stdout: &str) -> (i64, i64, i64) {
    let (mut added, mut modified, mut deleted) = (0i64, 0i64, 0i64);
    for line in stdout.lines() {
        // Format: <added>\t<deleted>\t<path>. Binary: -\t-\t<path>.
        // Renames render as a single row with `{old => new}` in the path.
        let mut parts = line.splitn(3, '\t');
        let a = parts.next().unwrap_or("");
        let d = parts.next().unwrap_or("");
        if parts.next().is_none() {
            // Malformed (< 3 tab-separated fields) → skip.
            continue;
        }
        if a == "-" && d == "-" {
            // Binary file → counts as modified.
            modified += 1;
            continue;
        }
        let av: i64 = a.parse().unwrap_or(0);
        let dv: i64 = d.parse().unwrap_or(0);
        match (av, dv) {
            (0, 0) => modified += 1, // pure rename
            (_, 0) => added += 1,
            (0, _) => deleted += 1,
            (_, _) => modified += 1,
        }
    }
    (added, modified, deleted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::git_available;
    use std::process::Command;

    /// Build a tempdir-backed git repo with identity + one initial commit.
    /// Mirrors `checkpoint.rs::tests::init_repo`.
    fn init_repo(repo: &Path) {
        let s = Command::new("git")
            .arg("init")
            .arg("--initial-branch=main")
            .arg(repo)
            .output()
            .expect("git init");
        assert!(s.status.success(), "git init failed: {:?}", s);
        for (k, v) in [
            ("user.email", "test@mozart.test"),
            ("user.name", "Test Bot"),
        ] {
            let s = Command::new("git")
                .current_dir(repo)
                .args(["config", k, v])
                .output()
                .expect("git config");
            assert!(s.status.success(), "git config {k} failed");
        }
    }

    fn commit_all(repo: &Path, msg: &str) -> String {
        let s = Command::new("git")
            .current_dir(repo)
            .args(["add", "-A"])
            .output()
            .expect("git add");
        assert!(s.status.success(), "git add failed: {:?}", s);
        let s = Command::new("git")
            .current_dir(repo)
            .args(["commit", "--allow-empty", "--no-gpg-sign", "-m", msg])
            .output()
            .expect("git commit");
        assert!(s.status.success(), "git commit failed: {:?}", s);
        let s = Command::new("git")
            .current_dir(repo)
            .args(["rev-parse", "HEAD"])
            .output()
            .expect("git rev-parse");
        assert!(s.status.success());
        String::from_utf8_lossy(&s.stdout).trim().to_string()
    }

    #[test]
    fn parse_numstat_empty_returns_zeros() {
        assert_eq!(parse_numstat(""), (0, 0, 0));
    }

    #[test]
    fn parse_numstat_added_only() {
        assert_eq!(parse_numstat("3\t0\tfoo\n"), (1, 0, 0));
    }

    #[test]
    fn parse_numstat_deleted_only() {
        assert_eq!(parse_numstat("0\t5\tbar\n"), (0, 0, 1));
    }

    #[test]
    fn parse_numstat_modified_both_nonzero() {
        assert_eq!(parse_numstat("4\t2\tbaz\n"), (0, 1, 0));
    }

    #[test]
    fn parse_numstat_binary_counts_as_modified() {
        assert_eq!(parse_numstat("-\t-\timg.png\n"), (0, 1, 0));
    }

    #[test]
    fn parse_numstat_pure_rename_counts_as_modified() {
        assert_eq!(parse_numstat("0\t0\t{old => new}\n"), (0, 1, 0));
    }

    #[test]
    fn parse_numstat_mixed_multi_line() {
        let input = "3\t0\tadded.txt\n\
                     0\t5\tdeleted.txt\n\
                     4\t2\tmodified.txt\n\
                     -\t-\timg.png\n\
                     0\t0\t{old => new}\n";
        // 1 added, 1 deleted, 3 modified (both, binary, rename).
        assert_eq!(parse_numstat(input), (1, 3, 1));
    }

    #[test]
    fn parse_numstat_per_file_empty_returns_empty_map() {
        assert!(parse_numstat_per_file("").is_empty());
    }

    #[test]
    fn parse_numstat_per_file_extracts_pairs() {
        let map = parse_numstat_per_file("3\t0\tadded.txt\n0\t5\tdeleted.txt\n4\t2\tmodified.txt\n");
        assert_eq!(map.get("added.txt"), Some(&(3, 0)));
        assert_eq!(map.get("deleted.txt"), Some(&(0, 5)));
        assert_eq!(map.get("modified.txt"), Some(&(4, 2)));
        assert_eq!(map.len(), 3);
    }

    #[test]
    fn parse_numstat_per_file_binary_is_zero_zero() {
        let map = parse_numstat_per_file("-\t-\timg.png\n");
        assert_eq!(map.get("img.png"), Some(&(0, 0)));
    }

    #[test]
    fn parse_numstat_per_file_skips_malformed() {
        // Two-field rows have no path → must skip without error.
        let map = parse_numstat_per_file("3\t0\nonly-one-field\n4\t2\tok.txt\n");
        assert_eq!(map.len(), 1);
        assert_eq!(map.get("ok.txt"), Some(&(4, 2)));
    }

    #[test]
    fn parse_numstat_per_file_normalizes_path_separators() {
        let map = parse_numstat_per_file("1\t1\tsub\\dir\\file.txt\n");
        assert_eq!(map.get("sub/dir/file.txt"), Some(&(1, 1)));
    }

    #[test]
    fn parse_numstat_skips_malformed_short_rows() {
        // Two-field rows are malformed and must be skipped without error.
        assert_eq!(parse_numstat("3\t0\n"), (0, 0, 0));
        assert_eq!(parse_numstat("only-one-field\n"), (0, 0, 0));
        // A valid row mixed with a malformed one: only the valid row counts.
        assert_eq!(parse_numstat("bad\n3\t0\tfoo\n"), (1, 0, 0));
    }

    #[tokio::test]
    async fn happy_path_one_added_one_modified_one_deleted() {
        if !git_available() {
            eprintln!("SKIP happy_path_one_added_one_modified_one_deleted: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path();
        init_repo(repo);

        // Base commit: two files, one to be modified, one to be deleted.
        std::fs::write(repo.join("to_modify.txt"), "v1\n").unwrap();
        std::fs::write(repo.join("to_delete.txt"), "bye\n").unwrap();
        let base = commit_all(repo, "base");

        // HEAD commit: modify one, delete one, add a new one.
        std::fs::write(repo.join("to_modify.txt"), "v2\nplus\n").unwrap();
        std::fs::remove_file(repo.join("to_delete.txt")).unwrap();
        std::fs::write(repo.join("added.txt"), "hello\n").unwrap();
        let _head = commit_all(repo, "head");

        let summary = capture_diff(repo, &base).await.expect("capture_diff ok");
        assert_eq!(summary.files_added, 1, "files_added");
        assert_eq!(summary.files_modified, 1, "files_modified");
        assert_eq!(summary.files_deleted, 1, "files_deleted");
        assert!(
            !summary.diff_text.is_empty(),
            "diff_text should be non-empty"
        );
        assert!(
            summary.diff_text.contains("diff --git"),
            "diff_text must contain 'diff --git', got: {}",
            summary.diff_text
        );
    }

    #[tokio::test]
    async fn empty_diff_returns_zeros_and_empty_text() {
        if !git_available() {
            eprintln!("SKIP empty_diff_returns_zeros_and_empty_text: git not on PATH");
            return;
        }
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path();
        init_repo(repo);
        std::fs::write(repo.join("seed.txt"), "x\n").unwrap();
        let head = commit_all(repo, "seed");

        // base == HEAD → empty diff, all zeros, no error (D1.5-G).
        let summary = capture_diff(repo, &head).await.expect("capture_diff ok");
        assert_eq!(summary.files_added, 0);
        assert_eq!(summary.files_modified, 0);
        assert_eq!(summary.files_deleted, 0);
        assert!(
            summary.diff_text.is_empty(),
            "diff_text should be empty, got: {:?}",
            summary.diff_text
        );
    }

    #[tokio::test]
    async fn non_existent_base_sha_yields_validation_error() {
        if !git_available() {
            eprintln!("SKIP non_existent_base_sha_yields_validation_error: git not on PATH");
            return;
        }
        // Force locale-stable stderr phrasing (D1.5-J).
        std::env::set_var("LC_ALL", "C");
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path();
        init_repo(repo);
        std::fs::write(repo.join("seed.txt"), "x\n").unwrap();
        let _head = commit_all(repo, "seed");

        // 40-char hex sha that almost certainly doesn't exist.
        let bogus = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
        let err = capture_diff(repo, bogus)
            .await
            .expect_err("must fail on unknown revision");
        match err {
            AppError::GitCmd(msg) => {
                let lower = msg.to_lowercase();
                // Git's exact phrasing for a 40-hex sha that doesn't exist
                // is "bad object <sha>"; for non-hex refs it's "unknown
                // revision or path …". Accept either (D1.5-J: stderr text
                // is git-version-dependent — substring match only).
                assert!(
                    lower.contains("unknown revision")
                        || lower.contains("bad revision")
                        || lower.contains("bad object"),
                    "expected stderr to mention unknown/bad revision or bad object, got: {msg}"
                );
            }
            other => panic!("expected AppError::GitCmd, got {other:?}"),
        }
    }
}
