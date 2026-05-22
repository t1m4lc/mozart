//! In-memory cache for `list_repository_tree` results keyed by
//! `workspace_id`. Each entry stores the last-built `Vec<FileNodeDto>`
//! plus the `show_ignored` and `base_branch` it was built under, so a
//! cache hit requires matching both. Invalidation is driven by the
//! FS-watcher: `spawn_watcher` calls `bump_revision` inside the
//! debounce callback, which makes the next `get` miss.
//!
//! Sized for hot workspace alternation: switching back to a previously-
//! visited workspace returns the tree without re-walking the worktree
//! or re-running `git status`. The walker + git invocations are the
//! dominant cost on large repos; this cache turns the 2nd visit into
//! an O(1) HashMap clone.
//!
//! Concurrency: `std::sync::Mutex<HashMap<...>>` matches the other
//! registries in this crate (`FileWatcherRegistry`, `RunRegistry`,
//! ...). Reads clone the `Vec<FileNodeDto>` while the lock is held —
//! the clone is the actual work; the lock window is short.
//!
//! Staleness contract (mirrors the TS-side `FileTreeCacheStore`):
//!   - Readers capture `current_revision(ws)` before calling out.
//!   - On `store(...)`, if the captured revision != the current one,
//!     the write is silently dropped (a watcher event fired mid-fetch
//!     → the fresh fetch is already stale).
//!   - `bump_revision` is the only invalidation source. The cache is
//!     never cleared on a timer.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::file_tree::FileNodeDto;

struct CacheEntry {
    tree: Vec<FileNodeDto>,
    show_ignored: bool,
    base_branch: String,
    revision: u64,
}

pub struct FileTreeCache {
    entries: Mutex<HashMap<String, CacheEntry>>,
    revisions: Mutex<HashMap<String, u64>>,
}

impl FileTreeCache {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            revisions: Mutex::new(HashMap::new()),
        }
    }

    /// Snapshot of the workspace's current revision. Capture this
    /// *before* triggering a rebuild so a watcher event that races the
    /// rebuild can be detected on `store`.
    pub fn current_revision(&self, workspace_id: &str) -> u64 {
        let g = self.revisions.lock().expect("cache poisoned");
        g.get(workspace_id).copied().unwrap_or(0)
    }

    /// Bump the workspace's revision. Called by the FS-watcher's
    /// debounce callback before the channel event reaches the frontend
    /// — that ordering guarantees the next `list_repository_tree`
    /// invocation sees an empty cache and refetches.
    pub fn bump_revision(&self, workspace_id: &str) {
        let mut g = self.revisions.lock().expect("cache poisoned");
        let next = g.get(workspace_id).copied().unwrap_or(0) + 1;
        g.insert(workspace_id.to_string(), next);
    }

    /// Returns the cached tree iff it was built under the same
    /// `show_ignored` and `base_branch`, and the entry's revision is
    /// still current. Clones the `Vec<FileNodeDto>` — the caller owns
    /// the returned tree.
    pub fn get(
        &self,
        workspace_id: &str,
        show_ignored: bool,
        base_branch: &str,
    ) -> Option<Vec<FileNodeDto>> {
        let current = self.current_revision(workspace_id);
        let g = self.entries.lock().expect("cache poisoned");
        let entry = g.get(workspace_id)?;
        if entry.show_ignored != show_ignored {
            return None;
        }
        if entry.base_branch != base_branch {
            return None;
        }
        if entry.revision != current {
            return None;
        }
        Some(entry.tree.clone())
    }

    /// Write a freshly-built tree. Dropped silently if `captured` no
    /// longer matches the workspace's current revision (a watcher
    /// event landed while the rebuild was in flight).
    pub fn store(
        &self,
        workspace_id: &str,
        show_ignored: bool,
        base_branch: &str,
        tree: Vec<FileNodeDto>,
        captured: u64,
    ) {
        let current = self.current_revision(workspace_id);
        if captured != current {
            return;
        }
        let mut g = self.entries.lock().expect("cache poisoned");
        g.insert(
            workspace_id.to_string(),
            CacheEntry {
                tree,
                show_ignored,
                base_branch: base_branch.to_string(),
                revision: captured,
            },
        );
    }

    /// Drop the cache entry and revision counter for a workspace.
    /// Called when a workspace is deleted; routine FS changes go
    /// through `bump_revision`.
    pub fn clear(&self, workspace_id: &str) {
        let mut entries = self.entries.lock().expect("cache poisoned");
        entries.remove(workspace_id);
        let mut revisions = self.revisions.lock().expect("cache poisoned");
        revisions.remove(workspace_id);
    }
}

