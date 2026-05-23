# TODOS

Deferred work captured during reviews. Each entry: what / why / how to apply / depends on. Delete an entry when it's done or stops being valuable.

---

## Landing — replace Coming-soon install instructions

**What:** `apps/landing/src/content/docs/getting-started.md` ships with `### Install` marked "Coming soon — public download not yet available." Replace with real one-liner install instructions once the desktop binary distribution pipeline exists.

**Why:** Marketing site is the discovery surface. A reader who lands on `/docs/getting-started` and can't actually install Mozart bounces.

**How to apply:** When the desktop release pipeline ships (GitHub Releases or similar), edit `apps/landing/src/content/docs/getting-started.md` `### Install` section. Replace "Coming soon" with the actual install command(s). Consider also updating the homepage CTA copy if "Read the docs" becomes "Download Mozart".

**Depends on:** Desktop binary distribution pipeline (not in this repo today). Not blocking for landing v0.1.0-beta.1 launch.

---

## Landing — replace placeholder legal copy (LAUNCH GATE)

**What:** `/privacy` and `/terms` ship with placeholder banner + `<meta robots noindex,nofollow>`. Production launch must replace with real legal copy from counsel.

**Why:** "Placeholder — not final legal text" is fine for preview but cannot ship publicly. Once real copy lands:

1. Remove the placeholder banner.
2. Remove the `noindex,nofollow` meta tag.
3. Add `/privacy` and `/terms` to `sitemap.xml` (currently excluded by Phase 12).

**How to apply:** Counsel drafts real privacy/terms. Apply text to `apps/landing/src/app/pages/privacy.page.ts` and `terms.page.ts`. Remove the three placeholder-gating things above. Update "Last updated" date.

**Depends on:** Counsel review. **Blocks production launch to mozart.build.**

---

## Landing — consider a conversion path before public launch

**What:** Plan §6 lists "payments, accounts, dashboards" as out of scope. Codex's outside-voice review flagged that the v0.1.0-beta.1 landing has zero conversion CTAs — no waitlist, no contact form, no download CTA (the binary doesn't exist), no email capture. Strategically thin for a marketing site.

**Why:** A marketing site without a conversion path is a brochure. If Mozart's pre-launch goal includes building an interested-user list, a waitlist or "notify me when downloads open" CTA is the cheapest way to capture intent.

**How to apply:** Run `/plan-ceo-review` on the question "Should v0.1.0-beta.1 landing include a conversion CTA (waitlist / contact / pre-signup)?" before the public launch decision. Eng work is small (form → email service like Loops/ConvertKit, or a Cloudflare Worker → KV store) IF the product decision says yes. **Do not build first; decide first.**

**Depends on:** Product/strategy decision. Not an eng decision.

---

## apps/sandbox — finish migrating timeline.sandbox (blocked on llm-model lib)

**What:** `apps/sandbox` now hosts the composer + index pages. `timeline.sandbox.ts` still lives in `apps/desktop/src/app/pages/sandbox/` because it depends on the `llm-model` domain (3 JSON fixtures + `applyAgentEvent` reducer + `AgentEvent` type), and apps can't import from apps under the module-boundary rule.

**Why:** One sandbox host is cleaner than two. Today `pnpm nx serve sandbox` shows composer-only; you have to `pnpm nx serve desktop` and navigate to `/sandbox/timeline` to dogfood the agent timeline.

**How to apply:** Promote the relevant slice of `apps/desktop/src/app/domains/llm-model/data/stream/` (event.types, reducer, fixtures) into a new lib — e.g. `libs/llm-model-stream` tagged `scope:shared` (pure functions + types, no UI). Then move `timeline.sandbox.ts` into `apps/sandbox/src/app/`, add it to `apps/sandbox/src/app/app.routes.ts`, delete `apps/desktop/src/app/pages/sandbox/`, delete `apps/desktop/src/app/sandbox.routes.{ts,prod.ts}`, and drop the `fileReplacements` entry for sandbox from `apps/desktop/project.json`.

