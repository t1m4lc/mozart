//! Repository file tree — walk a workspace's worktree, overlay git
//! status against `base_branch`, return a nested `FileNodeDto` tree
//! consumed by `domains/repositories/` on the Angular side.
//!
//! v0.0.1 scope (Phase 4b atoms C+E):
//! - `list_tree(worktree, base_branch, show_ignored)` — async, single-shot.
//!   Walks via the `ignore` crate (honors `.gitignore` when
//!   `show_ignored=false`). Status overlay merges
//!   `git diff --name-status <base>...HEAD` (committed range vs. merge
//!   base) with `git status --porcelain=v1` (working tree + index).
//!   Working-tree state wins on overlap.
//! - `spawn_watcher(worktree, channel)` — notify-debouncer-mini at 200ms.
//!   Emits a single `FileTreeEvent::Changed` per debounce window; the
//!   front-end re-fetches via `list_tree` on each ping.
//!
//! Vocabulary: `worktree_path` / `base_branch` are accepted as args
//! (Rust-internal); the DTO surface uses workspace-relative `path`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Duration;

use ignore::{gitignore::Gitignore, WalkBuilder};
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::ipc::Channel;

use crate::error::AppError;
use crate::sandbox;
use crate::sandbox::diff::parse_numstat_per_file;

/// Debounce window for FS events (D4b — single ping per window).
const WATCHER_DEBOUNCE: Duration = Duration::from_millis(200);

/// Per-file change classification against the workspace's base branch.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Status {
    Added,
    Modified,
    Deleted,
    Unchanged,
}

impl Status {
    fn as_wire(self) -> &'static str {
        match self {
            Status::Added => "added",
            Status::Modified => "modified",
            Status::Deleted => "deleted",
            Status::Unchanged => "unchanged",
        }
    }
}

/// Wire shape consumed by the Angular `RepositoriesAdapter`. Names are
/// snake_case on the wire; the TS side maps to camelCase via
/// `fileNodeFromDto`.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct FileNodeDto {
    /// Workspace-relative path, forward-slash separated. Empty for the
    /// (synthetic) root — never emitted: `list_tree` returns the root's
    /// children directly.
    pub path: String,
    pub name: String,
    /// `"file"` or `"directory"`.
    pub kind: String,
    /// `"added" | "modified" | "deleted" | "unchanged"`.
    pub status: String,
    /// True if the entry is matched by `.gitignore`. When
    /// `show_ignored=false` the entry would not be emitted, so this is
    /// false for every node returned in that mode.
    pub ignored: bool,
    /// `Some(children)` for directories (possibly empty). `None` for files.
    pub children: Option<Vec<FileNodeDto>>,
    /// Added lines vs. the workspace's base branch (staged + working
    /// tree combined). `None` for unchanged files and directories. UI
    /// surfaces as a green `+N` chip when present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub added: Option<i64>,
    /// Removed lines vs. base. `None` for unchanged / directories.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub removed: Option<i64>,
}

/// Wire event payload pushed by `watch_repository_tree`. v0.0.1 emits a
/// single variant — the front-end re-fetches on every ping.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FileTreeEvent {
    Changed,
}

/// Walk `worktree`, overlay git status vs. `base_branch`, return the
/// root's children as a nested `FileNodeDto` tree.
///
/// `show_ignored=false` filters via the ripgrep walker (honors
/// `.gitignore`, `.git/info/exclude`, global excludes, hidden files
/// follow git rules). `show_ignored=true` walks everything (still
/// excludes `.git/`) and tags each entry with `ignored=true|false`.
///
/// Status sources:
/// 1. `git diff --name-status <base>...HEAD` — committed range vs. merge base.
/// 2. `git status --porcelain=v1` — working tree + index dirty bits + untracked.
/// Working-tree state wins on overlap.
pub async fn list_tree(
    worktree: &Path,
    base_branch: &str,
    show_ignored: bool,
) -> Result<Vec<FileNodeDto>, AppError> {
    let entries = walk_entries(worktree, show_ignored)?;
    let status_map = compute_status_map(worktree, base_branch).await?;
    let numstat_map = compute_numstat_map(worktree, base_branch).await;
    Ok(build_tree(entries, &status_map, &numstat_map))
}

