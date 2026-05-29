//! Git commit operations for Phase 4f's commit dialog.
//!
//! - `list_changed_files(worktree)` → flat list of `{ path, status }`
//!   suitable for a checkbox list. Sources from `git status --porcelain=v1
//!   -z` so untracked files appear too.
//! - `list_branch_diff_files(worktree, base_branch)` → all files changed vs
//!   `base_branch` (committed + staged + unstaged). Powers the Changes tab.
//! - `commit(worktree, paths, message)` → `git add -- <paths>` then
//!   `git commit -m <message>`. Refuses if the path list is empty (no
//!   staged delta means git would create an empty commit; we don't
//!   want to silently advance HEAD).

use std::path::Path;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;
use crate::sandbox;
use crate::sandbox::diff::parse_numstat_per_file;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ChangedFile {
    pub path: String,
    /// `"added" | "modified" | "deleted"`. Untracked files surface as
    /// "added" so the dialog presents them uniformly.
    pub status: String,
    /// `true` when the file has changes in git's index — derived from
    /// the X byte of `git status --porcelain=v1`. The Changes pane in
    /// the right aside splits on this: staged files surface in a
    /// separate group from unstaged worktree changes.
    pub staged: bool,
    /// Added lines vs. `HEAD` (working tree + staged combined). For
    /// untracked files this is the file's own line count. `0` for
    /// pure deletions and binary diffs.
    #[serde(default)]
    pub added: i64,
    /// Removed lines vs. `HEAD`. `0` for untracked / binary diffs.
    #[serde(default)]
    pub removed: i64,
    /// P2.6.D — `true` when the file is in git's unmerged state
    /// (`git diff --name-only --diff-filter=U` lists it). The Changes
    /// tab paints these rows with a red conflict badge while the
    /// worktree sits mid-merge.
    #[serde(default)]
    pub has_conflict: bool,
}

pub async fn list_changed_files(worktree: &Path) -> Result<Vec<ChangedFile>, AppError> {
    let out = sandbox::run_git_capture(worktree, &["status", "--porcelain=v1", "-z"]).await?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::GitCmd(format!("git status failed: {stderr}")));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut files = parse_porcelain(&stdout);

    // Numstat for line counts. `git diff HEAD` covers staged + unstaged
    // tracked changes in a single pass — git resolves the comparison
    // base internally. Untracked files don't appear in `git diff` so
    // we count their own line count as "added" below.
    let mut numstat_map: std::collections::HashMap<String, (i64, i64)> =
        std::collections::HashMap::new();
    if let Ok(out) =
        sandbox::run_git_capture(worktree, &["diff", "HEAD", "--numstat"]).await
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            numstat_map = parse_numstat_per_file(&s);
        }
    }

    for f in &mut files {
        if let Some(&(a, d)) = numstat_map.get(&f.path) {
            f.added = a;
            f.removed = d;
        } else if f.status == "added" {
            // Untracked: count the file's own lines so the UI shows
            // a meaningful "+N". Best-effort — IO failures yield 0.
            if let Ok(bytes) = tokio::fs::read(worktree.join(&f.path)).await {
                f.added = bytecount_newlines(&bytes);
            }
        }
    }

    // P2.6.D — overlay conflict flags. `--diff-filter=U` returns the
    // unmerged paths and only has output during an active merge state;
    // missing-binary / IO errors fall through to a no-op so the changes
    // list still renders.
    if let Ok(out) =
        sandbox::run_git_capture(worktree, &["diff", "--name-only", "--diff-filter=U"]).await
    {
        if out.status.success() {
            let raw = String::from_utf8_lossy(&out.stdout);
            let conflict_set: std::collections::HashSet<&str> = raw
                .lines()
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();
            if !conflict_set.is_empty() {
                for f in &mut files {
                    if conflict_set.contains(f.path.as_str()) {
                        f.has_conflict = true;
                    }
                }
            }
        }
    }

    Ok(files)
}

/// Count newline-terminated lines in `bytes`. Mirrors `wc -l` but also
/// counts the trailing (unterminated) line so a single-line file with
/// no final newline still reports 1. Binary content is treated as a
/// line count too — fine since UI surfaces this as a coarse "+N".
fn bytecount_newlines(bytes: &[u8]) -> i64 {
    if bytes.is_empty() {
        return 0;
    }
    let mut n = bytes.iter().filter(|b| **b == b'\n').count() as i64;
    if *bytes.last().unwrap() != b'\n' {
        n += 1;
    }
    n
}

