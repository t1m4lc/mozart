//! In-memory map of live FS-watcher handles keyed by `workspace_id`.
//! Used by `watch_repository_tree` to replace any prior watcher for the
//! same workspace (so tab toggles or workspace switches don't leak inotify
//! handles). Mirrors the shape of `run_registry::RunRegistry`.
//!
//! The handle wraps a `notify-debouncer-mini::Debouncer<RecommendedWatcher>`.
//! Dropping the handle (via `register` overwrite or `cancel`) drops the
//! debouncer, which signals its background thread to shut down and
//! releases the underlying notify watcher (inotify on Linux, FSEvents on
//! macOS, ReadDirectoryChangesW on Windows).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use notify::RecommendedWatcher;
use notify_debouncer_mini::Debouncer;

/// Owns the debouncer for one workspace's watcher. Drop = stop.
pub struct WatcherHandle {
    _debouncer: Debouncer<RecommendedWatcher>,
}

impl WatcherHandle {
    pub fn new(debouncer: Debouncer<RecommendedWatcher>) -> Self {
        Self {
            _debouncer: debouncer,
        }
    }
}

pub struct FileWatcherRegistry(Arc<Mutex<HashMap<String, WatcherHandle>>>);

impl FileWatcherRegistry {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }

    /// Insert (or replace) the handle for `workspace_id`. Replacing
    /// drops the previous handle, which stops its watcher.
    pub fn register(&self, workspace_id: String, handle: WatcherHandle) {
        let mut g = self.0.lock().expect("registry poisoned");
        g.insert(workspace_id, handle);
    }

    /// Drop the handle for `workspace_id`, stopping its watcher. No-op
    /// if no entry exists.
    pub fn cancel(&self, workspace_id: &str) {
        let mut g = self.0.lock().expect("registry poisoned");
        g.remove(workspace_id);
    }
}

impl Default for FileWatcherRegistry {
    fn default() -> Self {
        Self::new()
    }
}
