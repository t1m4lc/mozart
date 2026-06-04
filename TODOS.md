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

**What:** `claude_cli::context_compiler::build_envelope` currently runs over the shared mutexed `DbState` connection. The ContextCompiler v1 architecture (`docs/engineering/architecture/context-compiler.md`) called for opening a dedicated `SQLITE_OPEN_READ_ONLY` connection per build, so envelope-build reads never contend with the primary connection's writers (event ingest, message persistence, summary insert).

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

## Workspaces — reconciliation pass for PR-vs-status drift (P1.1 D2 follow-up)

**What:** Self-healing pass that, on app or workspace activation, checks whether the workspace's branch has an open GitHub PR and reconciles the local `ui_status` if it has drifted. Specifically: if `status ∈ {'backlog', 'in_progress'}` AND a PR exists for the branch, flip to `'in_review'`. Closes the rare gap left by P1.1's D2 decision (best-effort flip + warning toast on failure).

**Why:** P1.1 D2 chose A (best-effort flip) over B (reconciliation) to keep scope tight. The accepted path leaves a rare gap: when `commands.createWorkspacePr` succeeds but the subsequent `setStatus('in_review')` adapter write fails, the user sees a warning toast and the PR URL, but on next app launch the badge re-reads from the DB and shows `backlog`. The reconciliation pass closes this without making P1.1 do double duty.

**How to apply:** Add an activation effect that, on workspace switch, queries the existing GitHub probe cache (`apps/desktop-tauri/src/github.rs`) for an open PR against the workspace's branch. Cache the PR-exists result per branch with a short TTL (e.g., 5 minutes) to avoid hammering the API on every activation. If a PR exists AND the workspace status is in `{'backlog', 'in_progress'}`, call `WorkspacesFacade.setStatus(id, 'in_review')` (the early-return idempotency from D4 covers the already-in-review case). Emit a `console.info` for observability; no toast on the auto-flip (the user didn't trigger it).

**Depends on:** P1.1 lands (`WorkspacesFacade.createPr` wrapper from D1; the activation effect can mirror it). Existing GitHub probe machinery in `apps/desktop-tauri/src/github.rs`. PR-exists endpoint (`GET /repos/{owner}/{repo}/pulls?head={branch}`) — currently unused in Mozart; would be the new external call.

---

## Workspaces — guided "Link this repo to GitHub" flow (P1.1 D10)

**What:** Recovery path for users on local-only or non-GitHub-remote workspaces who want to use the PR workflow. P1.1 D9 added the DETECTION gate (Create PR is disabled with a useful tooltip when the workspace's origin isn't GitHub). D10 captures the linking flow that turns the disabled state into a guided fix: detect → CTA "Link this repo to GitHub" → dialog (repo name / visibility / org) → Rust command creates the GitHub repo via REST → set origin → push initial branch → unlock the PR action.

**Why:** D9 closes the detection gap (no more click→fail), but a local-only Mozart user still has no in-app path to becoming a GitHub user. Today they'd have to leave Mozart, run `git remote add origin git@github.com:...` (or create the repo on github.com first), then come back. The guided flow is a sibling of the existing `connect_github` token flow — same shape, different verb (create repo + set remote instead of validate token).

**How to apply:** Surface the "Link to GitHub" CTA inside the disabled-state tooltip (or as a separate empty-state surface on the merge action menu when `!isGithubRemote`). Dialog asks for: repo name (default = workspace name), visibility (private/public), owner (user or org). New Rust command `create_github_repo` mirrors `connect_github`'s structure: `POST /user/repos` (or `POST /orgs/{org}/repos`), parse response, set origin via `git remote add origin <html_url_or_ssh>`, push current branch. After success, the existing `parse_github_remote` detection from D9 re-runs and the PR action becomes available.

**Depends on:** D9 detection landed (provides the `isGithubRemoteFor` signal and the entry point UI surface); existing GitHub REST machinery in `apps/desktop-tauri/src/github.rs` (token already validated); decision on org-vs-user scoping (do we surface org selection in v1 or default to the authenticated user?).

---

## desktop-e2e — Playwright PR-workflow coverage (P1.1 T13)

