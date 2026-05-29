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

/// Outcome of classifying a project's git remotes for PR creation.
/// Drives both the merge-menu gating and the create-PR dialog's
/// precise messaging — a bare boolean collapsed "no remote",
/// "non-GitHub remote", and "couldn't parse the remote" into a single
/// misleading "GitHub not found", which is exactly the bug this
/// replaces.
#[derive(Debug, Clone, Serialize, Deserialize, Type, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GithubRemoteStatus {
    /// A usable github.com remote was found. `remote_name` is the git
    /// remote it came from (`origin` is preferred when present).
    GithubRemote {
        owner: String,
        repo: String,
        remote_name: String,
    },
    /// At least one remote exists but none point at github.com.
    NonGithubRemote { url: String, remote_name: String },
    /// The repository has no remotes configured.
    NoRemote,
    /// Reading the remotes failed (git missing, not a repo, …). The UI
    /// shows the raw message rather than pretending there's no remote.
    DetectError { message: String },
}

/// Parse a single git remote URL into `(owner, repo)` iff it points at
/// github.com. Tolerant of the forms developers actually have:
///   - HTTPS:     `https://github.com/owner/repo[.git][/]`
///   - HTTPS+creds: `https://user[:token]@github.com/owner/repo.git`
///   - SCP-SSH:   `[user@]github.com:owner/repo[.git]`
///   - SSH URL:   `ssh://git@github.com[:port]/owner/repo.git`
///   - git://     `git://github.com/owner/repo.git`
/// Host match is case-insensitive and tolerates a leading `www.`.
pub fn parse_github_remote(remote_url: &str) -> Option<(String, String)> {
    let trimmed = remote_url.trim();
    if trimmed.is_empty() {
        return None;
    }
    let path = github_host_path(trimmed)?;
    // Normalize the tail: drop a trailing slash, a `.git`, then any
    // residual trailing slash (covers `repo`, `repo/`, `repo.git`,
    // `repo.git/`).
    let path = path.trim_end_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);
    let path = path.trim_end_matches('/');

    let mut parts = path.splitn(2, '/');
    let owner = parts.next()?.trim();
    let repo_rest = parts.next()?.trim();
    // Defend against deep paths (`owner/repo/extra`) — keep owner+repo.
    let repo = repo_rest.split('/').next().unwrap_or(repo_rest).trim();
    if owner.is_empty() || repo.is_empty() {
        return None;
    }
    Some((owner.to_string(), repo.to_string()))
}

/// Return the `owner/repo…` path tail iff `url`'s host is github.com.
/// Strips credentials (`user[:token]@`) and ports.
fn github_host_path(url: &str) -> Option<&str> {
    if let Some((_, after_scheme)) = url.split_once("://") {
        // scheme://[creds@]host[:port]/path
        let authority_and_path = after_scheme.rsplit_once('@').map_or(after_scheme, |(_, r)| r);
        let (authority, path) = authority_and_path.split_once('/')?;
        let host = authority.split(':').next().unwrap_or(authority);
        return is_github_host(host).then_some(path);
    }
    // scp-like: [user@]host:owner/repo  (no scheme, host/path split on ':')
    let after_user = url.rsplit_once('@').map_or(url, |(_, r)| r);
    let (host, path) = after_user.split_once(':')?;
    is_github_host(host).then_some(path)
}

fn is_github_host(host: &str) -> bool {
    let h = host.trim().to_ascii_lowercase();
    h == "github.com" || h == "www.github.com"
}

