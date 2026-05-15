//! Minimal GitHub REST integration for Phase 4f.
//!
//! Two responsibilities:
//! 1. Token validation (`probe_token`) — GET /user with the token; on
//!    200 returns the login. Used by `connect_github` so the UI can
//!    confirm the token is valid before storing it.
//! 2. PR creation (`create_pr`) — POST /repos/{owner}/{repo}/pulls.
//!    Returns the new PR's html_url which the UI surfaces as a toast.
//!
//! Branch-side `git push` is owned by `commands::push_workspace_branch`
//! (uses the local `git` binary; no need for a libgit2 dep).

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::AppError;

const USER_AGENT: &str = "mozart-desktop";

/// Result of a `GET /user` probe with the candidate token.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GithubProbeResult {
    Ok { login: String },
    Unauthorized,
    Network { message: String },
}

#[derive(Debug, Deserialize)]
struct UserPayload {
    login: String,
}

pub async fn probe_token(token: &str) -> GithubProbeResult {
    let client = match reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
    {
        Ok(c) => c,
        Err(e) => return GithubProbeResult::Network { message: e.to_string() },
    };
    match client
        .get("https://api.github.com/user")
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
    {
        Ok(resp) => match resp.status().as_u16() {
            200 => match resp.json::<UserPayload>().await {
                Ok(u) => GithubProbeResult::Ok { login: u.login },
                Err(e) => GithubProbeResult::Network { message: e.to_string() },
            },
            401 | 403 => GithubProbeResult::Unauthorized,
            other => GithubProbeResult::Network {
                message: format!("HTTP {other}"),
            },
        },
        Err(e) => GithubProbeResult::Network { message: e.to_string() },
    }
}

/// Outcome of `POST /repos/{owner}/{repo}/pulls`.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct CreatedPr {
    pub number: i64,
    pub html_url: String,
}

#[derive(Debug, Deserialize)]
struct PrResponse {
    number: i64,
    html_url: String,
}

#[derive(Debug, Deserialize)]
struct ApiError {
    message: String,
}

pub async fn create_pr(
    token: &str,
    owner: &str,
    repo: &str,
    head: &str,
    base: &str,
    title: &str,
    body: &str,
    draft: bool,
) -> Result<CreatedPr, AppError> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| AppError::Io(format!("github client: {e}")))?;
    let url = format!("https://api.github.com/repos/{owner}/{repo}/pulls");
    let payload = serde_json::json!({
        "title": title,
        "head": head,
        "base": base,
        "body": body,
        "draft": draft,
    });
    let resp = client
        .post(&url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| AppError::Io(format!("github request: {e}")))?;
    let status = resp.status();
    if status.is_success() {
        let parsed: PrResponse = resp.json().await.map_err(|e| {
            AppError::Io(format!("github response parse: {e}"))
        })?;
        return Ok(CreatedPr {
            number: parsed.number,
            html_url: parsed.html_url,
        });
    }
    let message = match resp.json::<ApiError>().await {
        Ok(api) => api.message,
        Err(_) => format!("HTTP {}", status.as_u16()),
    };
    Err(AppError::Validation(format!("github: {message}")))
}

/// Parse `git remote get-url origin` output to `(owner, repo)`.
/// Accepts both SSH (`git@github.com:owner/repo.git`) and HTTPS
/// (`https://github.com/owner/repo.git` or `.../owner/repo`) forms.
pub fn parse_github_remote(remote_url: &str) -> Option<(String, String)> {
    let trimmed = remote_url.trim();
    let without_scheme = if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("http://github.com/") {
        rest
    } else if let Some(rest) = trimmed.strip_prefix("ssh://git@github.com/") {
        rest
    } else {
        return None;
    };
    let without_suffix = without_scheme.strip_suffix(".git").unwrap_or(without_scheme);
    let mut parts = without_suffix.splitn(2, '/');
    let owner = parts.next()?.to_string();
    let repo = parts.next()?.to_string();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner, repo))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_remote_https() {
        assert_eq!(
            parse_github_remote("https://github.com/anthropics/anthropic-sdk-python"),
            Some(("anthropics".into(), "anthropic-sdk-python".into()))
        );
        assert_eq!(
            parse_github_remote("https://github.com/foo/bar.git"),
            Some(("foo".into(), "bar".into()))
        );
    }

    #[test]
    fn parse_remote_ssh() {
        assert_eq!(
            parse_github_remote("git@github.com:foo/bar.git"),
            Some(("foo".into(), "bar".into()))
        );
        assert_eq!(
            parse_github_remote("ssh://git@github.com/foo/bar.git"),
            Some(("foo".into(), "bar".into()))
        );
    }

    #[test]
    fn parse_remote_rejects_non_github() {
        assert_eq!(parse_github_remote("https://gitlab.com/foo/bar"), None);
        assert_eq!(parse_github_remote(""), None);
    }
}
