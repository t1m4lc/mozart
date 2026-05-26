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

/// Base URL of the apps/web cloud app. Dev builds talk to the local
/// HTTPS dev server (proxied via apps/web/proxy.conf.json into a local
/// `wrangler pages dev` instance); release builds talk to production.
#[cfg(debug_assertions)]
const WEB_BASE_URL: &str = "https://localhost:4201";
#[cfg(not(debug_assertions))]
const WEB_BASE_URL: &str = "https://app.mozart.build";

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

/// Error surface for `create_pr`. Splits `Unauthorized` (the only
/// recoverable case — refreshable via Clerk for OAuth-acquired tokens)
/// out of the rest so the caller can retry once with a fresh token.
#[derive(Debug)]
pub enum CreatePrError {
    Unauthorized,
    Other(AppError),
}

impl From<CreatePrError> for AppError {
    fn from(e: CreatePrError) -> AppError {
        match e {
            CreatePrError::Unauthorized => AppError::Validation("github: Bad credentials".into()),
            CreatePrError::Other(inner) => inner,
        }
    }
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
) -> Result<CreatedPr, CreatePrError> {
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| CreatePrError::Other(AppError::Io(format!("github client: {e}"))))?;
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
        .map_err(|e| CreatePrError::Other(AppError::Io(format!("github request: {e}"))))?;
    let status = resp.status();
    if status.is_success() {
        let parsed: PrResponse = resp.json().await.map_err(|e| {
            CreatePrError::Other(AppError::Io(format!("github response parse: {e}")))
        })?;
        return Ok(CreatedPr {
            number: parsed.number,
            html_url: parsed.html_url,
        });
    }
    if status.as_u16() == 401 {
        return Err(CreatePrError::Unauthorized);
    }
    let message = match resp.json::<ApiError>().await {
        Ok(api) => api.message,
        Err(_) => format!("HTTP {}", status.as_u16()),
    };
    Err(CreatePrError::Other(AppError::Validation(format!(
        "github: {message}"
    ))))
}

/// Outcome of `POST {WEB_BASE_URL}/api/github/oauth-token`.
///
/// Mirrors the discriminated union returned by the Cloudflare Pages
/// Function — `kind` is always one of the four variants below. The Rust
/// side keeps the variants tight; the TS facade reshapes any of these
/// into the existing `GithubProbe` for uniform UI handling.
#[derive(Debug, Clone)]
pub enum ClerkGithubTokenResult {
    Ok { token: String, login: Option<String> },
    NotLinked,
    Unauthorized,
    ServerError { message: String },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum ClerkGithubTokenPayload {
    Ok { token: String, login: Option<String> },
    NotLinked,
    Unauthorized,
    ServerError { message: Option<String> },
}

/// Call `{WEB_BASE_URL}/api/github/oauth-token` with the user's Clerk
/// session JWT in the `Authorization` header. Returns the
/// Clerk-mediated GitHub OAuth access token (which Clerk refreshes
/// internally on each call) plus the linked GitHub login.
///
/// Used by `connect_github_via_clerk` (initial connect) and by the
/// create-PR retry path on a 401 from `api.github.com`.
pub async fn fetch_clerk_github_token(session_jwt: &str) -> ClerkGithubTokenResult {
    let mut builder = reqwest::Client::builder().user_agent(USER_AGENT);
    // Dev URL uses a self-signed cert from the Angular dev server.
    // Loopback-only — never bypassed in release builds.
    #[cfg(debug_assertions)]
    {
        builder = builder.danger_accept_invalid_certs(true);
    }
    let client = match builder.build() {
        Ok(c) => c,
        Err(e) => {
            return ClerkGithubTokenResult::ServerError {
                message: e.to_string(),
            }
        }
    };
    let url = format!("{WEB_BASE_URL}/api/github/oauth-token");
    let resp = match client
        .post(&url)
        .bearer_auth(session_jwt)
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return ClerkGithubTokenResult::ServerError {
                message: e.to_string(),
            }
        }
    };
    match resp.json::<ClerkGithubTokenPayload>().await {
        Ok(ClerkGithubTokenPayload::Ok { token, login }) => {
            ClerkGithubTokenResult::Ok { token, login }
        }
        Ok(ClerkGithubTokenPayload::NotLinked) => ClerkGithubTokenResult::NotLinked,
        Ok(ClerkGithubTokenPayload::Unauthorized) => ClerkGithubTokenResult::Unauthorized,
        Ok(ClerkGithubTokenPayload::ServerError { message }) => {
            ClerkGithubTokenResult::ServerError {
                message: message.unwrap_or_else(|| "unknown server error".into()),
            }
        }
        Err(e) => ClerkGithubTokenResult::ServerError {
            message: format!("response parse: {e}"),
        },
    }
}

/// A single repo row returned by `{WEB_BASE_URL}/api/github/repos`,
/// surfaced to the clone-repo dialog as an autocomplete option.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct ClerkGithubRepo {
    pub owner: String,
    pub name: String,
    pub full_name: String,
    pub html_url: String,
    pub clone_url: String,
    #[serde(default)]
    pub private: bool,
    #[serde(default)]
    pub default_branch: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone)]
