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

    // All 18 commands (tauri-specta camelCases function names by default
    // in v2; the spike-D test belt-and-braces both forms, but production
    // bindings consistently use the camelCase form). Step 3 added the
    // pinned/unread mutators.
    let expected_commands = [
        "listRepos",
        "addRepo",
        "removeRepo",
        "setRepoIcon",
        "setRepoHidden",
        "setRepoSort",
        "listBranches",
        "createWorkspace",
        "listWorkspaces",
        "listTasks",
        "archiveWorkspace",
        "renameWorkspace",
        "setWorkspaceUiStatus",
        "setWorkspacePinned",
        "setWorkspaceUnread",
        "startAgentRun",
        "stopAgentRun",
        "listRuns",
        "getWorkspaceDiff",
        "discardWorkspaceChanges",
        "listChats",
        "createChat",
        "renameChat",
        "closeChat",
        "getActiveChat",
        "setActiveChat",
        "updateChatMode",
        "updateChatEffort",
        "updateChatModel",
        "markChatRead",
        "listMessages",
        "insertMessage",
        "updateMessageContent",
        "updateMessageStatus",
        "updateMessageTimeline",
        "checkClaudeInstall",
        // Step 6 — Anthropic credentials + Claude Code session probe.
        "checkClaudeCodeSession",
        "hasAnthropicKey",
        "connectAnthropic",
        "disconnectAnthropic",
        "refreshAnthropicConnection",
    ];
    for cmd in expected_commands {
        assert!(
            content.contains(cmd),
            "generated bindings missing command identifier `{cmd}`"
        );
    }

    // All 10 typed surfaces declared via `.typ::<...>()` in
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
        "Chat",
        "Message",
        "ProbeResult", // Step 6 — Anthropic connection probe outcome.
    ];
    for ty in expected_types {
        assert!(
            content.contains(ty),
            "generated bindings missing type `{ty}`"
        );
    }
}

/// Manual escape hatch — writes the production `_bindings.ts` directly
/// without booting the Tauri runtime. Use this when `pnpm tauri dev` has
/// not regenerated the bindings (e.g. headless dev environments where the
/// webview fails to launch, blocking the `cfg!(debug_assertions)` export
/// path in `lib.rs::run()`).
///
/// Marked `#[ignore]` so it never runs in normal test suites. Invoke
/// explicitly:
///
/// ```sh
/// cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml \
///   -- --ignored regenerate_production_bindings
/// ```
///
/// Mirrors `lib.rs::run()` lines 39-93: same exporter config, same shim
/// to strip the colliding `TAURI_CHANNEL` alias and inject the
/// `eslint-disable` header.
#[test]
#[ignore = "regen helper — see test doc for invocation"]
fn regenerate_production_bindings() {
    use specta_typescript::formatter;

    let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let out = manifest_dir.join("../src/app/core/_bindings.ts");

    build_specta_builder()
        .export(
            Typescript::default()
                .bigint(BigIntExportBehavior::Number)
                .formatter(formatter::prettier),
            &out,
        )
        .expect("specta export failed");

    let raw = std::fs::read_to_string(&out).expect("read bindings");
    let stripped: String = raw
        .lines()
        .filter(|l| !l.trim_start().starts_with("export type TAURI_CHANNEL"))
        .collect::<Vec<_>>()
        .join("\n");
    let header = "/* eslint-disable @typescript-eslint/no-explicit-any, \
                  @typescript-eslint/no-empty-function, \
                  @typescript-eslint/no-unused-vars */";
    let final_content = if stripped.contains("eslint-disable") {
        stripped
    } else {
        let mut lines = stripped.lines();
        let first = lines.next().unwrap_or("");
        let rest: Vec<&str> = lines.collect();
        let mut o = String::with_capacity(stripped.len() + header.len() + 2);
        o.push_str(first);
        o.push('\n');
        o.push_str(header);
        o.push('\n');
        o.push_str(&rest.join("\n"));
        o
    };
    let with_newline = if final_content.ends_with('\n') {
        final_content
    } else {
        format!("{final_content}\n")
    };
    std::fs::write(&out, with_newline).expect("rewrite bindings");
    eprintln!("regenerated production bindings at {}", out.display());
}