**What:** Build the Tauri-mock infrastructure for `apps/desktop-e2e` and write `pr-workflow.e2e.spec.ts` covering the four cases the P1.1 test plan called out: (1) connected + backlog → in_review happy path, (2) disconnected gate (primary disabled + tooltip), (3) mid-flow disconnect (kill token while dialog is open → submit reactively disables), (4) non-GitHub-remote gate (tooltip reads "This repo isn't on GitHub").

**Why:** P1.1 shipped with strong unit + component coverage (42 tests across `workspace.facade.spec.ts`, `merge-action-menu.spec.ts`, `feature-create-pr-dialog.spec.ts`) so the contract is locked at every boundary the dialog crosses. The E2E layer would add genuine integration coverage — proving the Angular boot, Tauri command roundtrip, signal wiring, and dialog lifecycle work as a single flow — but it can't be built in P1.1's scope because the infra simply isn't there.

**How to apply:** Three pieces, in order. (1) Wire `@tauri-apps/api/mocks` (`mockIPC`) into a web-mode boot path so the Angular app survives without a real Tauri runtime — likely a new `apps/desktop-e2e/src/setup-mocks.ts` plus a build-time env var the app reads. (2) Stub the commands the boot + PR flow needs: `list_repos`, `list_workspaces`, `list_tasks`, `has_github_token`, `is_github_remote_for_project`, `create_workspace_pr`, `commit_workspace`, `set_workspace_ui_status`, plus the deep-link / auth callbacks if a connect-flow case is in scope. (3) Write the four-case spec against fixture projects (a GitHub-origin one and a non-GitHub one) using the stable selectors from the merge-action-menu and create-pr dialog — the unit specs already establish the assertion surface, just lift it to Playwright `getByRole`/`getByText` queries.

**Depends on:** P1.1 landed (so the targets exist). `@tauri-apps/api` is already a dependency, but `@tauri-apps/api/mocks` may need an explicit re-export or import path check. Decision on whether to keep the example `src/example.spec.ts` placeholder or delete it as part of the same change.

---

## P1.2 — Manual refresh button on Changes header (skipped during eng review)

**What:** A small refresh icon at the right of the Staged/Unstaged section header that calls `repos.refreshChangedFilesInBackground(workspaceId)`.

**Why:** The investigation doc §2.2 proposed it as an "escape hatch." Eng review concluded it's cargo-culted: the FS watcher + `softRefreshAfterMutation` on mutations + always-refresh-on-activation (the new `refreshedSinceHydration` flag in §7.2) already cover real cases. Build only if a user reports stale lists.

**How to apply:** ~10 lines in `feature-changes-list.ts` header template + a `manualRefresh()` protected method. Trigger condition: a user complaint or telemetry showing snapshot-vs-real divergence.

**Depends on:** Real user signal. Not blocking.

---

## P1.2 — Throttle snapshot writes on heavy workspaces

**What:** Add `throttle: 500` (or similar) to `withStorageSync` config for the FileTreeCache's persisted changed-files slice.

**Why:** With 500+ changed files (≈ 60 KB JSON) and the watcher's ~200ms debounce, sustained worst case is ~5/sec × 60 KB main-thread JSON.stringify ≈ 300 KB/sec. Imperceptible at the typical 5–50 files. Worth defending against if/when heavy-monorepo users dogfood Mozart.

**How to apply:** Measure first via Performance > Long Tasks panel. If a real workload stutters, pass `throttle: 500` on the `withStorageSync` block in `file-tree-cache.store.ts`. Tradeoff: snapshot can be up to 500ms stale on crash.

**Depends on:** Telemetry or user signal.

---

## P1.2 — localStorage QuotaExceededError UX

**What:** Add a defensive try/catch around `withStorageSync` write paths and surface a one-time "your tab/snapshot state hit the storage cap" toast or banner.

**Why:** Codex eng-review outside voice flagged this. Today `withStorageSync` swallows `QuotaExceededError` silently — the in-memory state moves forward but the persisted slice doesn't, producing a "snapshot says X today, but on reload says Y" inconsistency. Critical gap (per the eng-review §7.8) but low real-world probability with the 3 MB / 50-workspace headroom math.

**How to apply:** Wrap the `withStorageSync` adapter (or write a sibling util) that catches quota errors. Surface via toast + suggest clearing localStorage from settings.