/// Per-file `(added, removed)` line counts vs. base branch + working
/// tree. Best-effort — failures degrade silently to no counts (file
/// rows render without the +N/-N chip). Sources merge in this order:
/// 1. `git diff <base>...HEAD --numstat` — committed changes vs merge base
/// 2. `git diff HEAD --numstat`         — working tree + staged
/// Working-tree pass wins on overlap because the user cares about the
/// *current* picture, not the previously-committed delta.
async fn compute_numstat_map(
    worktree: &Path,
    base_branch: &str,
) -> HashMap<String, (i64, i64)> {
    let mut map: HashMap<String, (i64, i64)> = HashMap::new();

    let range = format!("{base_branch}...HEAD");
    if let Ok(out) = sandbox::run_git_capture(
        worktree,
        &["diff", &range, "--numstat"],
    )
    .await
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            for (path, counts) in parse_numstat_per_file(&s) {
                map.insert(path, counts);
            }
        }
    }

    if let Ok(out) = sandbox::run_git_capture(
        worktree,
        &["diff", "HEAD", "--numstat"],
    )
    .await
    {
        if out.status.success() {
            let s = String::from_utf8_lossy(&out.stdout);
            for (path, counts) in parse_numstat_per_file(&s) {
                map.insert(path, counts);
            }
        }
    }

    map
}

/// Spawn a debounced FS watcher rooted at `worktree`. The returned
/// `Debouncer` owns the underlying notify watcher; dropping it stops
/// the watcher and joins its background thread.
///
/// Each debounce window collapses to a single `FileTreeEvent::Changed`
/// pushed on `on_event`. The front-end re-fetches the full tree on
/// each ping — bandwidth is small (one no-payload event) and the
/// rebuild is cheap relative to a real burst (e.g. `pnpm install`).
pub fn spawn_watcher(
    worktree: PathBuf,
    on_event: Channel<FileTreeEvent>,
) -> Result<Debouncer<RecommendedWatcher>, AppError> {
    let mut debouncer = new_debouncer(WATCHER_DEBOUNCE, move |res: DebounceEventResult| {
        match res {
            Ok(events) => {
                if events.is_empty() {
                    return;
                }
                if let Err(e) = on_event.send(FileTreeEvent::Changed) {
                    log::warn!("file_tree watcher: channel send failed: {e}");
                }
            }
            Err(err) => {
                log::warn!("file_tree watcher: notify error: {err:?}");
            }
        }
    })
    .map_err(|e| AppError::Io(format!("create fs debouncer: {e}")))?;
    debouncer
        .watcher()
        .watch(&worktree, RecursiveMode::Recursive)
        .map_err(|e| AppError::Io(format!("watch worktree {worktree:?}: {e}")))?;
    Ok(debouncer)
}

#[derive(Debug, Clone)]
struct EntryFlat {
    path: String,
    name: String,
    is_dir: bool,
    ignored: bool,
}

