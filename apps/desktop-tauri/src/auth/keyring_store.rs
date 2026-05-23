//! Mozart auth-session storage backed by the OS keyring (macOS
//! Keychain, Linux Secret Service, Windows Credential Manager).
//!
//! Mirrors the pattern in `credentials/keyring_store.rs` (Anthropic /
//! GitHub tokens). The session is serialized as a single JSON string —
//! one keyring entry per (service, account) pair.
//!
//! Pivot context (v0.1.0-beta.1) : Phase 5 originally targeted `tauri-plugin-
//! stronghold` but the plugin's IPC bridge on Linux leaves snapshot
//! writes uncommitted (temp file never renamed to final). Using the
//! `keyring` crate matches `plan.md`'s "system keyring" decision and
//! the existing credentials pattern. The "all secrets in one vault"
//! goal from `onboarding-and-auth.md` §6 remains a post-MVP hardening
//! target — when Stronghold is stable, we can migrate the three token
//! kinds together.

use keyring::Entry;
use serde::{Deserialize, Serialize};

use crate::error::AppError;

const SERVICE: &str = "mozart";
const ACCOUNT_AUTH_SESSION: &str = "auth_session";

/// Wire shape persisted in the OS keyring (JSON-encoded). The `Date`
/// fields are normalized to epoch-ms numbers on the Angular side so the
/// JSON stays stable.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AuthSessionDto {
    pub token: String,
    /// Epoch milliseconds when the underlying Clerk JWT expires.
    pub expires_at: i64,
}

fn entry() -> Result<Entry, AppError> {
    Entry::new(SERVICE, ACCOUNT_AUTH_SESSION).map_err(AppError::from)
}

/// Load the persisted session, or `None` if the keyring entry is empty.
/// Treats malformed JSON as `None` (defensive : the caller falls back
/// to /welcome and re-auth ; we don't surface decode errors to the UI).
pub fn load_session() -> Result<Option<AuthSessionDto>, AppError> {
    match entry()?.get_password() {
        Ok(json) => match serde_json::from_str::<AuthSessionDto>(&json) {
            Ok(dto) => Ok(Some(dto)),
            Err(e) => {
                log::warn!("auth_session keyring entry malformed: {e}");
                Ok(None)
            }
        },
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

/// Persist `session` to the keyring. Overwrites any prior entry.
pub fn save_session(session: &AuthSessionDto) -> Result<(), AppError> {
    let json = serde_json::to_string(session).map_err(|e| {
        AppError::Validation(format!("session serialize failed: {e}"))
    })?;
    entry()?.set_password(&json).map_err(AppError::from)
}

/// Idempotent removal — `NoEntry` is treated as success.
pub fn clear_session() -> Result<(), AppError> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::from(e)),
    }
}