**Depends on:** A real user hitting the cap, OR a deliberate hardening pass.

---

## P1.3 — Multi-window withStorageSync contention

**What:** `withStorageSync` doesn't listen to the browser `storage` event today, so two Mozart windows would last-write-wins each other's tab list + snapshot.

**Why:** N/A in v0.1.0-beta.1 because `tauri-plugin-single-instance` enforces one window. When Mozart spawns secondary windows (e.g., detached editor view), the storage layer needs `storage` event listening or a leader-election strategy.

**How to apply:** When the multi-window feature lands, add a `storage`-event subscription that re-hydrates affected slices on remote writes. Test by manually firing `storage` events in DevTools.

**Depends on:** Multi-window product decision. Not in scope today.

---

## P1.3 — FILE_TAB_CAP soft ceiling + eviction policy

**What:** Reintroduce a soft cap on `FILE_TAB_CAP` (e.g. 100) with FIFO eviction on the persisted slice once we see real session sizes.

**Why:** Codex flagged: removing the cap entirely is a latent memory + rendering risk. Today's existing FIFO eviction code in `file-tabs.service.ts:53–58` will be deleted as part of P1.3. Re-add a defensive ceiling once we observe usage patterns.

**How to apply:** Add a configurable cap (default 100). On `openFor`/`previewFor`/`pinFor`, if the list exceeds cap, evict the **oldest pinned** tab (not preview — preview is replaced in-slot). Persisted slice automatically stays bounded.

**Depends on:** Real session-size observation (telemetry or self-dogfooding).

---

## P1.3 — Proactive stale-tab-path prune on activation

**What:** New Tauri command `existsByPath(ws, paths[]) -> bool[]`. On workspace activation, drop persisted tab paths that no longer exist on disk.

**Why:** Eng review chose to rely on the existing `feature-file-content.ts:121–139` open-time "Couldn't open file" + Retry banner instead of a proactive prune. Add only if users complain that stale tabs linger in the bar after a session-spanning rename/delete.

**How to apply:** Rust: batched `tokio::fs::metadata` over the path list. TS: `FileTabsService.pruneStale(ws)` triggered by an effect on workspace activation.

**Depends on:** Real UX feedback that stale tabs are annoying.

---

## Desktop — True Playwright + Tauri-webdriver E2E suite

**What:** Add an `apps/desktop-e2e/` Nx project with `@nx/playwright:configuration`, targeting the running desktop app via Tauri's webdriver harness.

**Why:** Eng review chose Angular component integration tests for the P1.3 preview/pin chain coverage. That covers ~10 of 13 E2E-worthy paths. The remaining 3 (cold reload paint, save→Changes ≤100ms in real Tauri build, `git mv` from terminal) get a manual checklist for now.

**How to apply:** When the desktop binary distribution pipeline lands (see existing Landing TODO), wire Playwright pointed at `pnpm nx serve desktop` + Tauri webdriver. Start with the 3 manual-checklist scenarios.

**Depends on:** Distribution pipeline OR a deliberate decision that the manual checklist isn't enough.

---

## Diff view — function-scope suffix on hunk row (post P2.4)

**What:** Real `@@` headers in unified diffs often carry a function/scope suffix — e.g. `@@ -120,7 +120,8 @@ class FooBar:` or `@@ -10,3 +10,3 @@ fn render()`. Today the parser keeps the whole header in `DiffHunk.header` but doesn't split out the suffix. P2.4 replaces the hunk-row text with "N lines above" and drops this suffix. Add it back as secondary context once the human label format is live.

**Why:** For code reviewers (a real-but-not-primary Mozart audience), the function-scope suffix is the single most valuable piece of context on a hunk header — it tells you what symbol is being modified without scrolling. GitHub, GitLab, and every modern diff UI surface it. Mozart's P2.4 chose human-readable framing first; this is the addback for git-literate users.

**How to apply:** (1) In `libs/mozart-ui/diff-parser/src/lib/diff-parser.ts` extend `HUNK_HEADER_RE` to capture the trailing text after the closing `@@`. Expose as `DiffHunk.scopeHint?: string` (undefined if empty/whitespace-only). (2) In `libs/mozart-ui/diff-view/src/lib/cm-diff-extensions.ts`, when `scopeHint` is present, append it to the hunk-row label: `"class FooBar  ·  120 lines above"`. (3) Extend `cm-diff-extensions.spec.ts` (created by P2.4/P2.5) with 2-3 cases covering the suffix path.