/// All files changed in `worktree` vs `base_branch` — committed, staged, and
/// unstaged. Uses `git diff <base_branch>` which compares the working tree to
/// the base branch tip. Powers the Changes tab in the right aside.
pub async fn list_branch_diff_files(
    worktree: &Path,
    base_branch: &str,
) -> Result<Vec<ChangedFile>, AppError> {
    let out = sandbox::run_git_capture(
        worktree,
        &["diff", "--name-status", "-z", base_branch],
    )
    .await?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::GitCmd(format!(
            "git diff --name-status {base_branch} failed: {stderr}"
        )));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut files = parse_name_status_z(&stdout);

    if let Ok(ns_out) =
        sandbox::run_git_capture(worktree, &["diff", "--numstat", base_branch]).await
    {
        if ns_out.status.success() {
            let s = String::from_utf8_lossy(&ns_out.stdout);
            let numstat_map = parse_numstat_per_file(&s);
            for f in &mut files {
                if let Some(&(a, d)) = numstat_map.get(&f.path) {
                    f.added = a;
                    f.removed = d;
                }
            }
        }
    }

    Ok(files)
}

fn parse_name_status_z(stdout: &str) -> Vec<ChangedFile> {
    let mut out = Vec::new();
    let mut iter = stdout.split('\0').filter(|s| !s.is_empty()).peekable();
    while let Some(status_record) = iter.next() {
        let status_str = status_record.trim();
        if status_str.is_empty() {
            continue;
        }
        let is_rename_copy =
            status_str.starts_with('R') || status_str.starts_with('C');
        let path = match iter.next() {
            Some(p) => p.replace('\\', "/"),
            None => break,
        };
        if is_rename_copy {
            // Second token is the destination path; use it.
            let new_path = match iter.next() {
                Some(p) => p.replace('\\', "/"),
                None => break,
            };
            out.push(ChangedFile {
                path: new_path,
                status: "modified".into(),
                staged: false,
                added: 0,
                removed: 0,
                has_conflict: false,
            });
            continue;
        }
        if let Some(status) = classify_diff_status(status_str) {
            out.push(ChangedFile {
                path,
                status: status.into(),
                staged: false,
                added: 0,
                removed: 0,
                has_conflict: false,
            });
        }
    }
    out.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    out
}

fn classify_diff_status(s: &str) -> Option<&'static str> {
    match s.as_bytes().first().copied()? {
        b'A' => Some("added"),
        b'M' | b'T' => Some("modified"),
        b'D' => Some("deleted"),
        b'R' | b'C' => Some("modified"),
        b'U' => Some("modified"),
        _ => None,
    }
}

pub async fn commit(
    worktree: &Path,
    paths: &[String],
    message: &str,
) -> Result<String, AppError> {
    if message.trim().is_empty() {
        return Err(AppError::Validation("commit message is empty".into()));
    }
    if paths.is_empty() {
        return Err(AppError::Validation("no files selected".into()));
    }
    // Stage the selected paths. `git add` handles deletions naturally
    // when the path no longer exists in the worktree.
    let mut add_args: Vec<&str> = vec!["add", "--"];
    for p in paths {
        validate_path(p)?;
        add_args.push(p);
    }
    sandbox::run_git(worktree, &add_args).await?;

    // Commit. `--no-gpg-sign` keeps tests + dev-mode hassle-free.
    let stdout = sandbox::run_git(
        worktree,
        &["commit", "--no-gpg-sign", "-m", message],
    )
    .await?;

    // Resolve the new HEAD sha for the caller (used by the PR flow).
    let sha = sandbox::run_git(worktree, &["rev-parse", "HEAD"])
        .await?
        .trim()
        .to_string();

    log::debug!("commit: stdout={}", stdout.trim());
    Ok(sha)
}

fn validate_path(p: &str) -> Result<(), AppError> {
    if p.is_empty() || p.starts_with('/') || p.contains('\0') {
        return Err(AppError::Validation(format!("invalid path: {p}")));
    }
    if p.split('/').any(|seg| seg == "..") {
        return Err(AppError::Validation(format!("path escapes workspace: {p}")));
    }
    Ok(())
}

fn parse_porcelain(stdout: &str) -> Vec<ChangedFile> {
    let mut out = Vec::new();
    let mut iter = stdout.split('\0').filter(|s| !s.is_empty()).peekable();
    while let Some(record) = iter.next() {
        if record.len() < 4 {
            continue;
        }
        let xy = &record[..2];
        let path = record[3..].to_string();
        let status = classify(xy);
        let staged = is_staged(xy);
        // Renames also emit the old path; consume + drop.
        if xy.starts_with('R') || xy.starts_with('C') {
            let _ = iter.next();
        }
        if let Some(s) = status {
            out.push(ChangedFile {
                path: path.replace('\\', "/"),
                status: s.into(),
                staged,
                added: 0,
                removed: 0,
                has_conflict: false,
            });
        }
    }
    out.sort_by(|a, b| a.path.to_lowercase().cmp(&b.path.to_lowercase()));
    out
}