fn walk_entries(worktree: &Path, show_ignored: bool) -> Result<Vec<EntryFlat>, AppError> {
    // When `show_ignored=true` we still want to know which entries are
    // gitignored so the UI can tone them down. Build a separate matcher.
    let gitignore_matcher: Option<Gitignore> = if show_ignored {
        let candidate = worktree.join(".gitignore");
        if candidate.is_file() {
            let (gi, _err) = Gitignore::new(&candidate);
            Some(gi)
        } else {
            None
        }
    } else {
        None
    };

    let mut walker = WalkBuilder::new(worktree);
    walker
        .hidden(false)
        .follow_links(false)
        .git_ignore(!show_ignored)
        .git_global(!show_ignored)
        .git_exclude(!show_ignored)
        .ignore(!show_ignored)
        .require_git(false)
        .filter_entry(|entry| entry.file_name() != ".git");

    let mut entries: Vec<EntryFlat> = Vec::new();
    for result in walker.build() {
        let dent = match result {
            Ok(d) => d,
            Err(e) => {
                log::debug!("file_tree: skipping unreadable entry: {e}");
                continue;
            }
        };
        // Skip the root itself.
        let rel = match dent.path().strip_prefix(worktree) {
            Ok(r) if r.as_os_str().is_empty() => continue,
            Ok(r) => r,
            Err(_) => continue,
        };
        let rel_str = rel.to_string_lossy().replace('\\', "/");
        let name = dent
            .file_name()
            .to_string_lossy()
            .into_owned();
        let is_dir = dent
            .file_type()
            .map(|t| t.is_dir())
            .unwrap_or(false);
        let ignored = if let Some(gi) = gitignore_matcher.as_ref() {
            !gi
                .matched_path_or_any_parents(rel, is_dir)
                .is_none()
        } else {
            false
        };
        entries.push(EntryFlat {
            path: rel_str,
            name,
            is_dir,
            ignored,
        });
    }
    Ok(entries)
}

async fn compute_status_map(
    worktree: &Path,
    base_branch: &str,
) -> Result<HashMap<String, Status>, AppError> {
    let mut map: HashMap<String, Status> = HashMap::new();

    // Committed range vs. merge base. Tolerate failure (e.g. unknown
    // base ref) — falling back to "no committed changes" is preferable
    // to surfacing a hard error in the file tree.
    let range = format!("{base_branch}...HEAD");
    if let Ok(out) = sandbox::run_git_capture(
        worktree,
        &["diff", "--name-status", "-z", &range],
    )
    .await
    {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for (path, status) in parse_diff_name_status(&stdout) {
                map.insert(path, status);
            }
        }
    }

    // Working tree + index. Always run; failure here is fatal because
    // the user's view of "what's changed" depends on it.
    if let Ok(out) =
        sandbox::run_git_capture(worktree, &["status", "--porcelain=v1", "-z"]).await
    {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for (path, status) in parse_status_porcelain(&stdout) {
                map.insert(path, status);
            }
        }
    }

    Ok(map)
}

fn parse_diff_name_status(stdout: &str) -> Vec<(String, Status)> {
    // `git diff --name-status -z` emits NUL-delimited fields:
    //   M\0path\0
    //   R<score>\0old\0new\0
    //   A\0path\0
    //   D\0path\0
    let mut out: Vec<(String, Status)> = Vec::new();
    let mut iter = stdout.split('\0').filter(|s| !s.is_empty());
    while let Some(code) = iter.next() {
        let first = code.chars().next().unwrap_or(' ');
        match first {
            'A' => {
                if let Some(p) = iter.next() {
                    out.push((normalize(p), Status::Added));
                }
            }
            'D' => {
                if let Some(p) = iter.next() {
                    out.push((normalize(p), Status::Deleted));
                }
            }
            'R' | 'C' => {
                // Renames and copies emit two paths; treat the new path
                // as Modified (v0.0.1 simplification).
                let _old = iter.next();
                if let Some(new) = iter.next() {
                    out.push((normalize(new), Status::Modified));
                }
            }
            'M' | 'T' => {
                if let Some(p) = iter.next() {
                    out.push((normalize(p), Status::Modified));
                }
            }
            _ => {
                // Unknown / 'U' (unmerged) etc. — consume one path and skip.
                let _ = iter.next();
            }
        }
    }
    out
}

