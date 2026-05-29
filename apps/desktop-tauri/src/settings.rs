//! Layered Mozart settings: bundled defaults ◀ global user file ◀ project file.
//!
//! [`MozartSettings::default`] is the single source of truth for the bundled
//! defaults; `docs/settings.default.json` mirrors it (a test keeps the two in
//! sync). [`resolve`] deep-merges the global file
//! ([`crate::paths::global_settings_path`]) then the project file
//! (`<repo>/.mozart/settings.json`) over those defaults — so a file only needs
//! to carry the keys it overrides.
//!
//! Any key may be overridden at the project level. The agent **sandbox level**
//! is deliberately *not* part of this schema: it stays app-controlled so a
//! cloned repo cannot widen its own sandbox.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;

/// Current settings schema version.
pub const SCHEMA_VERSION: &str = "1";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    /// Theme name from the catalog (e.g. `"mozart"`).
    pub theme: String,
    /// `"light" | "dark" | "system"`.
    pub color_mode: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Notifications {
    /// OS notification at end of turn when the workspace isn't focused.
    pub desktop: bool,
    /// Play the end-of-turn chime.
    pub sound: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Timeline {
    /// `"compact" | "normal" | "detailed"`.
    pub density: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    /// Default model id; `null` = use the app's current default model.
    pub model: Option<String>,
    /// `"agent" | "plan" | "ask"`.
    pub mode: String,
    /// `"low" | "medium" | "high" | "xhigh" | "max"`.
    pub effort: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Git {
    /// Branch new workspaces fork from.
    pub base_branch: String,
    /// `"pr" | "local"`.
    pub merge_action: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MozartSettings {
    pub version: String,
    pub appearance: Appearance,
    pub notifications: Notifications,
    pub timeline: Timeline,
    pub agent: Agent,
    pub git: Git,
    /// Ordered project run/setup scripts (supersedes `.mozart/run.json`).
    /// Key order drives the Run/Setup tab order. Project-scoped in practice;
    /// empty by default.
    #[serde(
        serialize_with = "crate::mozart_config::dto::ser_scripts",
        deserialize_with = "crate::mozart_config::dto::de_scripts"
    )]
    pub scripts: Vec<(String, String)>,
}

impl Default for MozartSettings {
    fn default() -> Self {
        Self {
            version: SCHEMA_VERSION.to_string(),
            appearance: Appearance {
                theme: "mozart".into(),
                color_mode: "system".into(),
            },
            notifications: Notifications {
                desktop: true,
                sound: true,
            },
            timeline: Timeline {
                density: "normal".into(),
            },
            agent: Agent {
                model: None,
                mode: "agent".into(),
                effort: "medium".into(),
            },
            git: Git {
                base_branch: "main".into(),
                merge_action: "pr".into(),
            },
            scripts: Vec::new(),
        }
    }
}

/// The bundled defaults (single source of truth).
pub fn defaults() -> MozartSettings {
    MozartSettings::default()
}

/// Editable global settings file path.
pub fn global_settings_path() -> Result<PathBuf, AppError> {
    crate::paths::global_settings_path()
}

/// `<repo>/.mozart/settings.json`.
pub fn project_settings_path(repo_root: &Path) -> PathBuf {
    repo_root.join(".mozart").join("settings.json")
}

/// Resolve effective settings: defaults ◀ global ◀ project. `project_root`
/// is the repo whose `.mozart/settings.json` applies (None = no project
/// context). A missing or malformed layer is skipped, never fatal.
pub fn resolve(project_root: Option<&Path>) -> MozartSettings {
    let mut merged =
        serde_json::to_value(MozartSettings::default()).expect("default settings serialize");
    if let Some(global) = load_global_value() {
        deep_merge(&mut merged, global);
    }
    if let Some(root) = project_root {
        if let Some(project) = load_layer(&project_settings_path(root)) {
            deep_merge(&mut merged, project);
        }
    }
    serde_json::from_value(merged).unwrap_or_else(|e| {
        eprintln!("[settings] resolved settings invalid, falling back to defaults: {e}");
        MozartSettings::default()
    })
}

/// Persist the global settings file (pretty JSON), creating the config dir.
pub fn save_global(settings: &MozartSettings) -> Result<(), AppError> {
    let path = crate::paths::global_settings_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| AppError::Io(format!("create config dir: {e}")))?;
    }
    let body = serde_json::to_string_pretty(settings)
        .map_err(|e| AppError::Validation(format!("serialize settings: {e}")))?;
    std::fs::write(&path, body).map_err(|e| AppError::Io(format!("write settings: {e}")))?;
    Ok(())
}

