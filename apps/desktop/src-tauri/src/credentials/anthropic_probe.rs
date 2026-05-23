//! Lightweight connection probe for the Anthropic API key.
//!
//! A single `GET /v1/models` with the candidate key in the `x-api-key`
//! header. Cheap (no tokens spent) and discriminating:
//!
//! - 2xx                → `Connected`
//! - 401 / 403          → `Invalid`
//! - any other outcome  → `NetworkError` (5xx, DNS, TLS, timeout, etc.)
//!
//! The key is borrowed by reference, copied at most once into the request
//! header, and never appears in any log or error string. The internal
//! `reqwest::Error` is discarded — only its *category* (via match arms)
//! steers the result.

use std::time::Duration;

use reqwest::Client;
use serde::Serialize;

const ANTHROPIC_VERSION: &str = "2023-06-01";
const PROBE_URL: &str = "https://api.anthropic.com/v1/models";
const REACHABILITY_URL: &str = "https://api.anthropic.com/";
const TIMEOUT: Duration = Duration::from_secs(10);
const REACHABILITY_TIMEOUT: Duration = Duration::from_secs(5);

/// Outcome of a probe call. Sent to the frontend via tauri-specta as a
/// tagged TS union `{ kind: 'connected' | 'invalid' | 'network_error' }`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProbeResult {
    Connected,
    Invalid,
    NetworkError,
}

/// Probe `key` against Anthropic. Pure function — no side effects, no
/// persistence. Always resolves (never panics, never propagates errors).
pub async fn probe(key: &str) -> ProbeResult {
    let Ok(client) = Client::builder().timeout(TIMEOUT).build() else {
        return ProbeResult::NetworkError;
    };

    let resp = client
        .get(PROBE_URL)
        .header("x-api-key", key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .send()
        .await;

    match resp {
        Ok(r) => {
            let status = r.status();
            if status.is_success() {
                ProbeResult::Connected
            } else if matches!(status.as_u16(), 401 | 403) {
                ProbeResult::Invalid
            } else {
                ProbeResult::NetworkError
            }
        }
        // 5xx never reaches here (those are Ok with non-2xx status).
        // This arm covers DNS, TLS, timeout, connection refused, etc.
        Err(_) => ProbeResult::NetworkError,
    }
}

/// Keyless reachability probe used by the connectivity indicator. Issues a
/// HEAD on the API root and treats any HTTP response (including 4xx) as
/// reachable — only DNS / TLS / timeout / connection-refused returns false.
///
/// Lives in Rust on purpose : the previous in-browser `fetch` would log a
/// noisy "Failed to load resource: 404" in DevTools because the browser
/// surfaces the wire status even under `no-cors`. reqwest doesn't.
pub async fn probe_reachability() -> bool {
    let Ok(client) = Client::builder().timeout(REACHABILITY_TIMEOUT).build() else {
        return false;
    };
    client.head(REACHABILITY_URL).send().await.is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Returns true iff `api.anthropic.com` is resolvable from this host.
    /// Used to gate network-bound tests so offline CI doesn't fail.
    async fn anthropic_reachable() -> bool {
        let Ok(client) = Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
        else {
            return false;
        };
        // Cheap HEAD on the root — we only care that the host resolves
        // and that TLS completes, not the status code.
        client.head("https://api.anthropic.com/").send().await.is_ok()
    }

    #[tokio::test]
    async fn probe_with_garbage_key_returns_invalid_or_network() {
        if !anthropic_reachable().await {
            eprintln!("SKIP probe_with_garbage_key: api.anthropic.com unreachable");
            return;
        }
        let result = probe("sk-ant-this-is-definitely-not-a-real-key").await;
        assert!(
            matches!(result, ProbeResult::Invalid | ProbeResult::NetworkError),
            "expected Invalid or NetworkError, got {result:?}"
        );
    }

    #[test]
    fn probe_result_serializes_as_tagged_union() {
        // Lock the wire shape: tauri-specta consumers depend on this.
        let connected = serde_json::to_value(ProbeResult::Connected).unwrap();
        assert_eq!(connected, serde_json::json!({ "kind": "connected" }));
        let invalid = serde_json::to_value(ProbeResult::Invalid).unwrap();
        assert_eq!(invalid, serde_json::json!({ "kind": "invalid" }));
        let net = serde_json::to_value(ProbeResult::NetworkError).unwrap();
        assert_eq!(net, serde_json::json!({ "kind": "network_error" }));
    }
}
