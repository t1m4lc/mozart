//! Per-workspace handle for the project's `run_command` (Phase 4e
//! Run tab). Mirrors `terminal_registry`'s shape — a separate registry
//! keeps the keys clean (otherwise a workspace would have two PTYs
//! under the same id, one for the shell tab and one for the run tab).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::terminal::TerminalHandle;

pub struct WorkspaceRunRegistry(Arc<Mutex<HashMap<String, Arc<TerminalHandle>>>>);

impl WorkspaceRunRegistry {
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

impl Default for WorkspaceRunRegistry {
    fn default() -> Self {
        Self::new()
    }
}
