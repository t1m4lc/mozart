//! Deep-link bridge. Wires `tauri-plugin-deep-link`'s `on_open_url`
//! callback to the typed `DeepLinkReceived` event consumed by the
//! Angular `tauriAuthAdapter`.

use tauri::AppHandle;
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_specta::Event;

use super::DeepLinkReceived;

/// Register the on-open-url handler. Called from `lib.rs::setup` after
/// the deep-link plugin is installed.
///
/// On debug builds we also force-register the `mozart://` scheme at
/// runtime (`register_all`) so deep-links work in `tauri dev` without
/// rebuilding the bundle. On release builds the bundle config
/// (`tauri.conf.json::plugins.deep-link.desktop.schemes`) handles
/// registration at install time.
pub fn register(app: &AppHandle) {
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            // Only forward our own scheme — belt-and-braces against
            // the plugin surfacing unexpected URLs.
            if url.scheme() != "mozart" {
                continue;
            }
            let payload = DeepLinkReceived {
                url: url.to_string(),
            };
            if let Err(e) = payload.emit(&handle) {
                log::warn!("DeepLinkReceived emit failed: {e}");
            }
        }
    });

    #[cfg(debug_assertions)]
    {
        // Best-effort runtime registration for `tauri dev`. Errors are
        // logged but not fatal — the OS may already have the scheme
        // registered from a previous run.
        if let Err(e) = app.deep_link().register_all() {
            log::warn!("deep_link.register_all() failed: {e}");
        }
    }
}
