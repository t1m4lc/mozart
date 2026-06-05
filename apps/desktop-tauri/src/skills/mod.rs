//! Skill discovery for the composer slash menu.
//!
//! Discovery is scoped by **provider** (the active agent backend) and, when a
//! project is in context, by that **project's repository** — not by worktree.
//! Repo-local skills (`.mozart/skills`, `.<provider>/skills`) are committed
//! content shared across every worktree, so the repo root is the right scope.
//!
//!   global (always)   `~/.<provider>/skills`
//!   repo-local        `<repo>/.<provider>/skills`   (+ `<repo>/.mozart/skills`)
//!
//! `~/.<provider>` is user-managed (installing there is the trust act) and
//! repo-local skills are project content like any committed script, so both are
//! trusted. Global Mozart skills + a marketplace (with its own review gate) come
//! later.
//!
//! Discovery is filesystem-based because neither the Claude Code (2.1.x) nor
//! Codex (0.13x) CLI exposes a command to enumerate `SKILL.md` skills. When they
//! do, swap the relevant scan — callers are provider-blind.
//!
//! The repository PATH is resolved from a `project_id` by the command layer and
//! never crosses the IPC boundary; the frontend passes stable ids only.
//!
//! NOTE (M2): the per-provider scan roots are constructed inline here. A
//! follow-up centralizes them into one declarative `SCAN_SPECS` table so
//! provider locations stay adaptable in one editable place.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Where a skill came from. Drives the menu's group headers. Wire ids match
/// the frontend's source model. `kebab-case` → `mozart-project`, etc.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum SkillSource {
    MozartProject,
    ClaudeProvider,
    CodexProvider,
    // Future: MozartMarketplace (served by the Mozart web API).
}

/// Which agent backend a skill runs on. Drives provider-aware filtering:
/// `Any` shows under both providers; `Claude`/`Codex` only under their own.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum SkillRuntime {
    Any,
    Claude,
    Codex,
}

/// Closeness — a project skill shadows a global one with the same id.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum SkillScope {
    Project,
    Global,
}

#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Skill {
    /// Invocable id — the `/id` the user types. Frontmatter `name` if set,
    /// else the skill's directory / file stem.
    pub id: String,
    /// Human label for the menu.
    pub name: String,
    pub description: String,
    pub source: SkillSource,
    pub runtime: SkillRuntime,
    /// Sub-grouping within a source (e.g. `gstack` under Claude).
    pub publisher: Option<String>,
    pub scope: SkillScope,
    /// Optional model preference, e.g. `cheapest` — applied when the skill runs.
    pub model_hint: Option<String>,
}

/// The active agent backend the discovery is scoped to. Mirrors the frontend
/// `AgentProviderId` → runtime mapping (`codex` → Codex, everything else →
/// Claude) so an unknown/future id fails closed to Claude rather than erroring.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Claude,
    Codex,
}

impl Provider {
    pub fn from_agent_id(id: &str) -> Self {
        if id == "codex" {
            Provider::Codex
        } else {
            Provider::Claude
        }
    }

    /// `(provider source tag, runtime tag, dot-dir name)` for the scan.
    fn scan_spec(self) -> (SkillSource, SkillRuntime, &'static str) {
        match self {
            Provider::Claude => (SkillSource::ClaudeProvider, SkillRuntime::Claude, ".claude"),
            Provider::Codex => (SkillSource::CodexProvider, SkillRuntime::Codex, ".codex"),
        }
    }
}

/// The frontmatter we read from a skill markdown file. Everything optional so
/// a thin `SKILL.md` (just `name` + `description`) parses fine.
#[derive(Debug, Default, Deserialize)]
struct Frontmatter {
    name: Option<String>,
    description: Option<String>,
    /// Mozart skills may pin runtimes; provider skills ignore this (the
    /// source decides). Accepts a scalar (`any`) or a list (`[claude, codex]`).
    #[serde(default)]
    runtimes: Option<serde_yaml::Value>,
    model: Option<String>,
}