pub enum ClerkGithubReposResult {
    Ok { repos: Vec<ClerkGithubRepo> },
    NotLinked,
    Unauthorized,
    ServerError { message: String },
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum ClerkGithubReposPayload {
    Ok { repos: Vec<ClerkGithubRepo> },
    NotLinked,
    Unauthorized,
    ServerError { message: Option<String> },
}

/// Call `{WEB_BASE_URL}/api/github/repos` with the user's Clerk session
/// JWT. Returns up to 100 repos visible to the linked GitHub account,
/// sorted by `updated` desc (newest first). Used by the clone-repo
/// dialog to populate a search-filterable list.
pub async fn fetch_clerk_github_repos(session_jwt: &str) -> ClerkGithubReposResult {
    let mut builder = reqwest::Client::builder().user_agent(USER_AGENT);
    #[cfg(debug_assertions)]
    {
        builder = builder.danger_accept_invalid_certs(true);
    }
    let client = match builder.build() {
        Ok(c) => c,
        Err(e) => {
            return ClerkGithubReposResult::ServerError {
                message: e.to_string(),
            }
        }
    };
    let url = format!("{WEB_BASE_URL}/api/github/repos");
    let resp = match client
        .post(&url)
        .bearer_auth(session_jwt)
        .header("Accept", "application/json")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return ClerkGithubReposResult::ServerError {
                message: e.to_string(),
            }
        }
    };
    match resp.json::<ClerkGithubReposPayload>().await {
        Ok(ClerkGithubReposPayload::Ok { repos }) => ClerkGithubReposResult::Ok { repos },
        Ok(ClerkGithubReposPayload::NotLinked) => ClerkGithubReposResult::NotLinked,
        Ok(ClerkGithubReposPayload::Unauthorized) => ClerkGithubReposResult::Unauthorized,
        Ok(ClerkGithubReposPayload::ServerError { message }) => {
            ClerkGithubReposResult::ServerError {
                message: message.unwrap_or_else(|| "unknown server error".into()),
            }
        }
        Err(e) => ClerkGithubReposResult::ServerError {
            message: format!("response parse: {e}"),
        },
    }
}

/// Same return shape as `fetch_clerk_github_repos`, but talks to
/// `api.github.com/user/repos` directly with whatever token the user
/// has stored (PAT or Clerk-issued OAuth token). Bypasses the Mozart
/// web backend entirely — used as the primary path for the clone
/// dialog so PAT-only users (no Clerk-linked GitHub) still get a
/// repo list, and OAuth-Clerk users can fall back to it when the
/// backend `/api/github/repos` endpoint is unreachable.
pub async fn fetch_user_repos_with_token(token: &str) -> ClerkGithubReposResult {
    #[derive(Debug, Deserialize)]
    struct GhRepoRow {
        full_name: String,
        html_url: String,
        clone_url: String,
        #[serde(default)]
        private: bool,
        #[serde(default)]
        default_branch: Option<String>,
        #[serde(default)]
        description: Option<String>,
        #[serde(default)]
        updated_at: Option<String>,
        owner: GhRepoOwner,
        name: String,
    }
    #[derive(Debug, Deserialize)]
    struct GhRepoOwner {
        login: String,
    }
    let client = match reqwest::Client::builder().user_agent(USER_AGENT).build() {
        Ok(c) => c,
        Err(e) => {
            return ClerkGithubReposResult::ServerError {
                message: format!("github client: {e}"),
            }
        }
    };
    // `affiliation=owner,collaborator,organization_member` covers the
    // three cases a developer expects to see in the picker. `per_page=100`
    // matches the cap we apply on the Mozart-backend side. `sort=updated`
    // surfaces the user's recent work first.
    let url = "https://api.github.com/user/repos\
               ?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member";
    let resp = match client
        .get(url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            return ClerkGithubReposResult::ServerError {
                message: format!("github request: {e}"),
            }
        }
    };
    let status = resp.status();
    if status == reqwest::StatusCode::UNAUTHORIZED
        || status == reqwest::StatusCode::FORBIDDEN
    {
        return ClerkGithubReposResult::Unauthorized;
    }
    if !status.is_success() {
        return ClerkGithubReposResult::ServerError {
            message: format!("github HTTP {}", status.as_u16()),
        };
    }
    match resp.json::<Vec<GhRepoRow>>().await {
        Ok(rows) => {
            let repos = rows
                .into_iter()
                .map(|r| ClerkGithubRepo {
                    owner: r.owner.login,
                    name: r.name,
                    full_name: r.full_name,
                    html_url: r.html_url,
                    clone_url: r.clone_url,
                    private: r.private,
                    default_branch: r.default_branch,
                    description: r.description,
                    updated_at: r.updated_at,
                })
                .collect();
            ClerkGithubReposResult::Ok { repos }
        }
        Err(e) => ClerkGithubReposResult::ServerError {
            message: format!("response parse: {e}"),
        },
    }
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
