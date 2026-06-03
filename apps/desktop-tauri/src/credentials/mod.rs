//! Anthropic credentials — OS-keyring–backed storage plus a lightweight
//! connection probe against the Anthropic API. Owned by Step 6.
//!
//! Two submodules:
//! - [`keyring_store`] wraps the `keyring` crate. The Anthropic API key is
//!   stored under `service="mozart", account="anthropic_api_key"` and never
//!   leaves the keyring except through the `connect_anthropic` command IPC
//!   path on a fresh paste, or via in-process reads (e.g. the runner) for
//!   subprocess env injection.
//! - [`anthropic_probe`] makes a single `GET /v1/models` request against the
//!   Anthropic API to classify a key as `Connected | Invalid | NetworkError`.
//!   The key is never logged and never appears in any error string.

pub mod anthropic_probe;
pub mod keyring_store;
pub mod openai_probe;