/// Split `---\n<yaml>\n---\n<body>` into parsed frontmatter + body. Returns
/// `None` when the file has no leading frontmatter block.
fn parse_frontmatter(content: &str) -> Option<(Frontmatter, String)> {
    let rest = content.strip_prefix("---")?;
    let mut yaml = String::new();
    let mut body = String::new();
    let mut in_body = false;
    // Skip the remainder of the opening `---` line, then read until the next
    // line that is exactly `---` (the closing fence).
    for line in rest.lines().skip(1) {
        if !in_body && line.trim_end() == "---" {
            in_body = true;
            continue;
        }
        if in_body {
            body.push_str(line);
            body.push('\n');
        } else {
            yaml.push_str(line);
            yaml.push('\n');
        }
    }
    if !in_body {
        return None; // no closing fence → not valid frontmatter
    }
    let fm = serde_yaml::from_str::<Frontmatter>(&yaml).unwrap_or_default();
    Some((fm, body.trim().to_string()))
}

fn mozart_runtime(fm: &Frontmatter) -> SkillRuntime {
    // Mozart skills default to agent-agnostic. A frontmatter `runtimes` of a
    // single provider narrows it; anything else (list / `any` / absent) = Any.
    match &fm.runtimes {
        Some(serde_yaml::Value::String(s)) => match s.as_str() {
            "claude" => SkillRuntime::Claude,
            "codex" => SkillRuntime::Codex,
            _ => SkillRuntime::Any,
        },
        _ => SkillRuntime::Any,
    }
}

/// Build a `Skill` from a markdown file, or `None` if unreadable.
fn skill_from_file(
    path: &Path,
    fallback_id: &str,
    source: SkillSource,
    runtime: SkillRuntime,
    publisher: Option<String>,
    scope: SkillScope,
) -> Option<Skill> {
    let content = std::fs::read_to_string(path).ok()?;
    let (fm, _body) = parse_frontmatter(&content).unwrap_or_default();
    let id = fm
        .name
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| fallback_id.to_string());
    let resolved_runtime = match source {
        SkillSource::MozartProject => mozart_runtime(&fm),
        _ => runtime,
    };
    Some(Skill {
        id: id.clone(),
        name: fm.name.unwrap_or(id),
        description: fm.description.unwrap_or_default().trim().to_string(),
        source,
        runtime: resolved_runtime,
        publisher,
        scope,
        model_hint: fm.model,
    })
}

// ── Scans ───────────────────────────────────────────────────────────────

/// Scans a `skills/` root for `<name>/SKILL.md`, and one nesting level deeper
/// (`<publisher>/<name>/SKILL.md`, e.g. gstack). Skips dot-dirs (`.system`).
fn scan_skill_root(
    root: &Path,
    source: SkillSource,
    runtime: SkillRuntime,
    scope: SkillScope,
    out: &mut Vec<Skill>,
) {
    for entry in read_dir(root) {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let name = file_stem(&dir);
        if name.starts_with('.') {
            continue;
        }
        let direct = dir.join("SKILL.md");
        if direct.is_file() {
            if let Some(s) =
                skill_from_file(&direct, &name, source, runtime, None, scope)
            {
                out.push(s);
            }
            continue;
        }
        // Publisher folder (e.g. gstack/): scan its children one level down.
        for child in read_dir(&dir) {
            let cdir = child.path();
            let cname = file_stem(&cdir);
            if !cdir.is_dir() || cname.starts_with('.') {
                continue;
            }
            let skill_md = cdir.join("SKILL.md");
            if skill_md.is_file() {
                if let Some(s) = skill_from_file(
                    &skill_md,
                    &cname,
                    source,
                    runtime,
                    Some(name.clone()),
                    scope,
                ) {
                    out.push(s);
                }
            }
        }
    }
}

