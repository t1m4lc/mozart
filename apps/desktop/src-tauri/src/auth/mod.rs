//! Auth module — owns the OS bridge between the `mozart://` URL
//! scheme and the Angular `AuthFacade`.
//!
//! Atom 2 scope : register `mozart://` via `tauri-plugin-deep-link`
//! and emit a typed `DeepLinkReceived` event when the OS hands us a
//! URL. Atom 3 will add Stronghold-backed token storage commands ;
//! Atom 4 wires `tauri-plugin-shell` for the browser launch.

use serde::{Deserialize, Serialize};

pub mod deep_link;

/// Typed event fired when the OS hands a `mozart://...` URL to the
/// running desktop app. The Angular `tauriAuthAdapter` listens via
/// `events.deepLinkReceived.listen(...)`. Extracting `token` and
/// `state` from the URL is the TS side's responsibility (pure
/// `parseDeepLink` helper) — the Rust side stays vocabulary-thin.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type, tauri_specta::Event)]
pub struct DeepLinkReceived {
    pub url: String,
}
