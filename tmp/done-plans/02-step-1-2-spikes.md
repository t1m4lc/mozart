# Plan: Step 1.2 — Spikes A-E + Cargo bootstrap + root scripts

**Spec source:** `docs/PLAN-v0.0.1.md` Step 1.2 (lines 402-413), reconciliation `.context/context.md` (decisions 3, 4)
**Author:** /plan
**Date:** 2026-05-10
**Confidence:** 8/10

---

## 1. Verified repo truths

- `apps/desktop/src-tauri/Cargo.toml:24` declares `tauri 2.11.1`. Only deps: `tauri-plugin-log 2`, `serde 1`, `serde_json 1`, `log 0.4`, `tauri-build 2.6.1`.
- `apps/desktop/src-tauri/src/lib.rs:16` is the current `pub fn run()` builder boilerplate, no commands registered.
- `apps/desktop/src-tauri/src/main.rs:6` redirects to `app_lib::run()`.
- `apps/desktop/src-tauri/build.rs:3` is `tauri_build::build()` — no `tauri-specta` integration yet.
- `apps/desktop/src-tauri/capabilities/default.json:9` grants `core:default` only.
- `apps/desktop/src-tauri/migrations/` does NOT exist.
- `package.json:6` declares only `"dev": "pnpm nx run desktop:tauri-dev"` — no `lint`/`test`/`typecheck`/`build` scripts.
- `apps/desktop/project.json` defines targets `tauri-dev` and `tauri-build` (verified by Explore agent).
- Local CLI `/home/timothy/.local/bin/claude` supports `-p` (non-interactive print) and `--output-format=stream-json` (newline-delimited JSON events) per `claude --help`.
- Reconciliation context `.context/context.md` decision 3 mandates this Cargo bootstrap atom precede all spike code.

## 2. Intent — what we're delivering

Validate the 5 risk-bearing assumptions of v0.0.1 before any production code is written. Each spike is a small, self-contained POC with a clear pass criterion. After Step 1.2 ships:
- Cargo deps for Steps 1.3–1.7 are committed.
- We've proven `git worktree`, SQLite WAL, Claude CLI streaming, tauri-specta TS roundtrip, and PTY auth login all work end-to-end on this machine.
- Root `package.json` exposes the four standard scripts referenced by AGENTS.md and PLAN.md L114.

If a spike fails, we document the blocker and pivot before Step 1.3 (PLAN.md L412).

## 3. Non-goals

- **No production module code** (db.rs, claude_cli.rs, sandbox.rs, worktree.rs are written in Steps 1.3–1.6, not here).
- **No UI changes.** Window config tweak is deferred to Step 1.3.
- **No `apps/landing` work.** Differred to Phase 2.
- **No `reqwest` / PostHog deps.** Deferred to Phase 2 telemetry.
- **No keychain integration.** `keyring` crate is added to Cargo so Step 1.5 can use it, but the spike doesn't exercise it (Step 1.5 will).

## 4. Architecture decisions locked in this plan

