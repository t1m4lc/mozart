//! Spike A — `git worktree add` cross-platform.
//!
//! Validates: plan-v0.1.0-beta.1.md L406 — "Works on Win/Mac/Linux from `Command::new("git")`".
//!
//! Run with:
//!   cargo test --tests --ignored -- spike_a --nocapture

use std::process::Command;

/// True if a working `git` binary is on PATH.
fn git_available() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[test]
#[ignore = "spike — requires git binary, run with --ignored"]
fn spike_a_worktree_add_creates_worktree() -> anyhow::Result<()> {
    if !git_available() {
        eprintln!("SKIP spike_a: `git` binary not on PATH");
        return Ok(());
    }

    let tmp = tempfile::tempdir()?;
    let repo = tmp.path();

    // 1. init repo with a deterministic initial branch
    let status = Command::new("git")
        .arg("init")
        .arg("--initial-branch=main")
        .arg(repo)
        .status()?;
    anyhow::ensure!(status.success(), "git init failed");

    // 2. set local identity so the commit doesn't fail in a clean environment
    for (k, v) in [("user.email", "spike@mozart.test"), ("user.name", "Spike Bot")] {
        let s = Command::new("git")
            .current_dir(repo)
            .args(["config", k, v])
            .status()?;
        anyhow::ensure!(s.success(), "git config {k} failed");
    }

    // 3. empty initial commit (worktrees need at least one ref)
    let status = Command::new("git")
        .current_dir(repo)
        .args(["commit", "--allow-empty", "-m", "init"])
        .status()?;
    anyhow::ensure!(status.success(), "initial commit failed");

    // 4. create the worktree
    let wt = repo.join("wt");
    let status = Command::new("git")
        .current_dir(repo)
        .args(["worktree", "add", "-b", "spike-a"])
        .arg(&wt)
        .status()?;
    anyhow::ensure!(status.success(), "git worktree add failed");

    // 5. assertions: worktree dir exists, contains a `.git` FILE (not directory)
    anyhow::ensure!(wt.is_dir(), "worktree path missing");
    let dotgit = wt.join(".git");
    anyhow::ensure!(dotgit.exists(), ".git missing in worktree");
    anyhow::ensure!(
        dotgit.is_file(),
        ".git in a worktree must be a file (gitfile pointer), not a directory"
    );

    eprintln!("OK spike_a: worktree created at {}", wt.display());
    Ok(())
}
