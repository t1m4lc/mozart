//! Git commit operations for Phase 4f's commit dialog.
//!
//! - `list_changed_files(worktree)` → flat list of `{ path, status }`
//!   suitable for a checkbox list. Sources from `git status --porcelain=v1
//!   -z` so untracked files appear too.
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
}