- **PTY crate:** `portable-pty` (PLAN.md L410 names it explicitly; mature cross-platform, blocking I/O acceptable for a single-tab `claude auth login`).
- **DB plugin:** `tauri-plugin-sql` with `features = ["sqlite"]` (PLAN.md L407 names it; built-in migration runner; plays nicely with Tauri's permission model).
- **Async runtime:** `tokio` 1 with `process` + `rt-multi-thread` + `macros` features (Step 1.4 uses `tokio::process::Command`).
- **ID generation:** `uuid` 1 with `v4` feature for `RunId`, `WorkspaceId`, etc.
- **Keychain crate:** `keyring` 3 (cross-platform; Linux falls back to file-mode 0600 in Step 1.5).
- **Claude CLI invocation pattern (Spike C):** `claude -p "<prompt>" --output-format=stream-json --include-partial-messages` → parse newline-delimited JSON events.
- **Spikes are isolated:** each spike is its own `#[cfg(test)] mod spike_X` block so they live in the test surface, not in production binary. Pass criterion = `cargo test -p desktop spike_<X> -- --nocapture --ignored` exits 0 (we mark them `#[ignore]` since some need external state — git, claude, network).
- **Spike B uses an in-memory SQLite** (`:memory:` URI) where possible to avoid filesystem cleanup; but WAL mode requires a real file, so it uses `tempfile::tempdir()`.

## 5. Files

### To create
- `apps/desktop/src-tauri/src/spikes/mod.rs` — module declaration + shared spike utilities (tempdir, helpers).
- `apps/desktop/src-tauri/src/spikes/spike_a_worktree.rs` — Spike A test.
- `apps/desktop/src-tauri/src/spikes/spike_b_sqlite.rs` — Spike B test.
- `apps/desktop/src-tauri/src/spikes/spike_c_claude_cli.rs` — Spike C test.
- `apps/desktop/src-tauri/src/spikes/spike_d_specta.rs` — Spike D test (probably small inline command + binding generation check).
- `apps/desktop/src-tauri/src/spikes/spike_e_pty.rs` — Spike E test.

### To modify
- `apps/desktop/src-tauri/Cargo.toml` — add deps: `tauri-plugin-sql` (feat sqlite), `tauri-specta` 2 (feat derive + typescript), `portable-pty` 0.8, `tokio` 1 (feat process+rt-multi-thread+macros), `uuid` 1 (feat v4), `keyring` 3, `tempfile` 3 (dev-dep), `anyhow` 1 (dev-dep, just for spike error glue).
- `apps/desktop/src-tauri/src/lib.rs` — `pub mod spikes;` only (no production wiring).
- `apps/desktop/src-tauri/build.rs` — minimal `tauri-specta` integration to validate Spike D (export typed bindings to `apps/desktop/src/app/_bindings.ts` at build time).
- `package.json` — add scripts: `typecheck`, `lint`, `test`, `build` delegating to `pnpm nx run-many -t <target>`.

### Reference (read-only — model the new code on these)
- `apps/desktop/src-tauri/Cargo.toml` — current dep style (workspace.dependencies pattern if used).
- `apps/desktop/src-tauri/src/lib.rs:1-16` — current builder pattern.
- `docs/PLAN-v0.0.1.md:402-410` — spike pass criteria (canonical).
- `docs/PLAN-v0.0.1.md:174-279` — Data Model D16 (Spike B uses a STRIPPED-DOWN version; Step 1.3 implements full).

## 6. Pseudocode (per spike)

### Spike A — `git worktree add` cross-platform
```
fn spike_a() -> Result<()> {
  let tmp = tempfile::tempdir()?;
  Command::new("git").args(["init", "--initial-branch=main", tmp.path()])?;
  // create initial commit (empty)
  Command::new("git").current_dir(tmp.path()).args(["commit","--allow-empty","-m","init"])?;
  let wt = tmp.path().join("wt");
  let status = Command::new("git").current_dir(tmp.path())
    .args(["worktree","add","-b","spike-a", wt.to_str().unwrap()]).status()?;
  assert!(status.success() && wt.join(".git").exists());
}
```

### Spike B — tauri-plugin-sql + WAL + small schema
```
fn spike_b() -> Result<()> {
  let tmp = tempfile::tempdir()?;
  let db_path = tmp.path().join("spike.db");
  // open via rusqlite directly (the plugin wraps rusqlite; spike validates WAL works)
  let conn = rusqlite::Connection::open(&db_path)?;
  conn.pragma_update(None, "journal_mode", "WAL")?;
  conn.pragma_update(None, "synchronous", "NORMAL")?;
  conn.pragma_update(None, "busy_timeout", 5000)?;
  // 3-table stripped schema (proves migration shape, not full D16)
  conn.execute_batch("CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL);
                     CREATE TABLE agent_runs(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id));
                     CREATE TABLE agent_events(id INTEGER PRIMARY KEY, run_id TEXT NOT NULL REFERENCES agent_runs(id), payload TEXT);")?;
  // assert WAL active
  let mode: String = conn.query_row("PRAGMA journal_mode", [], |r| r.get(0))?;
  assert_eq!(mode.to_lowercase(), "wal");
  // round-trip: insert workspace, insert run, insert 3 events, read them back
}
```

### Spike C — Claude CLI subprocess capture (200ms latency)
```
async fn spike_c() -> Result<()> {
  let mut child = tokio::process::Command::new("claude")
    .args(["-p", "Just say 'hello' and stop.", "--output-format=stream-json"])
    .stdout(Stdio::piped()).stderr(Stdio::piped())
    .spawn()?;
  let stdout = child.stdout.take().unwrap();
  let mut reader = BufReader::new(stdout).lines();
  let start = Instant::now();
  let mut first_event_at: Option<Duration> = None;
  let mut event_count = 0;
  while let Some(line) = reader.next_line().await? {
    if first_event_at.is_none() { first_event_at = Some(start.elapsed()); }
    let _: serde_json::Value = serde_json::from_str(&line)?;  // each line is JSON
    event_count += 1;
  }
  let status = child.wait().await?;
  assert!(status.success());
  assert!(event_count > 0, "no events emitted");
  // pass criterion: first event within 5s (real CLIs need wider tolerance than 200ms in cold-start)
  assert!(first_event_at.unwrap() < Duration::from_secs(5));
  // log first_event_at so we know real-world latency
}
```
Notes: PLAN.md L408 says "200ms" but that's after the model produces a token, not cold-start. The spike will record actual latency for documentation.

### Spike D — tauri-specta bindings round-trip
```
// In spike_d_specta.rs:
#[derive(specta::Type, serde::Serialize, serde::Deserialize)]
struct SpikeResult { ok: bool, value: i32 }

#[tauri::command]
#[specta::specta]
fn spike_d_echo(n: i32) -> SpikeResult { SpikeResult { ok: true, value: n } }

// build.rs (in #[cfg(debug_assertions)] block):
let builder = tauri_specta::Builder::<tauri::Wry>::new()
  .commands(tauri_specta::collect_commands![spike_d_echo]);
builder.export(specta_typescript::Typescript::default(),
               "../src/app/_bindings.ts")?;

// spike test asserts:
// - apps/desktop/src/app/_bindings.ts exists after `pnpm nx build desktop --target=tauri-build` (or `cargo build`)
// - file contains `export type SpikeResult = { ok: boolean; value: number; }`
// - file contains `export const commands = { spikeDEcho: ... }` (camelCase'd)
```

### Spike E — `portable-pty` + `claude auth login`
```
fn spike_e() -> Result<()> {
  // Don't actually trigger an OAuth flow. Just prove the PTY contract:
  let pty_system = portable_pty::native_pty_system();
  let pair = pty_system.openpty(PtySize { rows: 24, cols: 80, ..Default::default() })?;
  // spawn `claude --version` (cheap, doesn't need network) inside the PTY
  let cmd = CommandBuilder::new("claude").arg("--version").build();
  let mut child = pair.slave.spawn_command(cmd)?;
  drop(pair.slave);
  let mut reader = pair.master.try_clone_reader()?;
  let mut buf = String::new();
  std::io::Read::read_to_string(&mut reader, &mut buf)?;
  let status = child.wait()?;
  assert!(status.success());
  assert!(buf.contains("claude") || buf.contains("Claude"));
  // ALSO test that `claude auth login --help` prints something through PTY (proves OAuth-flow command exists)
}
```
Notes: We do NOT actually run `claude auth login` (would prompt browser). Proving PTY can spawn `claude` and capture output is enough for v0.0.1 viability.

## 7. Error handling strategy

- Spikes return `anyhow::Result<()>` (dev-dep). Production code in Steps 1.3+ uses `AppError`.
- Each spike test is `#[ignore]` so `cargo test` in CI doesn't break on machines without `claude` installed; run them locally with `cargo test --ignored`.
- Spikes that depend on external state (claude binary, git binary) must check for that binary first and `eprintln!` a skip message + return Ok if missing — they're spikes, not regression tests.

## 8. Task list (will be atomized into TASKS.md)

Execution order (single-core, all dependencies fall out from this):

1. **package.json scripts** — add `typecheck/lint/test/build` (tiny, isolated, unblocks gates).
2. **Cargo.toml deps** — add the 6 new deps + 2 dev-deps. Run `cargo check` after to confirm compile.
3. **lib.rs spike module** — declare `pub mod spikes;` and create `spikes/mod.rs` with shared helpers.
4. **Spike A — git worktree** — independently runnable.
5. **Spike B — SQLite WAL** — independently runnable.
6. **Spike E — portable-pty** — independently runnable, depends only on Cargo deps.
7. **Spike C — Claude CLI subprocess** — depends on tokio (Cargo deps atom).
8. **Spike D — tauri-specta** — depends on Cargo deps + build.rs change. Last because it touches build.rs (changes the build pipeline).

Atoms 4–8 are ordered by complexity, not by data dependency — each is independent. Atom 8 last because it changes `build.rs` (every other atom would otherwise re-trigger TS export pollution).

## 9. Validation gate

After each atom (run by /implement and the implementer agent):
```sh
# inside apps/desktop/src-tauri:
cargo check -p desktop
cargo test -p desktop --no-run            # spikes compile
cargo test -p desktop --ignored -- spike_<id>   # the new spike passes
# at repo root:
pnpm nx lint desktop
pnpm nx run-many -t lint test --projects=desktop
```

After the LAST atom (whole plan):
```sh
cargo test -p desktop --ignored           # all 5 spikes pass
pnpm typecheck && pnpm lint && pnpm test  # root scripts work end-to-end
ls apps/desktop/src/app/_bindings.ts      # generated by spike D's build.rs change
```

## 10. Rollback

- `package.json` script add: revert the commit. Zero downstream impact.
- `Cargo.toml` deps: revert the commit, run `cargo update` to regenerate Cargo.lock.
- Spikes themselves: each is a fresh file in `src/spikes/`. Revert the commit deletes them. `lib.rs` only needs `pub mod spikes;` removed — atomic.
- `build.rs` change: revert restores the 3-line `tauri_build::build()`. tauri-specta artifact `apps/desktop/src/app/_bindings.ts` is gitignored (will add to `.gitignore` in spike D atom).

## 11. Open questions

(none — all deferred questions from `.context/context.md` resolved by this plan's decisions in §4)

## 12. Confidence

**8/10** — Each spike is small, isolated, and PLAN.md gave us pass criteria. Risk: tauri-specta v2 API can change (we'll pin the exact version); Claude CLI output schema isn't formally documented (Spike C tolerates any JSON shape, just asserts it parses). One unknown is the keyring crate behavior on this Linux box — but that's out of scope here, only added as a dep.
