//! In-memory map of live `RunHandle`s keyed by `run_id`. Used by the
//! `stop_agent_run` command to find the supervisor for a running agent
//! and call `.cancel()`. Stale entries are harmless (cancel on a finished
//! handle is a no-op); v0.1.0-beta.1 deliberately does not evict on supervisor
//! completion (plan §3 non-goal).

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::claude_cli::RunHandle;
use crate::error::AppError;

pub struct RunRegistry(Arc<Mutex<HashMap<String, Arc<RunHandle>>>>);

impl RunRegistry {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }

    pub fn register(&self, run_id: String, handle: Arc<RunHandle>) {
        let mut g = self.0.lock().expect("registry poisoned");
        if g.contains_key(&run_id) {
            log::debug!("RunRegistry: overwriting entry for run_id={run_id}");
        }
        g.insert(run_id, handle);
    }

    /// Cancel by run_id. Missing entry → `AppError::NotFound`.
    pub async fn cancel(&self, run_id: &str) -> Result<(), AppError> {
        let handle = self
            .0
            .lock()
            .expect("registry poisoned")
            .get(run_id)
            .cloned();
        match handle {
            Some(h) => h.cancel().await,
            None => Err(AppError::NotFound(format!(
                "no live run for run_id={run_id}"
            ))),
        }
    }

    /// True if any registered run hasn't finished yet. Stale (finished)
    /// entries are ignored via `RunHandle::is_finished`, so this is an
    /// accurate "agents still running?" signal for the app-close guard.
    pub fn has_live(&self) -> bool {
        self.0
            .lock()
            .expect("registry poisoned")
            .values()
            .any(|h| !h.is_finished())
    }

    /// Cancel + tree-kill every live run. Returns how many were live.
    /// Used by the app-close handler so quitting never orphans an agent.
    pub async fn cancel_all(&self) -> usize {
        let handles: Vec<Arc<RunHandle>> = {
            let g = self.0.lock().expect("registry poisoned");
            g.values().filter(|h| !h.is_finished()).cloned().collect()
        };
        let n = handles.len();
        for h in &handles {
            let _ = h.cancel().await;
            if let Some(pid) = h.child_pid() {
                crate::claude_cli::runner::kill_process_tree(pid).await;
            }
        }
        n
    }
}

impl Default for RunRegistry {
    fn default() -> Self {
        Self::new()
    }
}