/// X byte of the porcelain pair represents the staged state. Any
/// non-space, non-`?` value means the file has changes in the index.
/// `??` (untracked) is unstaged by definition.
fn is_staged(xy: &str) -> bool {
    let x = xy.as_bytes().first().copied().unwrap_or(b' ');
    x != b' ' && x != b'?'
}

fn classify(xy: &str) -> Option<&'static str> {
    let bytes = xy.as_bytes();
    let x = *bytes.first().unwrap_or(&b' ');
    let y = *bytes.get(1).unwrap_or(&b' ');
    if x == b'?' && y == b'?' {
        return Some("added");
    }
    if x == b'!' && y == b'!' {
        return None;
    }
    let any = |c: u8| x == c || y == c;
    if any(b'D') {
        return Some("deleted");
    }
    if any(b'A') {
        return Some("added");
    }
    if any(b'M') || any(b'R') || any(b'C') || any(b'T') {
        return Some("modified");
    }
    // Unmerged paths (conflict states: UU, AU, UA, UD, DU, AA, DD).
    // Surface them as "modified" so the Changes tab still lists them;
    // the conflict badge comes from the `has_conflict` overlay set in
    // `list_changed_files` via `git diff --diff-filter=U`.
    if any(b'U') {
        return Some("modified");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_porcelain_handles_added_modified_deleted_untracked() {
        let s = " M src/foo.rs\0?? new.txt\0 D gone.rs\0M  staged.rs\0";
        let parsed = parse_porcelain(s);
        let by_path: std::collections::HashMap<_, _> =
            parsed.iter().map(|f| (f.path.as_str(), f.status.as_str())).collect();
        assert_eq!(by_path.get("src/foo.rs"), Some(&"modified"));
        assert_eq!(by_path.get("new.txt"), Some(&"added"));
        assert_eq!(by_path.get("gone.rs"), Some(&"deleted"));
        assert_eq!(by_path.get("staged.rs"), Some(&"modified"));
    }

    #[test]
    fn parse_porcelain_skips_ignored() {
        let parsed = parse_porcelain("!! .DS_Store\0");
        assert!(parsed.is_empty());
    }

    #[test]
    fn validate_path_rejects_escapes() {
        assert!(validate_path("../escape").is_err());
        assert!(validate_path("/absolute").is_err());
        assert!(validate_path("ok/../bad").is_err());
        assert!(validate_path("ok/sub").is_ok());
    }

    async fn run(cwd: &Path, args: &[&str]) {
        let out = sandbox::run_git_capture(cwd, args).await.expect("git");
        assert!(
            out.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&out.stderr)
        );
    }

    #[tokio::test]
    async fn list_changed_files_flags_unmerged_paths() {
        if !sandbox::git_available() {
            eprintln!("skip: git not on PATH");
            return;
        }
        let _g = sandbox::test_env_gate().lock().unwrap();
        let tmp = tempfile::tempdir().unwrap();
        let repo = tmp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        run(&repo, &["init", "-q", "-b", "main"]).await;
        run(&repo, &["config", "user.email", "t@example.com"]).await;
        run(&repo, &["config", "user.name", "T"]).await;
        std::fs::write(repo.join("conflict.txt"), "base\n").unwrap();
        run(&repo, &["add", "conflict.txt"]).await;
        run(&repo, &["commit", "-m", "base"]).await;

        run(&repo, &["checkout", "-b", "feature"]).await;
        std::fs::write(repo.join("conflict.txt"), "from-feature\n").unwrap();
        run(&repo, &["commit", "-am", "feature edit"]).await;
        // Re-touch a non-conflict file so the changes list has a
        // baseline entry that should NOT be flagged.
        std::fs::write(repo.join("calm.txt"), "calm\n").unwrap();
        run(&repo, &["add", "calm.txt"]).await;
        run(&repo, &["commit", "-m", "calm"]).await;

        run(&repo, &["checkout", "main"]).await;
        std::fs::write(repo.join("conflict.txt"), "from-main\n").unwrap();
        run(&repo, &["commit", "-am", "main edit"]).await;

        // Force a conflict.
        let out = sandbox::run_git_capture(&repo, &["merge", "--no-ff", "feature"])
            .await
            .expect("git merge");
        assert!(!out.status.success(), "merge should conflict");

        let files = list_changed_files(&repo).await.expect("list");
        let by_path: std::collections::HashMap<_, _> =
            files.iter().map(|f| (f.path.as_str(), f)).collect();
        assert!(
            by_path.get("conflict.txt").map(|f| f.has_conflict).unwrap_or(false),
            "expected conflict.txt to be flagged; got: {files:?}"
        );
        // calm.txt was merged cleanly — it shouldn't be in the changes
        // list at all (no porcelain entry post-merge for a clean file).
        // The assertion above is the contract we care about.
    }
}