**Depends on:** llm-model stream slice extracted to a lib. Real domain work — likely a half-day on its own.

---

## Chat — anchor-based scroll restore (replaces pixel-based)

**What:** Replace the pixel `scrollTop` stored by `ScrollPositionService` with anchor-based restore: on snapshot, identify the topmost message visible in the viewport and store `{messageId, offsetWithinMessage}`. On restore, find that message in the (possibly grown) DOM and scroll so it lands at the same offset.

**Why:** Pixel restore lands the user at the wrong semantic place when content arrived while they were on another tab — common during streaming. Anchor-based survives content growth.

**How to apply:** `ScrollPositionService` grows a parallel `anchorByTabKey: Map<string, {messageId: string, offsetPx: number}>`. Snapshot uses `IntersectionObserver` (or `getBoundingClientRect` on each message child) to find the first message whose `top >= 0`. Offset = `0 - element.getBoundingClientRect().top` (or the visible portion). Restore: `querySelector` for that message by id, scroll to its top + offset. Fallback to pixel when no anchor element is found (chat empty, anchor message deleted). Same pattern can apply to file diff (anchor to hunk header line number) — but only if anchor-based proves valuable in chat first.

**Depends on:** Scroll persistence PR landed. Pure additive — no architectural change.

---

## Chat / Files — CDK virtual scrolling reintroduction

**What:** Re-attempt CDK virtual scrolling for chat (and maybe file diff) with a real autosize strategy. Was reverted before (commit `37f6171`) because the fixed-size strategy mis-measured variable-height messages.

**Why:** Today's "no virtual scroll" decision is "acceptable for now — typical chats stay under a few hundred messages". When chats start exceeding ~1000 messages, the unbounded DOM becomes a perf bottleneck.