fn load_global_value() -> Option<Value> {
    let path = crate::paths::global_settings_path().ok()?;
    load_layer(&path)
}

fn load_layer(path: &Path) -> Option<Value> {
    let body = std::fs::read_to_string(path).ok()?;
    match serde_json::from_str::<Value>(&body) {
        Ok(v) => Some(v),
        Err(e) => {
            eprintln!("[settings] ignoring malformed {}: {e}", path.display());
            None
        }
    }
}

/// Recursively overlay `overlay` onto `base`: objects merge key-by-key,
/// everything else replaces. Keys absent from `overlay` keep the base value.
fn deep_merge(base: &mut Value, overlay: Value) {
    match (base, overlay) {
        (Value::Object(b), Value::Object(o)) => {
            for (k, v) in o {
                match b.get_mut(&k) {
                    Some(bv) => deep_merge(bv, v),
                    None => {
                        b.insert(k, v);
                    }
                }
            }
        }
        (b, o) => *b = o,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn defaults_have_expected_shape() {
        let v = serde_json::to_value(MozartSettings::default()).unwrap();
        assert_eq!(v["version"], "1");
        assert_eq!(v["appearance"]["theme"], "mozart");
        assert_eq!(v["appearance"]["colorMode"], "system");
        assert_eq!(v["notifications"]["desktop"], true);
        assert_eq!(v["notifications"]["sound"], true);
        assert_eq!(v["timeline"]["density"], "normal");
        assert_eq!(v["agent"]["model"], Value::Null);
        assert_eq!(v["agent"]["mode"], "agent");
        assert_eq!(v["agent"]["effort"], "medium");
        assert_eq!(v["git"]["baseBranch"], "main");
        assert_eq!(v["git"]["mergeAction"], "pr");
        assert_eq!(v["scripts"], json!({}));
    }

    #[test]
    fn deep_merge_overrides_only_present_keys() {
        let mut base = serde_json::to_value(MozartSettings::default()).unwrap();
        deep_merge(&mut base, json!({ "appearance": { "colorMode": "dark" } }));
        let s: MozartSettings = serde_json::from_value(base).unwrap();
        assert_eq!(s.appearance.color_mode, "dark");
        assert_eq!(s.appearance.theme, "mozart");
        assert_eq!(s.git.merge_action, "pr");
    }

    #[test]
    fn project_layer_wins_over_global() {
        let mut merged = serde_json::to_value(MozartSettings::default()).unwrap();
        deep_merge(
            &mut merged,
            json!({ "agent": { "effort": "high" }, "git": { "mergeAction": "local" } }),
        );
        deep_merge(&mut merged, json!({ "agent": { "effort": "max" } }));
        let s: MozartSettings = serde_json::from_value(merged).unwrap();
        assert_eq!(s.agent.effort, "max");
        assert_eq!(s.git.merge_action, "local");
    }

    #[test]
    fn unknown_keys_are_ignored() {
        let mut base = serde_json::to_value(MozartSettings::default()).unwrap();
        deep_merge(
            &mut base,
            json!({ "appearance": { "theme": "x", "futureKey": 1 }, "totallyNew": true }),
        );
        let s: MozartSettings = serde_json::from_value(base).unwrap();
        assert_eq!(s.appearance.theme, "x");
    }

    #[test]
    fn scripts_preserve_order() {
        let mut base = serde_json::to_value(MozartSettings::default()).unwrap();
        deep_merge(
            &mut base,
            json!({ "scripts": { "setup": "npm i", "run": "npm start" } }),
        );
        let s: MozartSettings = serde_json::from_value(base).unwrap();
        assert_eq!(
            s.scripts,
            vec![
                ("setup".to_string(), "npm i".to_string()),
                ("run".to_string(), "npm start".to_string()),
            ]
        );
    }

    #[test]
    fn docs_default_json_matches_app_defaults() {
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../docs/settings.default.json");
        let body = std::fs::read_to_string(path).unwrap_or_else(|e| panic!("read {path}: {e}"));
        let documented: Value = serde_json::from_str(&body).expect("docs json parses");
        let actual = serde_json::to_value(MozartSettings::default()).unwrap();
        assert_eq!(
            documented, actual,
            "docs/settings.default.json drifted from MozartSettings::default()"
        );
    }
}