/// Pick the best remote for PR creation from `(name, url)` pairs.
/// Prefers `origin` when it's a GitHub remote, then any GitHub remote,
/// then reports a non-GitHub remote (so the UI can name it), else
/// `NoRemote`. Pure — the command layer feeds it `git remote` output.
pub fn classify_remotes(remotes: &[(String, String)]) -> GithubRemoteStatus {
    if remotes.is_empty() {
        return GithubRemoteStatus::NoRemote;
    }
    if let Some((name, url)) = remotes.iter().find(|(n, _)| n == "origin") {
        if let Some((owner, repo)) = parse_github_remote(url) {
            return GithubRemoteStatus::GithubRemote {
                owner,
                repo,
                remote_name: name.clone(),
            };
        }
    }
    for (name, url) in remotes {
        if let Some((owner, repo)) = parse_github_remote(url) {
            return GithubRemoteStatus::GithubRemote {
                owner,
                repo,
                remote_name: name.clone(),
            };
        }
    }
    // A remote exists but none are GitHub. Prefer origin's url for
    // familiarity in the message.
    let (name, url) = remotes
        .iter()
        .find(|(n, _)| n == "origin")
        .unwrap_or(&remotes[0]);
    GithubRemoteStatus::NonGithubRemote {
        url: url.clone(),
        remote_name: name.clone(),
    }
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
        // Trailing slash, and `.git/` form.
        assert_eq!(
            parse_github_remote("https://github.com/foo/bar/"),
            Some(("foo".into(), "bar".into()))
        );
        assert_eq!(
            parse_github_remote("https://github.com/foo/bar.git/"),
            Some(("foo".into(), "bar".into()))
        );
    }

    #[test]
    fn parse_remote_https_with_credentials() {
        // The original prefix-only parser rejected these, which is the
        // most common real-world "GitHub not found" trigger.
        assert_eq!(
            parse_github_remote("https://user@github.com/foo/bar.git"),
            Some(("foo".into(), "bar".into()))
        );
        assert_eq!(
            parse_github_remote("https://x-access-token:ghp_abc123@github.com/foo/bar.git"),
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
            parse_github_remote("git@github.com:foo/bar"),
            Some(("foo".into(), "bar".into()))
        );
        assert_eq!(
            parse_github_remote("ssh://git@github.com/foo/bar.git"),
            Some(("foo".into(), "bar".into()))
        );
        // SSH URL with an explicit port.
        assert_eq!(
            parse_github_remote("ssh://git@github.com:22/foo/bar.git"),
            Some(("foo".into(), "bar".into()))
        );
    }

    #[test]
    fn parse_remote_git_protocol_and_case_and_www() {
        assert_eq!(
            parse_github_remote("git://github.com/foo/bar.git"),
            Some(("foo".into(), "bar".into()))
        );
        assert_eq!(
            parse_github_remote("https://GitHub.com/Foo/Bar.git"),
            Some(("Foo".into(), "Bar".into()))
        );
        assert_eq!(
            parse_github_remote("https://www.github.com/foo/bar"),
            Some(("foo".into(), "bar".into()))
        );
    }

    #[test]
    fn parse_remote_rejects_non_github() {
        assert_eq!(parse_github_remote("https://gitlab.com/foo/bar"), None);
        assert_eq!(parse_github_remote("git@gitlab.com:foo/bar.git"), None);
        assert_eq!(parse_github_remote("https://github.example.com/foo/bar"), None);
        assert_eq!(parse_github_remote(""), None);
        assert_eq!(parse_github_remote("not a url"), None);
        // github host but missing the repo segment.
        assert_eq!(parse_github_remote("https://github.com/owner"), None);
    }

    #[test]
    fn classify_prefers_origin_then_any_github() {
        // origin is GitHub → used directly.
        let s = classify_remotes(&[
            ("origin".into(), "git@github.com:o/r.git".into()),
            ("upstream".into(), "https://github.com/up/stream.git".into()),
        ]);
        assert_eq!(
            s,
            GithubRemoteStatus::GithubRemote {
                owner: "o".into(),
                repo: "r".into(),
                remote_name: "origin".into()
            }
        );

        // origin is non-GitHub, but another remote is GitHub → fall through.
        let s = classify_remotes(&[
            ("origin".into(), "https://gitlab.com/o/r.git".into()),
            ("github".into(), "git@github.com:gh/repo.git".into()),
        ]);
        assert_eq!(
            s,
            GithubRemoteStatus::GithubRemote {
                owner: "gh".into(),
                repo: "repo".into(),
                remote_name: "github".into()
            }
        );
    }

    #[test]
    fn classify_non_github_and_no_remote() {
        let s = classify_remotes(&[("origin".into(), "https://gitlab.com/o/r.git".into())]);
        assert_eq!(
            s,
            GithubRemoteStatus::NonGithubRemote {
                url: "https://gitlab.com/o/r.git".into(),
                remote_name: "origin".into()
            }
        );
        assert_eq!(classify_remotes(&[]), GithubRemoteStatus::NoRemote);
    }
}