**Depends on:** P2.4 + P2.5 landed. ~30 min CC work.

---

## Diff view — spec coverage for trailing-gap ExpandBarWidget

**What:** `cm-diff-extensions.ts:269–334` defines `ExpandBarWidget` — the full-width strip used at the trailing gap (below the last hunk) and at any inter-hunk gap where the new per-row gutter button doesn't apply. It's visually parallel to the wider `HunkButtonMarker` P2.5 builds. P2.4/P2.5 adds `cm-diff-extensions.spec.ts` covering the new code; this TODO extends that spec to cover `ExpandBarWidget` too.

**Why:** The new spec file gives us a natural home. `ExpandBarWidget` has been stable in production but is untested. Folding its coverage in while the spec is fresh is much cheaper than greenfielding it later.

**How to apply:** Extend the spec file P2.4/P2.5 creates with: (1) `eq()` distinguishes by gapIndex + direction + linesAvailable; (2) `toDOM()` renders up button only when direction is 'up' or 'both'; (3) down button only when 'down' or 'both'; (4) disabled state when linesAvailable === 0; (5) shift-click doubles the step. ~15 min CC.

**Depends on:** P2.4 + P2.5 landed (spec file created).

---

## Composer — per-chat draft persistence (blocked on multi-chat workspaces)

**What:** Save composer draft text per chat (per workspace), so switching active chats or reloading the app restores what was typed but not sent.

**Why:** After P2.2 the composer is always mounted; draft text survives tab switches for free. But switching the workspace's active chat (once multi-chat lands) or reloading the app still loses the draft. Today every workspace has exactly one chat, so persistence is invisible — the moment a chat picker ships, the missing draft becomes a trust-shaped paper cut.

