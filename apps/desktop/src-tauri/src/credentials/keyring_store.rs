//! Anthropic API key storage backed by the OS keyring (macOS Keychain,
//! Linux Secret Service, Windows Credential Manager).
//!
//! Per Step 6 policy: **no plaintext fallback**. If the OS keyring is
//! unavailable, `set_anthropic_key` returns an error and the connect
//! dialog surfaces it to the user; no SQLite write is attempted.

use keyring::Entry;

use crate::error::AppError;

const SERVICE: &str = "mozart";
const ACCOUNT_ANTHROPIC: &str = "anthropic_api_key";

fn entry() -> Result<Entry, AppError> {
    Entry::new(SERVICE, ACCOUNT_ANTHROPIC).map_err(AppError::from)
}

/// Returns `true` iff a key is currently stored. Never returns the value.
pub fn has_anthropic_key() -> Result<bool, AppError> {
    match entry()?.get_password() {
        Ok(_) => Ok(true),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(AppError::from(e)),
    }
}

/// Returns the stored key or `None` if no entry exists. Used by the runner
/// before each `claude` spawn (Step 6d) and by the refresh probe.
pub fn get_anthropic_key() -> Result<Option<String>, AppError> {
    match entry()?.get_password() {
        Ok(k) => Ok(Some(k)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(AppError::from(e)),
    }
}

/// Persist `key` in the keyring. Overwrites any existing entry.
pub fn set_anthropic_key(key: &str) -> Result<(), AppError> {
    entry()?.set_password(key).map_err(AppError::from)
}

/// Idempotent removal — `NoEntry` is treated as success.
pub fn clear_anthropic_key() -> Result<(), AppError> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(AppError::from(e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Returns true iff the local OS keyring is wired up for tests. CI
    /// containers and many headless Linux dev boxes have no Secret Service
    /// available; gating with this lets the suite stay green there.
    fn keyring_available() -> bool {
        let Ok(e) = Entry::new("mozart-test", "_availability_probe") else {
            return false;
        };
        match e.get_password() {
            Ok(_) | Err(keyring::Error::NoEntry) => true,
            Err(_) => false,
        }
    }

    /// Use a scratch entry per test so the real `anthropic_api_key` slot is
    /// untouched.
    fn scratch_entry() -> Option<Entry> {
        Entry::new("mozart-test", &format!("scratch-{}", uuid::Uuid::new_v4())).ok()
    }

    #[test]
    fn keyring_round_trip_set_then_get_then_clear() {
        if !keyring_available() {
            eprintln!("SKIP keyring_round_trip: no OS keyring backend available");
            return;
        }
        let Some(e) = scratch_entry() else {
            eprintln!("SKIP keyring_round_trip: could not create scratch entry");
            return;
        };
        e.set_password("sk-ant-test-deadbeef").expect("set");
        let got = e.get_password().expect("get");
        assert_eq!(got, "sk-ant-test-deadbeef");
        e.delete_credential().expect("delete");
        // Second delete is idempotent at our wrapper layer; raw keyring
        // returns NoEntry, our wrapper would map to Ok.
        match e.get_password() {
            Err(keyring::Error::NoEntry) => {}
            other => panic!("expected NoEntry after delete, got {other:?}"),
        }
    }

    #[test]
    fn errors_never_carry_password_bytes_via_display() {
        // Construct a BadEncoding error and verify Display does NOT include
        // the raw bytes verbatim. (Defense in depth — our `From` impl
        // already maps by variant to a fixed string.)
        let payload = b"sk-ant-leak-this-would-be-bad".to_vec();
        let err = keyring::Error::BadEncoding(payload.clone());
        let app_err: AppError = err.into();
        let rendered = format!("{app_err:?}") + &app_err.to_string();
        // Look for the distinctive substring of the password.
        assert!(
            !rendered.contains("sk-ant-leak-this-would-be-bad"),
            "AppError surface must not echo the BadEncoding payload"
        );
    }
}