/// `<repo>/.mozart/skills/*.md` — flat markdown files. Agent-agnostic unless the
/// frontmatter narrows `runtimes`. Always project scope.
fn scan_mozart_root(dir: &Path, out: &mut Vec<Skill>) {
    for entry in read_dir(dir) {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let stem = file_stem(&path);
        if let Some(skill) = skill_from_file(
            &path,
            &stem,
            SkillSource::MozartProject,
            SkillRuntime::Any,
            None,
            SkillScope::Project,
        ) {
            out.push(skill);
        }
    }
}

// ── Orchestrator ────────────────────────────────────────────────────────

/// Discover the skills visible to `provider`, scoped to `repo` when a project
/// is in context. Always includes the provider's global skills; adds the repo's
/// provider-local and Mozart skills when `repo` is `Some`. A project-scoped
/// skill shadows a global one with the same (source, id).
pub fn discover(provider: Provider, repo: Option<&Path>) -> Vec<Skill> {
    discover_in(provider, &home_dir(), repo)
}

/// `discover` with the home dir injected. Split out so tests can point the
/// global-skills root at a fixture without mutating the process-global `HOME`
/// (which would race under cargo's parallel test runner).
fn discover_in(provider: Provider, home: &Path, repo: Option<&Path>) -> Vec<Skill> {
    let (source, runtime, dir) = provider.scan_spec();
    let mut out = Vec::new();

    // Global provider skills (user-installed = trusted), always.
    scan_skill_root(
        &home.join(dir).join("skills"),
        source,
        runtime,
        SkillScope::Global,
        &mut out,
    );

    // Repo-local skills (project content), when a project is in context.
    if let Some(repo) = repo {
        scan_skill_root(
            &repo.join(dir).join("skills"),
            source,
            runtime,
            SkillScope::Project,
            &mut out,
        );
        scan_mozart_root(&repo.join(".mozart").join("skills"), &mut out);
    }

    dedup_project_over_global(out)
}

fn dedup_project_over_global(skills: Vec<Skill>) -> Vec<Skill> {
    // Index of the kept skill per (source, id). Project scope replaces global.
    let mut out: Vec<Skill> = Vec::with_capacity(skills.len());
    for skill in skills {
        if let Some(existing) = out
            .iter_mut()
            .find(|s| s.source == skill.source && s.id == skill.id)
        {
            if skill.scope == SkillScope::Project {
                *existing = skill;
            }
        } else {
            out.push(skill);
        }
    }
    out
}

// ── Small fs helpers ────────────────────────────────────────────────────

fn read_dir(dir: &Path) -> Vec<std::fs::DirEntry> {
    match std::fs::read_dir(dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(_) => Vec::new(),
    }
}

