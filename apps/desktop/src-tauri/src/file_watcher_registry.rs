//! In-memory map of live FS-watcher handles keyed by `workspace_id`.
//! Used by `watch_repository_tree` to replace any prior watcher for the
//! same workspace (so tab toggles or workspace switches don't leak inotify
//! handles). Mirrors the shape of `run_registry::RunRegistry`.
//!
//! Atom C registers the registry struct only. Atom E plugs
//! `notify-debouncer-mini` into `WatcherHandle` and uses `register` /
//! `cancel` from the `watch_repository_tree` command.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Opaque handle returned by `notify-debouncer-mini`. Atom E will
/// replace the marker with the real debouncer; for Atom C the registry
/// is wired but never populated.
pub struct WatcherHandle {
    /// Phantom field to keep the type non-empty until Atom E assigns
    /// the real debouncer. Drop runs when the handle is replaced or the
    /// app shuts down.
    _placeholder: (),
}

impl WatcherHandle {
    pub fn placeholder() -> Self {
        Self { _placeholder: () }
    }
}

pub struct FileWatcherRegistry(Arc<Mutex<HashMap<String, WatcherHandle>>>);

impl FileWatcherRegistry {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }

    /// Insert (or replace) the handle for `workspace_id`. Replacing
    /// drops the previous handle, which stops the underlying watcher.
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
