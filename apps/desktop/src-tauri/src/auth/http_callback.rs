//! Localhost HTTP callback server — alternative transport for the
//! browser → desktop sign-in handoff.
//!
//! ## Why
//!
//! The `mozart://` URL scheme handoff is unreliable from browsers on
//! Linux (Chrome native, Firefox via Mozilla PPA both silently drop the
//! launch even though their console logs report "Launched external
//! handler"). `xdg-open` and `gio open` from a terminal both reach the
//! running Mozart instance correctly, so the OS-level deep-link plugin
//! is solid — only the browser → OS path breaks.
//!
//! ## How
//!
//! At desktop boot, Tauri binds a tiny axum server to a free port on
//! `127.0.0.1`. The port is exposed to the TS layer via the
//! `auth_get_callback_port` command, embedded into the apps/web
//! sign-in URL (`?state=…&port=…`), and replayed by the apps/web
//! `Launch Mozart desktop` button when it `fetch()`-es the callback.
//!
//! On a valid `GET /auth?token=…&state=…`, the handler synthesizes a
//! `mozart://auth?...` URL and emits it through the same
//! [`DeepLinkReceived`] event the deep-link plugin uses. The TS-side
//! adapter and facade flow is identical regardless of transport.
//!
//! Both transports coexist : the OS scheme handler is still wired
//! (works fine on macOS / Windows and as a CLI testing channel on
//! Linux via `xdg-open`), and the HTTP path is the primary route for
//! browser-launched sign-ins on every OS.
//!
//! ## Security
//!
//! - Binds `127.0.0.1` strictly — never `0.0.0.0`. Remote processes
//!   on the LAN cannot reach the server.
//! - CORS allow-list locked to the apps/web origins. Any other web
//!   origin's preflight is rejected by the layer before we route.
//! - The state nonce is the actual authentication boundary. The
//!   TS-side facade validates the incoming `state` against the
//!   pending nonce ; a local process that didn't observe the browser
//!   URL has no path to guess the 256-bit value.

use std::net::TcpListener;

use axum::{
    extract::{Query, State},
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::json;
use tauri::AppHandle;
use tauri_specta::Event;
use tower_http::cors::CorsLayer;

use super::DeepLinkReceived;

/// Tauri-managed state holding the bound port. Surfaced through the
/// `auth_get_callback_port` command so the TS layer can embed it in
/// the apps/web sign-in URL. `0` means the server failed to bind —
/// the apps/web fetch will then fail and surface the "Mozart isn't
/// running" UI, which is the correct user-facing behavior.
pub struct CallbackPort(pub u16);

#[derive(Debug, Deserialize)]
struct AuthQuery {
    token: String,
    state: String,
}

/// Start the callback server on a random free port. The server runs
/// for the lifetime of the desktop process. Returns the bound port
/// (or `0` on bind failure — logged, not panicked, so a degraded
/// desktop boot path stays survivable).
pub fn start_server(app: AppHandle) -> u16 {
    let listener = match TcpListener::bind("127.0.0.1:0") {
        Ok(l) => l,
        Err(e) => {
            log::error!("[auth] callback bind failed: {e}");
            return 0;
        }
    };
    let port = match listener.local_addr() {
        Ok(addr) => addr.port(),
        Err(e) => {
            log::error!("[auth] callback local_addr failed: {e}");
            return 0;
        }
    };
    if let Err(e) = listener.set_nonblocking(true) {
        log::error!("[auth] callback set_nonblocking failed: {e}");
        return 0;
    }

    log::info!("[auth] callback server listening on 127.0.0.1:{port}");

    // CORS allow-list : every origin apps/web can run from. HTTP +
    // HTTPS dev variants and the prod hostname. Browsers from any
    // other origin's preflight will get a 403 — the GET handler is
    // never reached.
    let cors = CorsLayer::new()
        .allow_origin([
            "https://localhost:4201".parse::<HeaderValue>().unwrap(),
            "http://localhost:4201".parse::<HeaderValue>().unwrap(),
            "https://app.mozart.build".parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([Method::GET]);

    let router = Router::new()
        .route("/auth", get(handle_auth))
        .layer(cors)
        .with_state(app);

    tauri::async_runtime::spawn(async move {
        let tokio_listener = match tokio::net::TcpListener::from_std(listener) {
            Ok(l) => l,
            Err(e) => {
                log::error!("[auth] callback tokio wrap failed: {e}");
                return;
            }
        };
        if let Err(e) = axum::serve(tokio_listener, router).await {
            log::error!("[auth] callback server stopped: {e}");
        }
    });

    port
}

/// `GET /auth?token=…&state=…` — the only route this server serves.
/// Synthesizes a `mozart://auth?…` URL and re-emits it through the
/// same channel the OS-level deep-link plugin uses, so the TS adapter
/// stays transport-agnostic.
async fn handle_auth(
    State(app): State<AppHandle>,
    Query(params): Query<AuthQuery>,
) -> impl IntoResponse {
    if params.token.is_empty() || params.state.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "ok": false, "error": "missing token or state" })),
        );
    }

    let synthesized = format!(
        "mozart://auth?token={}&state={}",
        percent_encode(&params.token),
        percent_encode(&params.state),
    );

    if let Err(e) = (DeepLinkReceived { url: synthesized }).emit(&app) {
        log::warn!("[auth] callback emit failed: {e}");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "ok": false, "error": "emit failed" })),
        );
    }

    log::info!("[auth] callback received valid token, emitted DeepLinkReceived");
    (StatusCode::OK, Json(json!({ "ok": true })))
}

/// RFC 3986 unreserved-chars-only percent encoding for query values.
/// Defense-in-depth : legitimate inputs (base64url JWTs, hex state
/// nonces) only use unreserved chars, but malformed input could
/// otherwise inject extra query separators.
fn percent_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(byte as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{byte:02X}"));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::percent_encode;

    #[test]
    fn unreserved_passthrough() {
        assert_eq!(percent_encode("abcXYZ012-._~"), "abcXYZ012-._~");
    }

    #[test]
    fn reserved_chars_encoded() {
        assert_eq!(percent_encode("&"), "%26");
        assert_eq!(percent_encode(" "), "%20");
        assert_eq!(percent_encode("a&b=c"), "a%26b%3Dc");
    }

    #[test]
    fn jwt_shape_survives() {
        let jwt = "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ1MSJ9.MOCK";
        assert_eq!(percent_encode(jwt), jwt);
    }
}
