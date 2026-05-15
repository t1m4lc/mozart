//! In-memory map of live `TerminalHandle`s keyed by `workspace_id`.
//! Mirrors `file_watcher_registry`. The registry holds `Arc<TerminalHandle>`
//! so the command layer can write/resize without keeping the registry
//! lock; dropping all `Arc`s closes the PTY (kills child + frees master).
//!
//! Replacement semantics: `register` overwrites, dropping the previous
//! handle. `cancel` removes the entry. `get` returns a clone of the
//! `Arc` if present.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::terminal::TerminalHandle;

pub struct TerminalRegistry(Arc<Mutex<HashMap<String, Arc<TerminalHandle>>>>);

impl TerminalRegistry {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }

    pub fn get(&self, workspace_id: &str) -> Option<Arc<TerminalHandle>> {
        let g = self.0.lock().expect("registry poisoned");
        g.get(workspace_id).cloned()
    }

    pub fn register(&self, workspace_id: String, handle: Arc<TerminalHandle>) {
        let mut g = self.0.lock().expect("registry poisoned");
        g.insert(workspace_id, handle);
    }

    pub fn cancel(&self, workspace_id: &str) {
        let mut g = self.0.lock().expect("registry poisoned");
        g.remove(workspace_id);
    }
}

impl Default for TerminalRegistry {
    fn default() -> Self {
        Self::new()
    }
}