fn parse_status_porcelain(stdout: &str) -> Vec<(String, Status)> {
    // `--porcelain=v1 -z` emits one record per path:
    //   XY<space>path\0
    //   For renames (XY=R) it's: XY<space>new\0old\0
    let mut out: Vec<(String, Status)> = Vec::new();
    let mut iter = stdout.split('\0').filter(|s| !s.is_empty()).peekable();
    while let Some(record) = iter.next() {
        if record.len() < 4 {
            continue;
        }
        let xy = &record[..2];
        let path = record[3..].to_string();
        let status = classify_xy(xy);
        // Rename: also consume the old path token, which carries no
        // status of its own.
        if xy.starts_with('R') || xy.starts_with('C') {
            let _ = iter.next();
        }
        if let Some(s) = status {
            out.push((normalize(&path), s));
        }
    }
    out
}

fn classify_xy(xy: &str) -> Option<Status> {
    let bytes = xy.as_bytes();
    let x = *bytes.first().unwrap_or(&b' ');
    let y = *bytes.get(1).unwrap_or(&b' ');
    if x == b'?' && y == b'?' {
        return Some(Status::Added);
    }
    if x == b'!' && y == b'!' {
        return None;
    }
    let any = |c: u8| x == c || y == c;
    if any(b'D') {
        return Some(Status::Deleted);
    }
    if any(b'A') {
        return Some(Status::Added);
    }
    if any(b'M') || any(b'R') || any(b'C') || any(b'T') {
        return Some(Status::Modified);
    }
    None
}

fn normalize(p: &str) -> String {
    p.replace('\\', "/")
}

fn parent_path(path: &str) -> &str {
    match path.rfind('/') {
        Some(idx) => &path[..idx],
        None => "",
    }
}

fn build_tree(
    entries: Vec<EntryFlat>,
    status_map: &HashMap<String, Status>,
    numstat_map: &HashMap<String, (i64, i64)>,
) -> Vec<FileNodeDto> {
    let mut by_parent: HashMap<String, Vec<EntryFlat>> = HashMap::new();
    for e in entries {
        let parent = parent_path(&e.path).to_string();
        by_parent.entry(parent).or_default().push(e);
    }
    build_subtree("", &mut by_parent, status_map, numstat_map)
}