**How to apply:** Trigger condition — chat sizes hit 1000+ in real usage OR perf telemetry shows scroll jank on long chats. Try `@angular/cdk-experimental/scrolling` first (autosize strategy). If still flaky on markdown / code blocks / streaming, write a custom strategy that uses `ResizeObserver` per item to track height changes. Architectural prereq: chat scroll surface needs to move off `<main>` and into the message-list (the inverse of today's design) — see D1 option D from the eng review.

**Depends on:** Real perf signal (telemetry or user complaint) OR a custom autosize strategy. Experiment in `apps/sandbox` before touching the chat domain.

---

## Scroll — handle file path identity changes

**What:** `ScrollPositionService` keys for files use `file:${workspaceId}:${path}`. Renames, moves, case changes, and symlinks all produce different keys for what is logically the same file, breaking restore.

**Why:** When a user renames a file mid-session, the saved scroll position is orphaned and the new path opens fresh (or at default top), which feels like a bug.

**How to apply:** Two options. (a) Subscribe to file-tab rename events from FileTabsService; on rename, rewrite the key in ScrollPositionService (`forget(oldKey); remember(newKey, value)`). Requires FileTabsService to emit rename events. (b) Switch keys to content-derived identity (e.g., normalized absolute path + file inode/content hash) — more robust but heavier. Option (a) is the right first cut.

**Depends on:** FileTabsService growing a rename event. Could be done in the same PR as rename support if/when that ships.

---

## Chat scroll — extend Linux WebKitGTK fix to other platforms if needed

**What:** Today `apps/desktop/src-tauri/src/lib.rs` only configures WebKit scroll on Linux (disable smooth-scrolling, force GPU compositing) because that's the only platform where Tauri's webview engine (WebKitGTK) feels noticeably slower than Chromium for wheel scrolling. If users on macOS or Windows report a similar slowness, evaluate platform-specific tweaks.

**Why:** Tauri uses a different webview engine per platform:

- Linux → WebKitGTK 4.1 (the fixed-here case)
- macOS → WKWebView (Apple's WebKit). Scroll behavior is OS-native via NSScrollView; expected to feel like every other macOS app. Usually fine.
- Windows → WebView2 (Chromium-based). Scroll feel matches Chrome/Edge.

We applied the Linux fix because the slowness was reported there. macOS and Windows haven't been reported yet but could surface as we get more cross-platform usage.

**How to apply:** Reproduce the complaint on the target platform first. Then:

- macOS: WKWebView doesn't expose an equivalent `enable-smooth-scrolling` setting. Investigate `WKPreferences` and `NSScrollView` properties via `tauri::WebviewWindow::with_webview` + the wry crate's macOS extensions. Many "fixes" here are at the OS preferences layer, not the app.
- Windows: WebView2 settings are exposed via `tauri::WebviewWindow::with_webview` and the wry Windows extensions. Look at `CoreWebView2Settings` and any high-precision-input flags.

**Depends on:** A real complaint on a non-Linux platform. Don't speculate-fix.

---

## Scroll — wire `forgetChat` / `forgetWorkspace` call sites

**What:** `ScrollPositionService.forgetChat(workspaceId, chatId)` and `forgetWorkspace(workspaceId)` are implemented and tested but never called from the rest of the app. The only similar wiring that exists is `forgetFile` from `FileTabsService.closeFor`. Chat deletion + workspace deletion currently leak their scroll positions + per-chat follow modes until the app relaunches.

**Why:** Today's blast radius is small — in-memory maps capped by a session's chat/workspace count. But the API is misleading: a dev reading `forgetChat` and assuming "OK so deleting a chat cleans up" would be wrong. And on long sessions with many created/deleted chats, the maps grow.

**How to apply:** Find the chat-delete and workspace-delete code paths (likely in `ChatFacade` and `WorkspacesFacade`). On delete, inject `ScrollPositionService` and call `forgetChat(workspaceId, chatId)` / `forgetWorkspace(workspaceId)`. Mirror the pattern used in `FileTabsService.closeFor`. Add a regression spec.

**Depends on:** Knowing the exact delete code paths — small investigation needed.

## Sandbox — real OS-level filesystem fence for the Claude subprocess (load-bearing)

## Sandbox — real OS-level filesystem fence for the Claude subprocess AND the terminal PTY (load-bearing)

**What:** Wrap **both** the `claude` subprocess and the in-app terminal PTY in an OS-level sandbox so neither can reach paths outside `~/.mozart/worktrees/<scope>`. Linux first via `bubblewrap`, then macOS via `sandbox-exec`, then Windows via `AppContainer`.

**Why:** Two surfaces, same gap.

1. **Claude subprocess:** empirically falsified 2026-05-21 — Claude CLI's `--add-dir` is **contextual, not enforced**. Re-falsified 2026-05-22 for `--allowedTools` as well: an `ask`-mode prompt (argv carries `--allowedTools=Read,Glob,Grep`) successfully edited a file, proving the agent's Write tool fires regardless of the allowlist. The probe (MOZART_CLAUDE_BIN shim) confirmed Mozart sends the correct argv (`--add-dir`, `--permission-mode=acceptEdits`, `--allowedTools`, `--append-system-prompt` clamp) but the agent still reads any OS-readable path AND still writes outside the allowlist because nothing blocks the syscall. Conclusion: **both `--add-dir` and `--allowedTools` are contextual**, not enforced. The Atom 7 system-prompt clamp now makes the agent refuse politely, but a jailbreak prompt would bypass it. As a hardening step until this lands, the IPC freeze guard no longer skips `ask` mode (2026-05-22 — see `start_agent_run_impl`): a frozen workspace refuses every agent run, mode notwithstanding.

2. **Terminal PTY:** the `path_guard::guard_workspace_worktree` check at the spawn site (`open_terminal`, `start_workspace_run_impl`) only validates the **initial `cwd`** before launching the shell. Once the shell is alive it inherits the user's full environment — a user (or anything driving the terminal) can `cd ~/.ssh && cat id_rsa` and there is **no** OS-level constraint stopping it. Same root cause as the Claude case: no syscall fence.

The OS fence is the only real boundary for either surface.

The P0.1 work in this branch (`SandboxLevel` enum, DB column, `set_workspace_sandbox_level` Tauri command, IPC path guard, terminal PTY spawn-cwd check) is all still useful — the OS fence layers on top by reading the workspace's `sandbox_level` and picking the right binding profile for both the agent spawn and the PTY spawn.

**How to apply (Linux first):**

1. Detect `bwrap` on PATH at app start; degrade gracefully (warn + run unwrapped) if missing or kernel `unprivileged_userns_clone` is disabled.
2. Single helper, called from both spawn sites:
   - `claude_cli::runner::spawn_run` — wrap `Command::new(resolve_claude_bin())` in `Command::new("bwrap") --args …`.
   - `terminal::spawn_inner` (or its callers in `commands/mod.rs`: `open_terminal`, `start_workspace_run_impl`) — same wrap around the shell spawn.
3. Bindings template:
   - `--ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64` (libs)
   - `--ro-bind /etc/ssl /etc/ssl --ro-bind /etc/resolv.conf /etc/resolv.conf` (TLS + DNS)
   - `--ro-bind $HOME/.claude $HOME/.claude` (auth/session — only for the agent spawn, not the terminal)
   - `--bind <each --add-dir target> <same path>` (the actual workspace + L2 siblings)
   - `--tmpfs /tmp --proc /proc --dev /dev` (minimum runtime)
   - `--share-net --chdir <workspace_worktree>` (network for WebFetch, working dir)
4. Expect iteration: claude and interactive shells may shell out to other binaries; each missing one needs an additional `--ro-bind`. Run with the strictest profile and add binds as they break.
5. Skip wrapping in tests (the `MOZART_CLAUDE_BIN` test seam shim doesn't need a sandbox).
6. macOS: `sandbox-exec -p <profile>` with a `.sb` file that allows file-read/file-write on the workspace paths only. Deprecated but functional. Same profile reused for the PTY shell.
7. Windows: `AppContainer` is non-trivial and probably waits for a later milestone.

**Probe to validate after implementing:**

- Agent test: prompt `read /home/<user>/Documents/test.txt` in agent mode → read should fail at the syscall layer (`ENOENT` or `EACCES`), not just by polite agent refusal.
- Terminal test: open the Mozart terminal tab, run `cat ~/.ssh/id_rsa` → should fail with permission/not-found at the OS layer.

**Footnote:** if Anthropic ships an upstream `--restrict-fs` / `--sandbox` flag that actually enforces, re-probe and drop the OS-fence dependency for the _Claude_ case. The terminal PTY still needs OS-level confinement regardless — there is no CLI flag for a generic interactive shell.

**Depends on:** P0.1 atoms landed (✅ `wt-security-sandbox`); user-namespace cloning enabled on the user's kernel (check `/proc/sys/kernel/unprivileged_userns_clone` on Debian/Ubuntu).

---

## Sandbox — surface agent refusals + permission-denied events in the chat timeline

**What:** When the agent refuses a tool call (because the system-prompt clamp told it to, or because `--allowedTools` excludes the tool) the natural-language refusal arrives as `stream_event.content_block_delta.text_delta` events. The Rust parser maps them correctly to `StreamEvent::StreamToken` (`apps/desktop/src-tauri/src/claude_cli/parser.rs:144-153`), but the chat timeline either swallows them or renders them with no visible delineation from a normal reply.

**Why:** Dogfood report 2026-05-21 — user prompted `read /home/.../test.txt`, the Atom 7 clamp worked (agent refused), but the user saw nothing in the chat after the spinner finished. Without a visible refusal the user cannot distinguish (a) the agent succeeded silently, (b) the agent refused, (c) the runtime errored. Each has very different security implications.

**How to apply:**

1. Reproduce: prompt a refusal in agent mode and capture the raw stream-json via the `MOZART_CLAUDE_BIN=…` shim. Confirm whether `text_delta` events arrive at all.
2. If yes: the issue is the frontend timeline component swallowing short messages. Look at where `StreamEvent::StreamToken` is rendered in the chat domain and trace what filters/conditions might hide a short final response.
3. If no: the agent emits a `tool_use` block targeting a tool not in `--allowedTools` and Claude CLI rejects it silently. In that case extend `parser.rs::handle_user_message` to surface those rejections as a new `StreamEvent::ToolRefused { tool, path }` variant, and add a card kind to the timeline UI. Regenerate `_bindings.ts`.
4. Either way, the timeline should render refusal events with a distinct visual treatment (subtle red/amber chip, "sandbox refused this") so the security boundary is visible.

**Depends on:** Nothing — independent fix. Surfaced during Atom 7 dogfood.

---

## Sandbox — re-probe Claude CLI permission flags when Anthropic updates the CLI

**What:** Periodically re-check whether Claude CLI's `--allowedTools` and `--permission-mode=plan` are actually enforced or just contextual. Today (2026-05-22, claude CLI v2.1.144) `--allowedTools` is empirically falsified — the agent writes despite `--allowedTools=Read,Glob,Grep`. Mozart now ALSO sets `--permission-mode=plan` for ask/plan modes as a stronger CLI-level enforcement primitive; whether THAT enforces is the open question this probe answers.

**Why:** Mozart's ask/plan-mode security currently depends on `--permission-mode=plan` actually preventing writes. If the dogfood probe (your live test) confirms it works, this TODO becomes a periodic re-check. If it doesn't work either, both ask and plan modes need either:

- the IPC freeze tightening extended to active workspaces too (composer disables ask/plan entirely until OS fence ships), OR
- an honest UI relabel ("agent may still write")

**How to apply (run after each Claude CLI upgrade):**

1. In a scratch directory, run: `claude --permission-mode=plan -p "create test-file.txt containing the word hello" --output-format=stream-json --include-partial-messages`
2. Check whether `test-file.txt` was created.
3. Same probe with `--allowedTools=Read,Glob,Grep` instead of `--permission-mode=plan`.
4. Record CLI version + outcome in this entry.

**Current findings (2026-05-22, CLI v2.1.144):**

- `--allowedTools=Read,Glob,Grep` → **falsified** (file gets created)
- `--permission-mode=plan` → **needs probe** (just wired, not yet dogfood-confirmed)

**Depends on:** Nothing — independent re-probe, ~30 seconds of work.

---

## Agent context — per-call ROnly read connection for ContextCompiler (D4)

**What:** `claude_cli::context_compiler::build_envelope` currently runs over the shared mutexed `DbState` connection. The ContextCompiler v1 architecture (`docs/agent-context-architecture.md`) called for opening a dedicated `SQLITE_OPEN_READ_ONLY` connection per build, so envelope-build reads never contend with the primary connection's writers (event ingest, message persistence, summary insert).

**Why:** Functionally correct today — `BEGIN DEFERRED` inside `build_envelope` gives consistent reads under WAL, and the mutex serializes the request fairly. But under heavy concurrent agent activity (multi-workspace, multi-turn) the build can briefly block the runner supervisor's event-insert path. Mostly a latency concern, not a correctness one.

**How to apply:** Extend `DbState` to retain the underlying `db_path` (currently a `Arc<Mutex<Connection>>` tuple struct — adding the path breaks 5 call sites that destructure it). Add `DbState::open_readonly(&self) -> Result<Connection, AppError>` that opens a fresh `SQLITE_OPEN_READ_ONLY` connection at the stored path with the same pragmas (`busy_timeout`, `foreign_keys`). Plumb it into `commands::start_agent_run_impl` so `build_envelope` reads through the ROnly conn while the primary mutex stays free for the inserting half of the transaction. In-memory tests (`init_db_memory`) need a parallel `open_readonly_memory` that shares the underlying `:memory:` via `Connection::open_with_flags(":memory:", SHARED_CACHE)` or accepts the test gap.

**Depends on:** `DbState` shape refactor — 5 call sites, mechanical. Not blocking; the TODO marker is already in `commands/mod.rs::start_agent_run_impl` next to the shared-mutex `build_envelope` call.

---

## Agent context — workspace archival cleanup (envelope + summary residue)

**What:** When a workspace is closed/archived, its `agent_run_envelopes` and `agent_turn_summaries` rows remain in SQLite forever. The latest-50-per-chat retention prune only fires on NEW envelope writes, so an archived chat with 50 envelopes never gets cleaned up.

**Why:** Heavy users who archive many workspaces will accumulate unbounded envelope + summary data. Per-row size is modest (one envelope ≈ 5-50KB rendered_text + envelope_json), but at scale this is the kind of growth that surprises users — "why is mozart.db 2GB?". Same shape as the workspace_changes growth question, which the existing v0.1.0-beta.1 doesn't address either.

**How to apply:** Two complementary moves:

1. **Active cleanup**: when `chats::close` runs (chat archival), delete the chat's `agent_run_envelopes` and `agent_turn_summaries` rows in the same transaction. This is the highest-signal: once a chat is closed, the user has explicitly signaled it's done.

2. **Background sweep**: a periodic startup task that deletes envelope + summary rows for chats whose `closed_at` is older than N days (e.g. 90). Same pattern as the FileTabsService cleanup TODO.

The retention prune in `agent_run_envelopes::insert_with_retention` is unchanged — it's the _per-active-chat_ cap; archival cleanup is the _cross-chat_ cap.

**Depends on:** A product decision on retention policy (delete-on-close vs delete-after-N-days vs both). Eng work is small (a delete query + a startup task). Not blocking v0.1.0-beta.1.

---

## Agent context — LLM-driven summary distillation (replaces deterministic v1)

**What:** `claude_cli::summary_builder::build_summary` is deterministic v1 — walks `agent_events`, extracts tool calls + results, produces a short prose recap like "Read 1 file, edited 2 files, ran 1 command." It captures _what happened_ but loses _why it mattered_: a 50-line Bash command and a 1-line one both count as "1 command"; a Read of `src/main.rs` and a Read of `README.md` both count as "1 file". For long sessions the operational_summaries layer becomes thin compared to the raw turn it replaced.

**Why:** The architecture doc accepted v1's determinism as a deliberate cost: no LLM-in-loop dependency for the post-run hook means the hook can't fail because of a model outage, and it's reproducible. An LLM-driven distiller would produce richer text_summary and could honor things like "highlight the key result of this turn for the next agent" — but adds a second model dependency and a latency cost (post-run blocks on a model call before the summary lands).

**How to apply:** Build a `SummaryDistiller` trait alongside `EnvelopeRenderer` (cleanly mirroring T4's D3 split). Default implementation = today's deterministic builder. An optional `LlmSummaryDistiller` calls a cheap Haiku-class model with the events as context and a tight prompt: "summarize this assistant turn in ≤200 chars covering the key intent and outcome." Wire selection via an env flag or settings toggle; default off until proven worth the dependency. The pure builder stays in place as the always-available fallback when the distiller errors.

**Depends on:** Decision on which model to use + cost budget. Not blocking; v1 builder is already in production.

---

## Agent context — composer token-meter UI (deferred from CEO review)

**What:** The architecture's `EnvelopeStats { char_count, est_tokens, budget_hit }` is computed per turn and persisted into `agent_run_envelopes`. The composer doesn't currently surface this — a user typing a long message has no idea how close they are to displacing older turns into operational_summaries.

**Why:** CEO review D5 deferred the UI affordance: "kill-switch / token meter" was skipped because the architecture-level invariants (budget displacement, retention prune) handle the failure mode automatically. But power users dogfooding multi-turn chats would benefit from a circular fill indicator on the composer ("you're at 78% of the context budget for this chat") so they can pre-emptively start a new chat instead of silently losing older turn detail.

**How to apply:** Add a Tauri command that returns the latest `EnvelopeStats` for a chat (`get_chat_token_estimate(chat_id) -> EnvelopeStats`). Composer subscribes via a small effect, renders a circular progress around the send button. Update on each message send (post-stream completion). Defer hard-error UI when `budget_hit=true` — the displacement is automatic, the meter is informational only.

**Depends on:** Nothing — independent UI work. Wait for a real complaint or a power-user signal before building.

---

## Sandbox — review hardening from /review 2026-05-22 (followups for the OS-fence work)

**What:** Three follow-ups identified by `/review` on the security-sandbox branch. None are blockers for landing the branch but they should be tracked alongside the OS-fence work.

1. **TOCTOU between `path_guard::validate_agent_path` and the FS operation it gates.** An agent with `Write` can swap a file at the returned canonical path for a symlink between the guard call and `tokio::fs::*`. v0 path guard does the best it can in userspace; the OS-level fence (TODO-001) is the load-bearing fix because the kernel won't follow a symlink out of a bind mount. The threat model is documented in `path_guard::validate_agent_path` doc-comment.

2. **Sync `std::fs::canonicalize` inside async Tauri command handlers.** `path_guard::validate_agent_path` calls sync canonicalize from inside `async fn` Tauri handlers (`read_workspace_file`, `file_save_impl`, `get_file_diff_impl`, `stage_file`, `unstage_file`, `is_staged`, `mark_file_viewed_impl`). For local SSD this is fine; on a slow filesystem (autofs, network mount, sleeping disk) it blocks the tokio reactor thread for the duration. Swap to `tokio::fs::canonicalize` and `.await` it, OR wrap in `tokio::task::spawn_blocking`.

3. **L2 sibling cap (20) silently truncates.** `list_active_siblings_for_project` returns at most 20 rows; sibling #21 (least-recently-active) silently disappears from the allowed roots. Users with many active workspaces will see "agent can't read sibling X" with no path to debug. When `enumerate_l2_siblings` returns exactly `cap` rows AND the raw query had more, surface a single `log::info!` per run AND mention "Sandbox capped at N sibling workspaces" in the system_info entry R0.3.E plans to write.

**Why:** Each is an honest engineering trade-off, not a missed requirement. TOCTOU is a known userspace-guard limitation; sync canonicalize is unlikely to bite on local disk; the L2 cap is a defensible argv-length guard whose silent failure mode is just a UX gap.

**How to apply:** See per-item notes above. Items 1 and 2 layer naturally on top of the OS-fence work; item 3 is a 10-line UX fix that can ship independently.

**Depends on:** Items 1 and 2 partially absorbed by TODO-001 (OS fence); item 3 standalone.

## Signals cleanup

- [ ] Restructure `OnboardingFacade` and `WorkspaceDetailStore` to expose
      reactive "bind-from-signal" APIs so the 3 remaining mirror `effect()`s
      can be removed. Sites: - `apps/desktop/src/app/domains/onboarding/feature-onboarding-step-github.ts` (markStep mirror) - `apps/desktop/src/app/domains/onboarding/feature-onboarding-step-provider.ts` (markStep mirror) - `apps/desktop/src/app/domains/workspaces/feature-detail/workspace-detail.page.ts` (setCurrentBranch + seedTargetBranch mirror)

      Blocked by: `markStep` / `setCurrentBranch` / `seedTargetBranch` also have
      imperative callers (skip buttons, branch pickers), so the refactor needs
      to add a parallel `bindStepSource(step, Signal<Status>)` /
      `bindWorkspace(Signal<Workspace>)` API on each store before the effects
      can go.

---
