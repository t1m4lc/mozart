//! Integration test for tauri-specta bindings generation. Exercises the
//! same `build_specta_builder()` factory used by `lib.rs::run()` so the
//! production typegen path is covered without booting the Tauri runtime.
//!
//! This test is the deterministic CI gate for the bindings surface — a
//! drift in `commands/mod.rs` or `bindings_export.rs` that drops a
//! command name or a type from the export will fail here.

use app_lib::bindings_export::build_specta_builder;
use specta_typescript::{BigIntExportBehavior, Typescript};

#[test]
fn export_contains_all_commands_and_types() {
    let tmp = tempfile::tempdir().expect("tempdir");
    let out = tmp.path().join("_bindings.ts");

    // `bigint(Number)` mirrors the production export in `lib.rs`: the
    // `db::models::*` row structs carry `i64` Unix-millisecond
    // timestamps which specta refuses to export under the default
    // `BigIntForbidden` policy. `Number` keeps Angular consumers
    // ergonomic (Date math, equality comparisons) at no precision cost
    // for Mozart's actual value ranges.
    build_specta_builder()
        .export(
            Typescript::default().bigint(BigIntExportBehavior::Number),
            &out,
        )
        .expect("specta export failed");

    let content = std::fs::read_to_string(&out).expect("read generated bindings");

    // All 13 commands (tauri-specta camelCases function names by default
    // in v2; the spike-D test belt-and-braces both forms, but production
    // bindings consistently use the camelCase form).
    let expected_commands = [
        "listRepos",
        "addRepo",
        "listBranches",
        "createWorkspace",
        "listWorkspaces",
        "listTasks",
        "archiveWorkspace",
        "startAgentRun",
        "stopAgentRun",
        "listRuns",
        "getWorkspaceDiff",
        "discardWorkspaceChanges",
        "checkClaudeInstall",
    ];
    for cmd in expected_commands {
        assert!(
            content.contains(cmd),
            "generated bindings missing command identifier `{cmd}`"
        );
    }

    // All 9 typed surfaces declared via `.typ::<...>()` in
    // bindings_export.rs. Specta exports each as a top-level TS
    // type / interface declaration.
    let expected_types = [
        "AppError",
        "StreamEvent",
        "ClaudeInstall",
        "Repo",
        "Task",
        "Workspace",
        "Thread",
        "AgentRun",
        "WorkspaceChange",
    ];
    for ty in expected_types {
        assert!(
            content.contains(ty),
            "generated bindings missing type `{ty}`"
        );
    }
}
