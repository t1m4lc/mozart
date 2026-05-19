//! Schema validator for `.mozart/*` config.
//!
//! Runs at both read and write to enforce the hard rules from
//! docs/specs/plan-mozart-dogfood-readiness.md § P0.3:
//!
//! - No key (at any depth) matches `/(password|secret|token|api[_-]?key)/i`.
//!   Keeps secrets out of files that may end up in a repo.
//! - No string value passes `Path::is_absolute()`. Absolute paths bake the
//!   author's machine into the config; relative paths are the contract.
//! - If a top-level `version` field is present, it must be in the known
//!   set ([`super::dto::ProjectSettings::KNOWN_VERSIONS`]).

use std::path::Path;

use serde_json::Value;

use crate::error::AppError;

use super::dto::ProjectSettings;

/// Validate any parsed JSON value destined for or coming from a
/// `.mozart/*` file. Returns the first violation found; bail-on-first
/// is fine here because the user fixes each issue and re-reads.
pub fn validate_config(value: &Value) -> Result<(), AppError> {
    if let Some(version) = value.get("version").and_then(Value::as_str) {
        if !ProjectSettings::KNOWN_VERSIONS.contains(&version) {
            return Err(AppError::Validation(format!(
                "unknown schema version '{version}' — expected one of {:?}",
                ProjectSettings::KNOWN_VERSIONS
            )));
        }
    }
    walk(value, &mut Vec::new())
}

fn walk(value: &Value, path: &mut Vec<String>) -> Result<(), AppError> {
    match value {
        Value::Object(map) => {
            for (key, child) in map.iter() {
                if is_forbidden_key(key) {
                    return Err(AppError::Validation(format!(
                        "forbidden key '{}' at {} — secrets must not live in .mozart/ files",
                        key,
                        breadcrumb(path, Some(key)),
                    )));
                }
                path.push(key.clone());
                walk(child, path)?;
                path.pop();
            }
            Ok(())
        }
        Value::Array(items) => {
            for (i, item) in items.iter().enumerate() {
                path.push(format!("[{i}]"));
                walk(item, path)?;
                path.pop();
            }
            Ok(())
        }
        Value::String(s) => {
            if Path::new(s).is_absolute() {
                return Err(AppError::Validation(format!(
                    "absolute path '{}' at {} — use a path relative to the project root",
                    s,
                    breadcrumb(path, None),
                )));
            }
            Ok(())
        }
        Value::Null | Value::Bool(_) | Value::Number(_) => Ok(()),
    }
}

/// Mirror of `/(password|secret|token|api[_-]?key)/i`. Avoids pulling
/// in `regex` for a single fixed pattern: case-insensitive substring
/// match for each alternative.
fn is_forbidden_key(key: &str) -> bool {
    let lower = key.to_ascii_lowercase();
    const NEEDLES: &[&str] = &[
        "password",
        "secret",
        "token",
        "apikey",
        "api_key",
        "api-key",
    ];
    NEEDLES.iter().any(|n| lower.contains(n))
}

fn breadcrumb(path: &[String], tail: Option<&str>) -> String {
    let mut crumbs: Vec<String> = path.to_vec();
    if let Some(t) = tail {
        crumbs.push(t.to_string());
    }
    if crumbs.is_empty() {
        "<root>".to_string()
    } else {
        crumbs.join(".")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn err_msg(value: serde_json::Value) -> String {
        match validate_config(&value).unwrap_err() {
            AppError::Validation(m) => m,
            other => panic!("expected Validation, got {other:?}"),
        }
    }

    #[test]
    fn happy_path_run_json() {
        let v = json!({
            "scripts": {
                "setup": "pnpm install",
                "run": "pnpm dev",
            }
        });
        validate_config(&v).expect("typical run.json must pass");
    }

    #[test]
    fn happy_path_settings_json() {
        let v = json!({ "version": "0.1" });
        validate_config(&v).expect("known schema version must pass");
    }

    #[test]
    fn rejects_api_key_at_top_level() {
        let v = json!({ "api_key": "sk-abc" });
        let msg = err_msg(v);
        assert!(msg.to_lowercase().contains("api_key"), "got: {msg}");
        assert!(msg.contains("forbidden"));
    }

    #[test]
    fn rejects_api_key_nested() {
        let v = json!({ "scripts": { "API-KEY": "...", "setup": "ok" } });
        let msg = err_msg(v);
        assert!(msg.to_lowercase().contains("api-key"));
    }

    #[test]
    fn rejects_password_secret_token() {
        for key in ["password", "Password", "MY_SECRET", "github_token", "tokens"] {
            let v = json!({ key: "x" });
            let msg = err_msg(v);
            assert!(msg.contains("forbidden"), "key {key}: {msg}");
        }
    }

    #[test]
    fn rejects_absolute_path_value_unix() {
        if cfg!(unix) {
            let v = json!({
                "scripts": { "setup": "/Users/timothy/install.sh" }
            });
            let msg = err_msg(v);
            assert!(msg.contains("absolute path"));
            assert!(msg.contains("/Users/timothy/install.sh"));
            assert!(msg.contains("scripts.setup"));
        }
    }

    #[test]
    fn rejects_unknown_version() {
        let v = json!({ "version": "9.9" });
        let msg = err_msg(v);
        assert!(msg.contains("unknown schema version"));
        assert!(msg.contains("9.9"));
    }

    #[test]
    fn accepts_relative_paths_and_command_strings() {
        let v = json!({
            "scripts": {
                "setup": "./scripts/setup.sh",
                "run": "node ./apps/web/index.js",
            }
        });
        validate_config(&v).expect("relative paths and commands are fine");
    }

    #[test]
    fn array_walks_are_validated_too() {
        // Edge: future schema may use arrays. Validator should still walk.
        let v = json!({ "extras": [ { "secret": "shh" } ] });
        let msg = err_msg(v);
        assert!(msg.contains("forbidden"));
        assert!(msg.contains("secret"));
    }
}
