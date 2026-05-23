//! Project bootstrap detector.
//!
//! Given a project root, returns a [`ProjectDetection`] describing
//! whether the repo already has a Mozart config dir, plus the inferred
//! setup/run command pair that the Run tab should default to.
//!
//! Probe order is hardcoded in `infer_run` per
//! docs/specs/plan-mozart-dogfood-readiness.md § P0.3:
//!
//! 1. JS workspace (pnpm-workspace.yaml | nx.json | yarn.lock | package.json)
//! 2. Cargo.toml
//! 3. pyproject.toml (poetry / uv / pip)
//! 4. go.mod
//! 5. Makefile with `setup:` or `dev:` targets
//!
//! Pure function — one `tokio::fs` call per probe. No DB writes, no
//! UI side effects. Caller decides what to do with the result.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::dto::RunConfig;

/// Result of probing a project root. Caller persists `inferred_run` into
/// `.mozart/run.json` (repo) or `project_local_config.run_json` (local DB).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetection {
    /// True if `.mozart/` already exists in the project root. When true,
    /// bootstrap reads the repo config and never writes a local row.
    pub has_mozart_dir: bool,
    /// Inferred (setup, run) script pair. May be empty if no probe matched.
    pub inferred_run: RunConfig,
    /// The toolchain that produced `inferred_run` ("pnpm", "yarn", "npm",
    /// "cargo", "poetry", "uv", "pip", "go", "make"). `None` when no probe
    /// matched — UI surfaces "unknown" + "not detected" copy in that case.
    pub package_manager: Option<String>,
}

impl ProjectDetection {
    fn empty(has_mozart_dir: bool) -> Self {
        Self {
            has_mozart_dir,
            inferred_run: RunConfig::default(),
            package_manager: None,
        }
    }
}

/// Detect project shape at `root`. Never errors — a missing or
/// unreadable manifest is reported as "no probe matched" instead.
pub async fn detect_project(root: &Path) -> ProjectDetection {
    let has_mozart_dir = is_dir(&root.join(".mozart")).await;

    if let Some(d) = probe_js(root).await {
        return d.with_mozart(has_mozart_dir);
    }
    if let Some(d) = probe_cargo(root).await {
        return d.with_mozart(has_mozart_dir);
    }
    if let Some(d) = probe_python(root).await {
        return d.with_mozart(has_mozart_dir);
    }
    if let Some(d) = probe_go(root).await {
        return d.with_mozart(has_mozart_dir);
    }
    if let Some(d) = probe_make(root).await {
        return d.with_mozart(has_mozart_dir);
    }
    ProjectDetection::empty(has_mozart_dir)
}

impl ProjectDetection {
    fn with_mozart(mut self, has: bool) -> Self {
        self.has_mozart_dir = has;
        self
    }
}

async fn probe_js(root: &Path) -> Option<ProjectDetection> {
    let pkg_json = read_opt(&root.join("package.json")).await?;

    let manager = detect_js_manager(root).await;
    let setup = format!("{manager} install");
    let run_script = pick_js_run_script(&pkg_json);
    let run = run_script
        .as_deref()
        .map(|name| format!("{manager} {name}"))
        .unwrap_or_default();

    let mut scripts = vec![("setup".to_string(), setup)];
    if !run.is_empty() {
        scripts.push(("run".to_string(), run));
    }

    Some(ProjectDetection {
        has_mozart_dir: false,
        inferred_run: RunConfig::from_pairs(scripts),
        package_manager: Some(manager.to_string()),
    })
}

async fn detect_js_manager(root: &Path) -> &'static str {
    // Order: pnpm-workspace.yaml beats lockfiles; otherwise pick by lockfile.
    if file_exists(&root.join("pnpm-workspace.yaml")).await
        || file_exists(&root.join("pnpm-lock.yaml")).await
    {
        return "pnpm";
    }
    if file_exists(&root.join("yarn.lock")).await {
        return "yarn";
    }
    if file_exists(&root.join("package-lock.json")).await {
        return "npm";
    }
    // nx.json without a lockfile → assume pnpm (Nx's monorepo default).
    if file_exists(&root.join("nx.json")).await {
        return "pnpm";
    }
    "npm"
}