**How to apply:** Add a draft slice to `UiStateFacade` keyed by `chatId`. `FeatureWorkspaceComposer.value` reads/writes through that facade instead of a local signal. Add an eviction rule when a chat or workspace is deleted (so orphan drafts don't pile up in persisted state). Verify with a unit spec covering save → reload → restore + a regression spec for orphan eviction.

**Depends on:** Multi-chat-per-workspace UI / chat picker. Not blocking P2.2.

---

## desktop-e2e — Tauri-mocking infra for Playwright specs

**What:** Build the test harness that lets the desktop app boot under Playwright in browser-only mode. Today `apps/desktop` boots via `provideTauriAdapters()` which calls `invoke()` against the Tauri runtime at module init; under `pnpm nx serve desktop` (which Playwright drives) those calls reject and the app never reaches a usable state. The current `apps/desktop-e2e/src/example.spec.ts` looks for `<h1>Welcome</h1>` — text that does not exist in the app — confirming nobody has actually run the e2e suite end-to-end.

**Why:** Without this infra, every plan that promises Playwright coverage (`/plan-eng-review` has been emitting these consistently — P2.2 D5 was the most recent) lands with only the unit-spec layer of coverage. Integration flows that span Tauri commands, signals, scroll DOM, and router can't be locked in. Each PR that defers e2e is small; the cumulative gap is large.

**How to apply:** Two paths. (a) Provide a `provideMockAdapters()` alongside `provideTauriAdapters()` and wire it in via an env flag (`E2E_MODE=mock` → swap providers in `app.config.ts`). The mocks live next to `WORKSPACES_MOCK` and friends; bootstrap fixtures via Playwright `beforeAll`. (b) Drive a real Tauri instance via `tauri-driver` + `webdriverio` (heavier, but no behavior divergence). Recommend (a) for P2.2-scoped flows where data shape matters more than Tauri-command correctness.

**Concrete first commits when this lands:**
- Replace `example.spec.ts` with a smoke spec that asserts the actual workspace-list landing renders.
- Two specs for P2.2 (per `docs/tmp/2026-05-24-shell-ux-investigation.md` §2.6 T5): fresh-workspace first send from a file tab; streaming auto-follow round-trip across a chat→file→chat tab switch.

**Depends on:** Nothing — pure infra work. Pulls forward as soon as someone needs reliable e2e (likely the next plan-eng-review that flags it).

---

## Composer — "talking to chat X" indicator on file tabs (blocked on multi-chat workspaces)

**What:** Render a small affordance next to the composer (e.g. `→ Chat: My-chat-name`) when the active tab is a file tab AND the workspace has more than one chat — so the user knows where a Send will land before pressing it.

**Why:** P2.2 makes the composer always visible. Send routes to the workspace's active chat regardless of which tab is open. With one chat per workspace that's unambiguous; with two or more, it's invisible routing. The original shell-UX investigation already flagged this as a `risks` note: "surface a small indicator if ambiguity matters."

**How to apply:** Bind to `_activeChat()` (already wired in `FeatureWorkspaceComposer`); render the chip only when `tab().kind === 'file' && chatsByWorkspace(workspaceId).length > 1`. Click on the chip should navigate to that chat's tab. Add a unit spec for the visibility gate (single-chat → hidden; multi-chat + file tab → visible).

**Depends on:** Multi-chat-per-workspace UI. Pure no-op today; safe to ship the gate code alongside P2.2 if multi-chat is on the near horizon, otherwise defer.

---

## Drafts — compression for very large files (P1.3 follow-up)

**What:** Compress drafts content (e.g. gzip via `fflate`, or LZ-string) inside `DraftsStore` before persisting to localStorage. Worker-write is dropped because `Storage` isn't exposed to dedicated workers, so debounced writes carry us today — but a single ~5MB binary file still serializes 5MB on each flush.

**Why:** Speculative until measured. Most code files are <100KB and the 500ms debounce already keeps the main thread responsive. Becomes relevant when the first user types into a very large file (markdown novels, generated SQL dumps) and notices a jank on the flush. Compression keeps localStorage headroom for multi-MB drafts without bumping to IndexedDB.

**How to apply:** Wrap `JSON.stringify` + `setItem` in `DraftsStore.flushNow` with `compressToUTF16` (or fflate's `gzipSync`). Mirror inverse on hydrate. Compression dep adds ~5KB to the desktop bundle.

**Depends on:** First user report of jank on large-file edits. Don't pre-empt.

---

## WorkspaceMutationsFacade — migrate other post-mutation choreography (P1.3 follow-up)

**What:** The new `WorkspaceMutationsFacade.softRefreshAfterMutation(workspaceId)` centralises tree/changedFiles/diffStats/fileViews refreshes for stage/discard/save. Other workspace-level mutation flows (commit success, merge success, PR create success, branch switch) currently fire their own ad-hoc fan-outs.

**Why:** Adding a fifth refresh later is a one-line change inside the facade vs grepping every consumer. Centralising prevents drift between mutation paths (one path forgets to refresh diff stats, another double-refreshes).

**How to apply:** Audit `WorkspacesFacade.commitWorkspace`, `createPr`, `merge_workspace_locally`'s post-flip step, and any branch-switch handlers. Move their refresh calls into `WorkspaceMutationsFacade` methods (`afterCommit`, `afterPrCreated`, `afterMerge`, `afterBranchSwitch`). Pass extra context (e.g. PR URL) only as side-effect parameters, not as the central choreography.

**Depends on:** Next PR that touches one of those flows — wedge the migration opportunistically.

---

## Drafts — multi-window contention strategy (P1.3 follow-up)

**What:** When Mozart spawns secondary windows, two windows editing the same file will race-overwrite drafts in `mozart-drafts-v1` localStorage. Today single-instance via `tauri-plugin-single-instance` so this is N/A.

**Why:** The general multi-window concern was already captured (under the P1.2 storage section) but drafts have a unique edge: the data is keystroke-frequent and per-(ws, path), so "last writer wins" feels broken (one window's typed paragraph silently vanishes when the other window flushes).

**How to apply:** Two paths when multi-window lands. (a) `BroadcastChannel('mozart-drafts')` — windows post draft updates to each other; each `DraftsStore` mirror updates in real time. (b) Storage `storage` event listener — passively detects writes from other windows, hydrates the in-memory mirror, surfaces a conflict UX if the local buffer also moved. Recommend (a) for liveness; (b) for the silent-conflict detection.

**Depends on:** Multi-window roadmap. Not until then.

---

## File diff card — `changed_since_viewed` indicator parity (P1.4 follow-up)

**What:** The legacy `FeatureFileToolbar` rendered an amber "changed since viewed" chip next to the Viewed checkbox when `FileViewsFacade.entryFor(...)` returned `state === 'changed_since_viewed'`. After P1.4 the Viewed surface moved to `MzFileDiffCard`'s header, which has no equivalent drift indicator today.

**Why:** Reviewers who marked a file Viewed and then the agent edited it again currently see no signal in the diff card that the file moved under them. The information is still in the store; we just stopped rendering it.

**How to apply:** Add an optional `viewedDrift: boolean` input to `MzFileDiffCard`. When true, render a small `lucideRotateCcw` glyph (matching the legacy chip) next to the Viewed button with a tooltip "Changed since you reviewed it". Wire from `feature-file-diff.ts` by reading `FileViewsFacade.entryFor(ws, path)?.state === 'changed_since_viewed'`.

**Depends on:** None. Self-contained; ship after the first user report of a missed re-review.

---

## Diff view — Unified/Split layout home (P1.4 follow-up)

**What:** The legacy `FeatureFileToolbar` exposed a Unified/Split layout toggle for the diff body. `MzFileDiffCard` doesn't surface one today; `MzDiffView` still has the underlying hooks. The toggle has no home in the new file-tab UX.

**Why:** Some users prefer split-diff for wide screens. We dropped the toggle in P1.4 to keep the header focused; we did NOT remove the capability. Decide where it lives so we can re-enable it.

**How to apply:** Options. (a) New `[mzFileDiffCardLayoutTrigger]` projection slot in the card header — caller renders the unified/split tabs. (b) Add a `layout: 'unified' | 'split'` input + a `(layoutChange)` output to `MzFileDiffCard`; render the toggle inside the card's actions slot. (c) Move the toggle to a workspace-level setting (one preference applies to all files). Recommend (a) for v1 — least design-system commitment.

**Depends on:** First user request for split diff in file tabs.

---

## Changes tab — per-row Discard via context menu (P1.4 follow-up)

**What:** The legacy `FeatureFileToolbar` had a `showDiscard` input that was off everywhere; the per-file Discard button never shipped through that surface. After dropping the toolbar, the affordance has no plumbing.

**Why:** Per-file Discard is a legitimate flow (revert one file's edits while keeping others). The right home is the Changes-tab row context menu — same surface that hosts stage/unstage per row (`feature-changes-list.ts:242–289`). That keeps mutation actions colocated with the file list.

**How to apply:** Wire a `discard` action on the `UiChangesContextMenu` bound rows. Calls `RepositoriesFacade.discardChangedFile(workspaceId, path)` (already exists per the P1.2 design). Confirm dialog optional — match the staging UX.

**Depends on:** None. Self-contained polish.

---

## LLM pipeline — provider-agnostic refactor (multi-provider router)

**What:** Rename `apps/desktop-tauri/src/claude_cli/` → `llm_runners/claude_cli/`, extend `AgentEvent` union with `run.*`, `tool.*`, `file.*`, `command.*`, `mcp.*` variants, introduce an `LlmProviderRouter` (libs/desktop-llm-model-data-access) that dispatches by `chats.llm_id`, add a 2nd adapter (Codex/OpenAI or Anthropic Messages API).

**Why:** Today the pipeline is implicitly coupled to Claude CLI — directory naming, Rust `StreamEvent` shape calqué on what Claude emits, no `providerId` on `commands::start_agent_run`. The full audit lives in `docs/tmp/2026-05-25-provider-architecture-and-timeline-refactor.md` §1.3. The architecture is already ~70% provider-agnostic (LlmAdapter port, AgentEvent canonical, EnvelopeRenderer Rust trait), so the lift is mostly renames + additive types + 1 sibling Rust module.

**How to apply:** Follow `docs/tmp/2026-05-25-provider-architecture-and-timeline-refactor.md` §5.1, §5.2, §5.4 (sections marked [DÉFÉRÉ]). 4 incremental PRs: (1) renames, (2) AgentEvent v2 additive, (3) router DI, (4) Codex adapter + fixtures. Trigger: concrete decision to integrate a 2nd provider (Codex CLI or Anthropic API direct).

**Depends on:** A concrete intention to ship a 2nd provider. Until then this is theoretical complexity — defer.

---

## Timeline renderers — DRY the icon-state computation

**What:** Every timeline renderer (`file-edit`, `file-create`, `file-read`, `shell`, `search`, `thinking`, `generic`) duplicates the same `_iconClass` computed: `state === 'error' ? 'text-destructive' : state === 'active' ? 'text-foreground' : 'text-muted-foreground'`. Factor into a shared util `iconClassForState(state)` (or a Spartan-style directive).

**Why:** Pre-existing duplication, made slightly worse as Étape 3 (UX timeline) extends the per-item expand pattern to more renderers. Trivial mechanical refactor that pays off whenever a new renderer lands.

**How to apply:** Create `libs/mozart-ui/timeline/src/lib/_icon-state.util.ts` exporting `iconClassForState(state: TurnItemState): string`. Replace inline computed in each renderer with a call. Single-commit grep-and-replace ; tests existants restent verts.

**Depends on:** Étape 3 (UX timeline) mergé first to avoid merge conflicts on the touched renderers.

---

## Timeline — MCP-aware renderer

**What:** Add a dedicated `mcp-call-renderer.ts` (libs/mozart-ui/timeline) that surfaces server name + tool name distinctly when a tool call originates from an MCP server (e.g. `mcp__nx-mcp__nx_docs` today shows up as a `generic` tool).

**Why:** MCP tool names are encoded as `mcp__<server>__<tool>` strings. Today they hit `mapToolNameToKind` and fall to `generic` because no rule matches. A dedicated renderer would give an instant read on "which server, which tool" instead of an opaque mono-name. Useful as MCP usage grows.

**How to apply:** Depends on the LLM pipeline refactor above (specifically `AgentEvent` v2 with `tool.started.source: 'mcp'` + dedicated `mcp.*` variants). Once those land: add `'mcp'` to `TurnItemKind`, add row in `TOOL_RENDERERS` registry + `TOOL_ROLES` (probably `'detail'`), write the renderer that parses the `mcp__server__tool` name pattern. Total ~1 file + 2 registry lines.

**Depends on:** LLM pipeline provider-agnostic refactor (TODO above).

---

## Workspaces — editable PR base branch

**What:** Let the user change a workspace's base/PR-target branch and have it actually take effect. Persist the chosen branch to `workspace.base_branch` so `create_workspace_pr` and `merge_workspace_locally` (both read `ws.base_branch`) use it.

**Why:** §7 Q8 ("how should the user change the PR base branch"). Today's toolbar picker was *decorative* — `workspace-detail.store.setTargetBranch` only patched a UI signal, never persisted — so it was retired in the design review (D1) in favor of a read-only `base: main` chip. Restoring real edit-ability needs a deliberate design pass.

**How to apply:** Decide the semantics first: a worktree's *fork point* is immutable, but the *PR target* can differ from the fork point. So this is "change the PR target", not "re-fork". Add a `set_workspace_base_branch` command (persist `base_branch`), an editable affordance on the base chip, and make the PR dialog show/confirm the target. Verify create_pr opens against the new value.

**Depends on:** The read-only base chip (design-review D1) shipping first.

---

## Workspaces — richer source-repository info popover

**What:** A popover/panel off the toolbar project crumb showing repo path + default branch + GitHub remote status, with a "Reveal in file manager" action. The "Open on GitHub" slice already shipped (the project crumb is now a button that opens the repo URL).

**Why:** §7 ("how should the user access the source repository"). "Open on GitHub" is done; the remaining gap is seeing the repo path / default branch / opening the local folder without leaving Mozart.

**How to apply:** Wrap the project crumb in a popover (Spartan) showing `repo.path`, the default branch, and `GithubRemoteStatus`. Add a Tauri command to reveal the path in the OS file manager (none exists yet) for the "Open folder" action; "Open on GitHub" already uses `ExternalLinkService`. Keep it calm/app-UI, not a new page.

**Depends on:** A reveal-in-file-manager Tauri command (new) for the "Open folder" action.

---