fn file_stem(path: &Path) -> String {
    path.file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn home_dir() -> PathBuf {
    if let Ok(home) = std::env::var("HOME") {
        if !home.is_empty() {
            return PathBuf::from(home);
        }
    }
    if let Ok(profile) = std::env::var("USERPROFILE") {
        if !profile.is_empty() {
            return PathBuf::from(profile);
        }
    }
    PathBuf::from(".")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write(path: &Path, contents: &str) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, contents).unwrap();
    }

    #[test]
    fn parses_frontmatter_and_body() {
        let (fm, body) =
            parse_frontmatter("---\nname: Commit\ndescription: do it\n---\nbody here\n")
                .expect("frontmatter");
        assert_eq!(fm.name.as_deref(), Some("Commit"));
        assert_eq!(fm.description.as_deref(), Some("do it"));
        assert_eq!(body, "body here");
    }

    #[test]
    fn no_frontmatter_returns_none() {
        assert!(parse_frontmatter("# just a heading\n").is_none());
    }

    #[test]
    fn from_agent_id_maps_codex_else_claude() {
        assert_eq!(Provider::from_agent_id("codex"), Provider::Codex);
        assert_eq!(Provider::from_agent_id("claude"), Provider::Claude);
        assert_eq!(Provider::from_agent_id("anthropic"), Provider::Claude);
        assert_eq!(Provider::from_agent_id(""), Provider::Claude);
    }

    #[test]
    fn mozart_skills_are_agnostic_and_project_scoped() {
        let tmp = tempdir();
        write(
            &tmp.join(".mozart/skills/commit.md"),
            "---\nname: commit\ndescription: conventional commit\nmodel: cheapest\n---\nbody",
        );
        let mut out = Vec::new();
        scan_mozart_root(&tmp.join(".mozart/skills"), &mut out);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "commit");
        assert!(matches!(out[0].source, SkillSource::MozartProject));
        assert!(matches!(out[0].runtime, SkillRuntime::Any));
        assert_eq!(out[0].model_hint.as_deref(), Some("cheapest"));
        cleanup(&tmp);
    }

    #[test]
    fn discover_scopes_to_provider_and_includes_global_plus_repo() {
        let tmp = tempdir();
        let home = tmp.join("home");
        let repo = tmp.join("repo");
        // Global Claude + Codex skills.
        write(&home.join(".claude/skills/review/SKILL.md"), "---\nname: review\ndescription: r\n---\n");
        write(&home.join(".codex/skills/codex-review/SKILL.md"), "---\nname: codex-review\ndescription: c\n---\n");
        // Global Claude publisher nesting + a dot-dir that must be skipped.
        write(&home.join(".claude/skills/gstack/ship/SKILL.md"), "---\nname: ship\ndescription: s\n---\n");
        write(&home.join(".claude/skills/.system/secret/SKILL.md"), "---\nname: secret\ndescription: x\n---\n");
        // Repo-local Mozart + Claude skills.
        write(&repo.join(".mozart/skills/commit.md"), "---\nname: commit\ndescription: cc\n---\n");
        write(&repo.join(".claude/skills/local/SKILL.md"), "---\nname: local\ndescription: l\n---\n");

        let out = discover_in(Provider::Claude, &home, Some(&repo));
        let ids: Vec<_> = out.iter().map(|s| s.id.as_str()).collect();
        assert!(ids.contains(&"review"), "global claude skill");
        assert!(ids.contains(&"ship"), "publisher-nested claude skill");
        assert!(ids.contains(&"commit"), "repo mozart skill");
        assert!(ids.contains(&"local"), "repo-local claude skill");
        assert!(!ids.contains(&"secret"), "dot-dirs skipped");
        assert!(!ids.contains(&"codex-review"), "codex hidden under claude");

        let ship = out.iter().find(|s| s.id == "ship").unwrap();
        assert_eq!(ship.publisher.as_deref(), Some("gstack"));
        assert!(matches!(ship.runtime, SkillRuntime::Claude));
        cleanup(&tmp);
    }

    #[test]
    fn discover_without_repo_returns_only_globals() {
        let tmp = tempdir();
        let home = tmp.join("home");
        write(&home.join(".codex/skills/codex-review/SKILL.md"), "---\nname: codex-review\ndescription: c\n---\n");

        let out = discover_in(Provider::Codex, &home, None);
        let ids: Vec<_> = out.iter().map(|s| s.id.as_str()).collect();
        assert_eq!(ids, vec!["codex-review"]);
        cleanup(&tmp);
    }

    #[test]
    fn project_skill_shadows_global_same_source_and_id() {
        let global = Skill {
            id: "review".into(), name: "g".into(), description: "global".into(),
            source: SkillSource::ClaudeProvider, runtime: SkillRuntime::Claude,
            publisher: None, scope: SkillScope::Global, model_hint: None,
        };
        let project = Skill { description: "project".into(), scope: SkillScope::Project, ..global.clone() };
        let out = dedup_project_over_global(vec![global, project]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].description, "project");
    }

    // Minimal temp-dir helper (avoids a dev-dep on `tempfile`).
    fn tempdir() -> PathBuf {
        let p = std::env::temp_dir().join(format!(
            "mozart-skills-test-{}-{}",
            std::process::id(),
            now_nanos()
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }
    fn cleanup(p: &Path) {
        let _ = fs::remove_dir_all(p);
    }
    fn now_nanos() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    }
}