/// Find the first existing script name out of (dev, start, serve, tauri).
fn pick_js_run_script(pkg_json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(pkg_json).ok()?;
    let scripts = value.get("scripts")?.as_object()?;
    for candidate in ["dev", "start", "serve", "tauri"] {
        if scripts.contains_key(candidate) {
            return Some(candidate.to_string());
        }
    }
    None
}

async fn probe_cargo(root: &Path) -> Option<ProjectDetection> {
    let cargo_toml = read_opt(&root.join("Cargo.toml")).await?;

    let mut scripts = vec![("setup".to_string(), "cargo build".to_string())];
    if has_section(&cargo_toml, "[[bin]]")
        || has_section(&cargo_toml, "[package]") && file_exists(&root.join("src/main.rs")).await
    {
        scripts.push(("run".to_string(), "cargo run".to_string()));
    }

    Some(ProjectDetection {
        has_mozart_dir: false,
        inferred_run: RunConfig::from_pairs(scripts),
        package_manager: Some("cargo".to_string()),
    })
}

async fn probe_python(root: &Path) -> Option<ProjectDetection> {
    let pyproject = read_opt(&root.join("pyproject.toml")).await;
    let has_uv_lock = file_exists(&root.join("uv.lock")).await;
    let has_requirements = file_exists(&root.join("requirements.txt")).await;

    let (setup, manager) = if pyproject
        .as_deref()
        .is_some_and(|s| has_section(s, "[tool.poetry]"))
    {
        ("poetry install".to_string(), "poetry")
    } else if has_uv_lock {
        ("uv sync".to_string(), "uv")
    } else if has_requirements {
        (
            "pip install -r requirements.txt".to_string(),
            "pip",
        )
    } else if pyproject.is_some() {
        // pyproject.toml present without a known build backend — pip install .
        ("pip install .".to_string(), "pip")
    } else {
        return None;
    };

    Some(ProjectDetection {
        has_mozart_dir: false,
        inferred_run: RunConfig::from_pairs([("setup", setup.as_str())]),
        package_manager: Some(manager.to_string()),
    })
}

async fn probe_go(root: &Path) -> Option<ProjectDetection> {
    if !file_exists(&root.join("go.mod")).await {
        return None;
    }
    Some(ProjectDetection {
        has_mozart_dir: false,
        inferred_run: RunConfig::from_pairs([
            ("setup", "go mod download"),
            ("run", "go run ."),
        ]),
        package_manager: Some("go".to_string()),
    })
}

async fn probe_make(root: &Path) -> Option<ProjectDetection> {
    let body = read_opt(&root.join("Makefile")).await?;
    let has_setup = has_make_target(&body, "setup");
    let has_dev = has_make_target(&body, "dev");
    if !has_setup && !has_dev {
        return None;
    }

    let mut scripts = Vec::new();
    if has_setup {
        scripts.push(("setup".to_string(), "make setup".to_string()));
    }
    if has_dev {
        scripts.push(("run".to_string(), "make dev".to_string()));
    }

    Some(ProjectDetection {
        has_mozart_dir: false,
        inferred_run: RunConfig::from_pairs(scripts),
        package_manager: Some("make".to_string()),
    })
}

fn has_make_target(makefile: &str, target: &str) -> bool {
    // Crude but sufficient: any line that *starts* with "<target>:" (not
    // ".PHONY: <target>" or similar). Indented lines are recipe bodies.
    let needle_colon = format!("{target}:");
    let needle_space = format!("{target} :");
    makefile.lines().any(|line| {
        let trimmed = line.trim_start_matches(['\t', ' ']);
        if line.starts_with(['\t', ' ']) && trimmed != line.trim_start() {
            return false;
        }
        trimmed.starts_with(&needle_colon) || trimmed.starts_with(&needle_space)
    })
}