impl Default for FileTreeCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(name: &str) -> FileNodeDto {
        FileNodeDto {
            path: name.to_string(),
            name: name.to_string(),
            kind: "file".to_string(),
            status: "unchanged".to_string(),
            ignored: false,
            children: None,
            added: None,
            removed: None,
        }
    }

    #[test]
    fn empty_cache_returns_none() {
        let cache = FileTreeCache::new();
        assert!(cache.get("ws-1", false, "main").is_none());
        assert_eq!(cache.current_revision("ws-1"), 0);
    }

    #[test]
    fn hit_when_show_ignored_and_base_branch_match() {
        let cache = FileTreeCache::new();
        let captured = cache.current_revision("ws-1");
        cache.store("ws-1", false, "main", vec![node("a.txt")], captured);
        let hit = cache.get("ws-1", false, "main").expect("hit");
        assert_eq!(hit.len(), 1);
        assert_eq!(hit[0].name, "a.txt");
    }

    #[test]
    fn miss_when_show_ignored_differs() {
        let cache = FileTreeCache::new();
        let captured = cache.current_revision("ws-1");
        cache.store("ws-1", false, "main", vec![node("a.txt")], captured);
        assert!(cache.get("ws-1", true, "main").is_none());
    }

    #[test]
    fn miss_when_base_branch_differs() {
        let cache = FileTreeCache::new();
        let captured = cache.current_revision("ws-1");
        cache.store("ws-1", false, "main", vec![node("a.txt")], captured);
        assert!(cache.get("ws-1", false, "develop").is_none());
    }

    #[test]
    fn miss_after_bump_revision() {
        let cache = FileTreeCache::new();
        let captured = cache.current_revision("ws-1");
        cache.store("ws-1", false, "main", vec![node("a.txt")], captured);
        assert!(cache.get("ws-1", false, "main").is_some());
        cache.bump_revision("ws-1");
        assert!(cache.get("ws-1", false, "main").is_none());
    }

    #[test]
    fn store_silently_dropped_when_revision_advanced_mid_fetch() {
        let cache = FileTreeCache::new();
        // Reader captures revision 0, then a watcher event bumps it
        // before the rebuild lands.
        let captured = cache.current_revision("ws-1");
        cache.bump_revision("ws-1");
        cache.store("ws-1", false, "main", vec![node("a.txt")], captured);
        // The store was a no-op — next reader sees an empty cache.
        assert!(cache.get("ws-1", false, "main").is_none());
    }

    #[test]
    fn entries_are_isolated_per_workspace() {
        let cache = FileTreeCache::new();
        let cap_a = cache.current_revision("ws-a");
        let cap_b = cache.current_revision("ws-b");
        cache.store("ws-a", false, "main", vec![node("a.txt")], cap_a);
        cache.store("ws-b", false, "main", vec![node("b.txt")], cap_b);
        cache.bump_revision("ws-a");
        assert!(cache.get("ws-a", false, "main").is_none());
        assert!(cache.get("ws-b", false, "main").is_some());
    }

    #[test]
    fn clear_drops_entry_and_revision() {
        let cache = FileTreeCache::new();
        let captured = cache.current_revision("ws-1");
        cache.store("ws-1", false, "main", vec![node("a.txt")], captured);
        cache.bump_revision("ws-1");
        assert_eq!(cache.current_revision("ws-1"), 1);
        cache.clear("ws-1");
        assert!(cache.get("ws-1", false, "main").is_none());
        assert_eq!(cache.current_revision("ws-1"), 0);
    }
}
