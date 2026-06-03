//! Lightweight connection probe for an OpenAI API key — Codex's parallel to
//! [`crate::credentials::anthropic_probe`].
//!
//! A single `GET /v1/models` with the candidate key as a bearer token.
//! Cheap (no tokens spent) and discriminating:
//!
//! - 2xx                → `Connected`
//! - 401 / 403          → `Invalid`
//! - any other outcome  → `NetworkError` (5xx, DNS, TLS, timeout, etc.)
//!
//! Reuses the [`ProbeResult`] union so the frontend handles both providers
//! with one type. The key is borrowed by reference, copied at most once into
//! the request header, and never logged.

use std::time::Duration;

use reqwest::Client;

use crate::credentials::anthropic_probe::ProbeResult;

const PROBE_URL: &str = "https://api.openai.com/v1/models";
const TIMEOUT: Duration = Duration::from_secs(10);

/// Probe `key` against OpenAI. Pure function — no side effects, no
/// persistence. Always resolves (never panics, never propagates errors).
pub async fn probe(key: &str) -> ProbeResult {
    let Ok(client) = Client::builder().timeout(TIMEOUT).build() else {
        return ProbeResult::NetworkError;
    };

    let resp = client.get(PROBE_URL).bearer_auth(key).send().await;

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
        Err(_) => ProbeResult::NetworkError,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn openai_reachable() -> bool {
        let Ok(client) = Client::builder().timeout(Duration::from_secs(3)).build() else {
            return false;
        };
        client.head("https://api.openai.com/").send().await.is_ok()
    }

    #[tokio::test]
    async fn probe_with_garbage_key_returns_invalid_or_network() {
        if !openai_reachable().await {
            eprintln!("SKIP probe_with_garbage_key: api.openai.com unreachable");
            return;
        }
        let result = probe("sk-this-is-definitely-not-a-real-key").await;
        assert!(
            matches!(result, ProbeResult::Invalid | ProbeResult::NetworkError),
            "expected Invalid or NetworkError, got {result:?}"
        );
    }
}
