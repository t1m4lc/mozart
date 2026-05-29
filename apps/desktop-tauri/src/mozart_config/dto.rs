//! DTOs for `.mozart/run.json` and `.mozart/settings.json`.
//!
//! `RunConfig.scripts` is a `Vec<(String, String)>` — *not* a `HashMap` —
//! because the JSON key order drives the Run/Setup tab order in the UI
//! (left-most tab = first key in the file). serde_json's `preserve_order`
//! feature is enabled in Cargo.toml so its internal `Map` preserves
//! insertion order; we layer a custom `Deserialize` on top that flattens
//! the `{ "scripts": { "setup": "...", "run": "..." } }` object into the
//! ordered `Vec`.

use serde::de::{self, MapAccess, Visitor};
use serde::ser::SerializeMap;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fmt;

/// Mirrors `.mozart/run.json`. Schema:
/// ```json
/// { "scripts": { "setup": "pnpm install", "run": "pnpm dev" } }
/// ```
/// `scripts` is an ordered list of (name, command) pairs. The order is
/// load-bearing — it drives the Run/Setup tab order in the UI.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RunConfig {
    pub scripts: Vec<(String, String)>,
}

impl RunConfig {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_pairs<I, S1, S2>(pairs: I) -> Self
    where
        I: IntoIterator<Item = (S1, S2)>,
        S1: Into<String>,
        S2: Into<String>,
    {
        Self {
            scripts: pairs
                .into_iter()
                .map(|(k, v)| (k.into(), v.into()))
                .collect(),
        }
    }

    pub fn get(&self, name: &str) -> Option<&str> {
        self.scripts
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.as_str())
    }
}

// Custom (de)serialize so the on-disk shape is the conventional JSON
// object `{ "scripts": { ... } }` while the in-memory type is a Vec.

#[derive(Serialize, Deserialize)]
struct RunConfigWire {
    #[serde(serialize_with = "ser_scripts", deserialize_with = "de_scripts")]
    scripts: Vec<(String, String)>,
}

impl Serialize for RunConfig {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        RunConfigWire {
            scripts: self.scripts.clone(),
        }
        .serialize(s)
    }
}

impl<'de> Deserialize<'de> for RunConfig {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let wire = RunConfigWire::deserialize(d)?;
        Ok(Self {
            scripts: wire.scripts,
        })
    }
}

pub(crate) fn ser_scripts<S: Serializer>(
    scripts: &Vec<(String, String)>,
    s: S,
) -> Result<S::Ok, S::Error> {
    let mut map = s.serialize_map(Some(scripts.len()))?;
    for (k, v) in scripts {
        map.serialize_entry(k, v)?;
    }
    map.end()
}

pub(crate) fn de_scripts<'de, D: Deserializer<'de>>(
    d: D,
) -> Result<Vec<(String, String)>, D::Error> {
    struct OrderedMapVisitor;

    impl<'de> Visitor<'de> for OrderedMapVisitor {
        type Value = Vec<(String, String)>;

        fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.write_str("a JSON object of string→string pairs")
        }

        fn visit_map<M: MapAccess<'de>>(self, mut access: M) -> Result<Self::Value, M::Error> {
            let mut out = Vec::with_capacity(access.size_hint().unwrap_or(0));
            while let Some((k, v)) = access.next_entry::<String, String>()? {
                if out.iter().any(|(existing, _): &(String, String)| existing == &k) {
                    return Err(de::Error::custom(format!(
                        "duplicate script name '{k}' in run.json"
                    )));
                }
                out.push((k, v));
            }
            Ok(out)
        }
    }

    d.deserialize_map(OrderedMapVisitor)
}

/// Mirrors `.mozart/settings.json`. Minimal in P0; future fields land
/// behind the same `version` gate.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectSettings {
    pub version: String,
}

impl ProjectSettings {
    /// Currently the only accepted schema version. `validate.rs` will
    /// reject anything not in this set.
    pub const KNOWN_VERSIONS: &'static [&'static str] = &["0.1"];
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn run_config_preserves_insertion_order_from_json() {
        // Setup first, then run — order must round-trip.
        let json = r#"{ "scripts": { "setup": "pnpm install", "run": "pnpm dev" } }"#;
        let cfg: RunConfig = serde_json::from_str(json).unwrap();
        assert_eq!(
            cfg.scripts,
            vec![
                ("setup".to_string(), "pnpm install".to_string()),
                ("run".to_string(), "pnpm dev".to_string()),
            ]
        );
    }

    #[test]
    fn run_config_preserves_reverse_order_from_json() {
        // Run first, then setup — opposite order must also round-trip.
        let json = r#"{ "scripts": { "run": "pnpm dev", "setup": "pnpm install" } }"#;
        let cfg: RunConfig = serde_json::from_str(json).unwrap();
        assert_eq!(
            cfg.scripts,
            vec![
                ("run".to_string(), "pnpm dev".to_string()),
                ("setup".to_string(), "pnpm install".to_string()),
            ]
        );
    }

    #[test]
    fn run_config_round_trips_through_json() {
        let cfg = RunConfig::from_pairs([("run", "go run ."), ("setup", "go mod download")]);
        let json = serde_json::to_string(&cfg).unwrap();
        // serde_json with preserve_order keeps the order on serialize too.
        assert!(json.contains(r#""run":"go run .""#));
        let pos_run = json.find("run").unwrap();
        let pos_setup = json.find("setup").unwrap();
        assert!(
            pos_run < pos_setup,
            "expected 'run' to serialize before 'setup' — got {json}"
        );
        let parsed: RunConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, cfg);
    }

    #[test]
    fn run_config_rejects_duplicate_script_names() {
        let json = r#"{ "scripts": { "run": "a", "run": "b" } }"#;
        let err = serde_json::from_str::<RunConfig>(json).unwrap_err();
        assert!(err.to_string().contains("duplicate"));
    }

    #[test]
    fn run_config_get_finds_script() {
        let cfg = RunConfig::from_pairs([("setup", "pnpm install"), ("run", "pnpm dev")]);
        assert_eq!(cfg.get("setup"), Some("pnpm install"));
        assert_eq!(cfg.get("run"), Some("pnpm dev"));
        assert_eq!(cfg.get("missing"), None);
    }
}
