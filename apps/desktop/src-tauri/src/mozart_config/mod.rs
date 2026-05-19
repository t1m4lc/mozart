//! Per-project Mozart config — `.mozart/run.json`, `.mozart/settings.json`,
//! and the `project_local_config` DB row that backs them when the user
//! hasn't moved the config to the repo.
//!
//! See docs/specs/plan-mozart-dogfood-readiness.md § P0.3.
//!
//! Submodules land across atoms R0.3.A → R0.3.E. This file (R0.3.A) only
//! defines the DTO; later atoms add `detect`, `validate`, and the Tauri
//! commands that read/write it.

pub mod detect;
pub mod dto;
pub mod validate;
