//! Dev-only CLI that opens the Mozart desktop DB (running migrations
//! first) and either wipes it or wipes-and-seeds it with the demo
//! dataset — without launching the Tauri UI.
//!
//! Driven by the root-`package.json` scripts:
//! ```sh
//! pnpm reset-db    # → seed-demo --clean
//! pnpm seed        # → seed-demo --demo
//! pnpm seed-fresh  # → alias for `pnpm seed`
//! ```
//!
//! Hard-gated behind `#[cfg(debug_assertions)]`: in a release binary
//! `main()` prints a refusal and exits non-zero, so even if the bin
//! somehow shipped (it isn't bundled by `tauri build`) it cannot
//! mutate a user's DB.
//!
//! DB path resolution, in order:
//! 1. `MOZART_DB_PATH` env override (same convention as `lib.rs::run()`).
//! 2. Platform default for bundle id `build.mozart.desktop`:
//!    - Linux:   `$XDG_DATA_HOME/build.mozart.desktop/mozart.db`
//!               (falls back to `$HOME/.local/share/...`).
//!    - macOS:   `$HOME/Library/Application Support/build.mozart.desktop/mozart.db`.
//!    - Windows: `%APPDATA%\build.mozart.desktop\mozart.db`.

#[cfg(not(debug_assertions))]
fn main() {
    eprintln!(
        "seed-demo is a dev-only tool and is not available in release builds."
    );
    std::process::exit(1);
}

#[cfg(debug_assertions)]
fn main() {
    use std::path::PathBuf;
    use std::process::ExitCode;

    enum Mode {
        Clean,
        Demo,
    }

    fn usage(code: u8) -> ExitCode {
        eprintln!(
            "usage: seed-demo [--clean | --demo]\n  \
             --clean   wipe every domain table (schema preserved)\n  \
             --demo    wipe + insert the deterministic demo dataset (default)\n\
             env:\n  \
             MOZART_DB_PATH   override the resolved DB path"
        );
        ExitCode::from(code)
    }

    let mut mode = Mode::Demo;
    for arg in std::env::args().skip(1) {
        match arg.as_str() {
            "--clean" => mode = Mode::Clean,
            "--demo" => mode = Mode::Demo,
            "-h" | "--help" => {
                let _ = usage(0);
                return;
            }
            other => {
                eprintln!("seed-demo: unknown arg `{other}`");
                let _ = usage(2);
                return;
            }
        }
    }

    let db_path = resolve_db_path();
    if let Some(parent) = db_path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            eprintln!("seed-demo: cannot create {}: {e}", parent.display());
            std::process::exit(1);
        }
    }

    let db = match mozart_lib::db::init_db(&db_path) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("seed-demo: db init failed at {}: {e:?}", db_path.display());
            std::process::exit(1);
        }
    };
    let mut conn = db.lock();

    let result = match mode {
        Mode::Clean => mozart_lib::db::reset::reset_clean(&mut conn),
        Mode::Demo => mozart_lib::db::reset::reset_with_demo_seed(&mut conn),
    };
    match result {
        Ok(()) => {
            let label = match mode {
                Mode::Clean => "clean",
                Mode::Demo => "demo",
            };
            println!("seed-demo: {label} reset applied → {}", db_path.display());
        }
        Err(e) => {
            eprintln!("seed-demo: {e:?}");
            std::process::exit(1);
        }
    }

    fn resolve_db_path() -> PathBuf {
        const BUNDLE: &str = "build.mozart.desktop";
        const FILE: &str = "mozart.db";

        if let Some(p) = std::env::var_os("MOZART_DB_PATH") {
            return PathBuf::from(p);
        }

        let data_root = if cfg!(target_os = "linux") {
            std::env::var_os("XDG_DATA_HOME")
                .map(PathBuf::from)
                .or_else(|| std::env::var_os("HOME").map(|h| {
                    let mut p = PathBuf::from(h);
                    p.push(".local/share");
                    p
                }))
        } else if cfg!(target_os = "macos") {
            std::env::var_os("HOME").map(|h| {
                let mut p = PathBuf::from(h);
                p.push("Library/Application Support");
                p
            })
        } else if cfg!(target_os = "windows") {
            std::env::var_os("APPDATA").map(PathBuf::from)
        } else {
            None
        };

        let mut path = data_root.unwrap_or_else(|| {
            eprintln!(
                "seed-demo: cannot resolve platform data dir; set MOZART_DB_PATH"
            );
            std::process::exit(1);
        });
        path.push(BUNDLE);
        path.push(FILE);
        path
    }
}