fn build_subtree(
    parent: &str,
    by_parent: &mut HashMap<String, Vec<EntryFlat>>,
    status_map: &HashMap<String, Status>,
    numstat_map: &HashMap<String, (i64, i64)>,
) -> Vec<FileNodeDto> {
    let kids = by_parent.remove(parent).unwrap_or_default();
    let mut nodes: Vec<FileNodeDto> = kids
        .into_iter()
        .map(|e| {
            let children = if e.is_dir {
                Some(build_subtree(&e.path, by_parent, status_map, numstat_map))
            } else {
                None
            };
            let status = status_map
                .get(&e.path)
                .copied()
                .unwrap_or(Status::Unchanged);
            let (added, removed) = if e.is_dir {
                (None, None)
            } else {
                match numstat_map.get(&e.path) {
                    Some(&(a, d)) => (Some(a), Some(d)),
                    None => (None, None),
                }
            };
            FileNodeDto {
                path: e.path,
                name: e.name,
                kind: if e.is_dir {
                    "directory".into()
                } else {
                    "file".into()
                },
                status: status.as_wire().into(),
                ignored: e.ignored,
                children,
                added,
                removed,
            }
        })
        .collect();
    // Directories first, then alphabetical (case-insensitive).
    nodes.sort_by(|a, b| {
        let a_dir = a.kind == "directory";
        let b_dir = b.kind == "directory";
        b_dir
            .cmp(&a_dir)
            .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    nodes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parent_path_root_and_nested() {
        assert_eq!(parent_path("foo.txt"), "");
        assert_eq!(parent_path("src/lib.rs"), "src");
        assert_eq!(parent_path("a/b/c.txt"), "a/b");
    }

    #[test]
    fn classify_xy_known_codes() {
        assert_eq!(classify_xy("??"), Some(Status::Added));
        assert_eq!(classify_xy(" M"), Some(Status::Modified));
        assert_eq!(classify_xy("M "), Some(Status::Modified));
        assert_eq!(classify_xy("A "), Some(Status::Added));
        assert_eq!(classify_xy(" D"), Some(Status::Deleted));
        assert_eq!(classify_xy("R "), Some(Status::Modified));
        assert_eq!(classify_xy("!!"), None);
        assert_eq!(classify_xy("  "), None);
    }

    #[test]
    fn parse_diff_name_status_basic() {
        // M\0a.txt\0A\0b.txt\0D\0c.txt\0
        let s = "M\0a.txt\0A\0b.txt\0D\0c.txt\0";
        let parsed = parse_diff_name_status(s);
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0], ("a.txt".to_string(), Status::Modified));
        assert_eq!(parsed[1], ("b.txt".to_string(), Status::Added));
        assert_eq!(parsed[2], ("c.txt".to_string(), Status::Deleted));
    }

    #[test]
    fn parse_diff_name_status_rename_takes_new_path_as_modified() {
        // R100\0old.txt\0new.txt\0
        let s = "R100\0old.txt\0new.txt\0";
        let parsed = parse_diff_name_status(s);
        assert_eq!(parsed, vec![("new.txt".to_string(), Status::Modified)]);
    }

    #[test]
    fn parse_status_porcelain_untracked_is_added() {
        // ?? path\0
        let s = "?? new.txt\0";
        let parsed = parse_status_porcelain(s);
        assert_eq!(parsed, vec![("new.txt".to_string(), Status::Added)]);
    }

    #[test]
    fn parse_status_porcelain_modified_in_worktree() {
        let s = " M src/foo.rs\0";
        let parsed = parse_status_porcelain(s);
        assert_eq!(parsed, vec![("src/foo.rs".to_string(), Status::Modified)]);
    }

    #[test]
    fn parse_status_porcelain_rename_consumes_old_path() {
        // R  new\0old\0  M  later.txt\0
        let s = "R  new.txt\0old.txt\0 M later.txt\0";
        let parsed = parse_status_porcelain(s);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0], ("new.txt".to_string(), Status::Modified));
        assert_eq!(parsed[1], ("later.txt".to_string(), Status::Modified));
    }

    #[test]
    fn build_tree_groups_children_under_parents_and_sorts() {
        let entries = vec![
            EntryFlat {
                path: "src".into(),
                name: "src".into(),
                is_dir: true,
                ignored: false,
            },
            EntryFlat {
                path: "src/lib.rs".into(),
                name: "lib.rs".into(),
                is_dir: false,
                ignored: false,
            },
            EntryFlat {
                path: "Cargo.toml".into(),
                name: "Cargo.toml".into(),
                is_dir: false,
                ignored: false,
            },
            EntryFlat {
                path: "src/util".into(),
                name: "util".into(),
                is_dir: true,
                ignored: false,
            },
            EntryFlat {
                path: "src/util/path.rs".into(),
                name: "path.rs".into(),
                is_dir: false,
                ignored: false,
            },
        ];
        let status_map: HashMap<String, Status> = HashMap::new();
        let numstat_map: HashMap<String, (i64, i64)> = HashMap::new();
        let tree = build_tree(entries, &status_map, &numstat_map);
        // Root: src/ first (directory), then Cargo.toml (file)
        assert_eq!(tree.len(), 2);
        assert_eq!(tree[0].name, "src");
        assert_eq!(tree[0].kind, "directory");
        assert_eq!(tree[1].name, "Cargo.toml");
        assert_eq!(tree[1].kind, "file");
        // src has util/ first, then lib.rs
        let src_kids = tree[0].children.as_ref().unwrap();
        assert_eq!(src_kids.len(), 2);
        assert_eq!(src_kids[0].name, "util");
        assert_eq!(src_kids[1].name, "lib.rs");
    }
}