async fn is_dir(path: &Path) -> bool {
    tokio::fs::metadata(path)
        .await
        .map(|m| m.is_dir())
        .unwrap_or(false)
}

async fn file_exists(path: &Path) -> bool {
    tokio::fs::metadata(path)
        .await
        .map(|m| m.is_file())
        .unwrap_or(false)
}

async fn read_opt(path: &Path) -> Option<String> {
    tokio::fs::read_to_string(path).await.ok()
}

/// Cheap substring check for a TOML section header. `[[bin]]` is a
/// "section header"; we ignore comments and partial-match noise by
/// requiring the header sits at a line start.
fn has_section(toml: &str, header: &str) -> bool {
    toml.lines().any(|line| line.trim_start().starts_with(header))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use tokio::fs;

    async fn write(dir: &Path, name: &str, body: &str) {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await.unwrap();
        }
        fs::write(path, body).await.unwrap();
    }

    #[tokio::test]
    async fn probe_pnpm_with_dev_script() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "pnpm-workspace.yaml", "packages:\n  - apps/*\n").await;
        write(
            tmp.path(),
            "package.json",
            r#"{ "name": "x", "scripts": { "dev": "vite", "build": "vite build" } }"#,
        )
        .await;

        let d = detect_project(tmp.path()).await;
        assert!(!d.has_mozart_dir);
        assert_eq!(d.package_manager.as_deref(), Some("pnpm"));
        assert_eq!(
            d.inferred_run.scripts,
            vec![
                ("setup".to_string(), "pnpm install".to_string()),
                ("run".to_string(), "pnpm dev".to_string()),
            ]
        );
    }

    #[tokio::test]
    async fn probe_yarn_falls_back_to_start_then_serve() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "yarn.lock", "").await;
        write(
            tmp.path(),
            "package.json",
            r#"{ "scripts": { "build": "tsc", "serve": "node ." } }"#,
        )
        .await;

        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("yarn"));
        assert_eq!(d.inferred_run.get("run"), Some("yarn serve"));
        assert_eq!(d.inferred_run.get("setup"), Some("yarn install"));
    }

    #[tokio::test]
    async fn probe_npm_with_no_run_script() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "package-lock.json", "{}").await;
        write(
            tmp.path(),
            "package.json",
            r#"{ "scripts": { "test": "jest" } }"#,
        )
        .await;

        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("npm"));
        assert_eq!(d.inferred_run.get("setup"), Some("npm install"));
        assert_eq!(d.inferred_run.get("run"), None);
    }

    #[tokio::test]
    async fn probe_cargo_with_bin_section() {
        let tmp = TempDir::new().unwrap();
        write(
            tmp.path(),
            "Cargo.toml",
            "[package]\nname = \"x\"\n\n[[bin]]\nname = \"x\"\npath = \"src/main.rs\"\n",
        )
        .await;

        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("cargo"));
        assert_eq!(d.inferred_run.get("setup"), Some("cargo build"));
        assert_eq!(d.inferred_run.get("run"), Some("cargo run"));
    }

    #[tokio::test]
    async fn probe_cargo_lib_only_omits_run() {
        let tmp = TempDir::new().unwrap();
        write(
            tmp.path(),
            "Cargo.toml",
            "[package]\nname = \"x\"\n\n[lib]\nname = \"x\"\n",
        )
        .await;

        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("cargo"));
        assert_eq!(d.inferred_run.get("setup"), Some("cargo build"));
        assert_eq!(d.inferred_run.get("run"), None);
    }

    #[tokio::test]
    async fn probe_python_poetry() {
        let tmp = TempDir::new().unwrap();
        write(
            tmp.path(),
            "pyproject.toml",
            "[tool.poetry]\nname = \"x\"\n",
        )
        .await;

        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("poetry"));
        assert_eq!(d.inferred_run.get("setup"), Some("poetry install"));
        assert_eq!(d.inferred_run.get("run"), None);
    }

    #[tokio::test]
    async fn probe_python_uv() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "pyproject.toml", "[project]\nname = \"x\"\n").await;
        write(tmp.path(), "uv.lock", "").await;

        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("uv"));
        assert_eq!(d.inferred_run.get("setup"), Some("uv sync"));
    }

    #[tokio::test]
    async fn probe_python_pip_requirements() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "requirements.txt", "flask==2.0.0\n").await;

        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("pip"));
        assert_eq!(
            d.inferred_run.get("setup"),
            Some("pip install -r requirements.txt")
        );
    }

    #[tokio::test]
    async fn probe_go() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "go.mod", "module example.com/x\n\ngo 1.21\n").await;

        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("go"));
        assert_eq!(d.inferred_run.get("setup"), Some("go mod download"));
        assert_eq!(d.inferred_run.get("run"), Some("go run ."));
    }

    #[tokio::test]
    async fn probe_make_with_setup_and_dev() {
        let tmp = TempDir::new().unwrap();
        write(
            tmp.path(),
            "Makefile",
            "setup:\n\tpip install -r requirements.txt\n\ndev:\n\tpython app.py\n",
        )
        .await;

        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("make"));
        assert_eq!(d.inferred_run.get("setup"), Some("make setup"));
        assert_eq!(d.inferred_run.get("run"), Some("make dev"));
    }

    #[tokio::test]
    async fn no_probe_matches_returns_empty() {
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "README.md", "# hi").await;

        let d = detect_project(tmp.path()).await;
        assert!(!d.has_mozart_dir);
        assert_eq!(d.package_manager, None);
        assert!(d.inferred_run.scripts.is_empty());
    }

    #[tokio::test]
    async fn detects_existing_mozart_dir() {
        let tmp = TempDir::new().unwrap();
        fs::create_dir_all(tmp.path().join(".mozart")).await.unwrap();
        write(tmp.path(), "go.mod", "module x\n").await;

        let d = detect_project(tmp.path()).await;
        assert!(d.has_mozart_dir);
        // Inference still runs — has_mozart_dir doesn't short-circuit probing.
        assert_eq!(d.package_manager.as_deref(), Some("go"));
    }

    /// Manual checkpoint for atom R0.3.B — points at a real
    /// `mozart-go` checkout. `#[ignore]` keeps it out of CI; run with
    /// `cargo test -- --ignored mozart_go_checkpoint`.
    #[tokio::test]
    #[ignore]
    async fn mozart_go_checkpoint() {
        let mozart_go = Path::new(
            "/home/timothy/accelerate_growth_with/mozart-project/mozart-go",
        );
        if !mozart_go.is_dir() {
            eprintln!("mozart-go not present, skipping");
            return;
        }
        let d = detect_project(mozart_go).await;
        eprintln!("mozart-go detection: {d:#?}");
        assert!(!d.has_mozart_dir);
        assert_eq!(d.package_manager.as_deref(), Some("pnpm"));
        assert_eq!(d.inferred_run.get("setup"), Some("pnpm install"));
        assert_eq!(d.inferred_run.get("run"), Some("pnpm dev"));
    }

    #[tokio::test]
    async fn pnpm_workspace_beats_yarn_lock() {
        // Belt-and-braces: a repo carrying both pnpm-workspace.yaml AND a
        // stray yarn.lock should be classified as pnpm.
        let tmp = TempDir::new().unwrap();
        write(tmp.path(), "pnpm-workspace.yaml", "packages:\n").await;
        write(tmp.path(), "yarn.lock", "").await;
        write(
            tmp.path(),
            "package.json",
            r#"{ "scripts": { "dev": "vite" } }"#,
        )
        .await;
        let d = detect_project(tmp.path()).await;
        assert_eq!(d.package_manager.as_deref(), Some("pnpm"));
    }
}
