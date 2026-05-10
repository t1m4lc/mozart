pub mod bindings_export;
pub mod branch_name;
pub mod claude_cli;
pub mod commands;
pub mod db;
pub mod error;
pub mod git_query;
pub mod run_registry;
pub mod sandbox;
pub mod workspace_service;
pub mod worktree;

#[cfg(test)]
mod spikes;

use std::path::PathBuf;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Build the typed surface. `tauri_specta::Builder` in v2.0.0-rc.21 is
    // not `Clone`, so we construct two independent instances from the same
    // factory: one consumed by `.invoke_handler`, one moved into `.setup`
    // for `mount_events`. The single `build_specta_builder()` definition
    // keeps the command/type list in one place.
    let specta_builder = bindings_export::build_specta_builder();

    // Debug-only: regenerate the typed TS bindings from the source of
    // truth. Release builds never write to the source tree.
    //
    // `bigint(Number)` is required because `db::models::*` carries
    // `i64` Unix-millisecond timestamps (`started_at`, `created_at`,
    // ...). specta's default policy is `BigIntForbidden`, which would
    // panic on first debug boot. Mozart's actual i64 values (Unix-ms
    // timestamps ~1.7e12, exit codes 0-255, small file counts) all fit
    // safely within JS Number precision (2^53), so `Number` is chosen
    // over `BigInt` for ergonomics: `new Date(workspace.created_at)`
    // and `if (run.exit_code === 0)` work without bigint coercion.
    #[cfg(debug_assertions)]
    specta_builder
        .export(
            specta_typescript::Typescript::default()
                .bigint(specta_typescript::BigIntExportBehavior::Number)
                .formatter(specta_typescript::formatter::prettier),
            "../src/app/_bindings.ts",
        )
        .expect("tauri-specta export failed");

    let setup_builder = bindings_export::build_specta_builder();

    tauri::Builder::default()
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app| {
            // Preserve the debug-only log plugin from the pre-1.7 lib.rs.
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // DB path: env override > app_data_dir/mozart.db
            let db_path: PathBuf = std::env::var_os("MOZART_DB_PATH")
                .map(PathBuf::from)
                .unwrap_or_else(|| {
                    let dir = app
                        .path()
                        .app_data_dir()
                        .expect("app_data_dir unresolvable");
                    std::fs::create_dir_all(&dir).ok();
                    dir.join("mozart.db")
                });
            let db_state = db::init_db(&db_path).expect("db init failed");
            app.manage(db_state);

            // Run registry holds live RunHandles for stop_agent_run lookup.
            app.manage(run_registry::RunRegistry::new());

            // Typed event mounting: no-op for v0.0.1 (no events declared
            // yet) but forward-compatible — future Builder.events() calls
            // register here.
            setup_builder.mount_events(app);

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
