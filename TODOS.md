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

## Codebase hygiene — rename `core/shell.service.ts`

**What:** `apps/desktop/src/app/core/shell.service.ts` wraps `@tauri-apps/plugin-shell` for `openExternal`. It is NOT related to the UI shell (`apps/desktop/src/app/shell/`). With the shell folder getting cleaned up via the new `shell-side-panel` primitive, the name collision becomes more confusing for new readers.

**Why:** Future-you opens `shell.service.ts` expecting UI-shell logic and finds Tauri openExternal instead. Code-search for "shell" returns mixed results.

**How to apply:** Rename to `ExternalLinkService` (preferred) or `TauriShellService`. Move to `apps/desktop/src/app/core/external-link.service.ts`. Update all call sites (`grep -r ShellService apps/desktop/src --include="*.ts"`). One PR, low risk.

**Depends on:** Nothing. Standalone refactor — anyone can do it.

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

**What:** Wrap the `claude` subprocess in an OS-level sandbox so its `Read`/`Bash` tools physically cannot reach paths outside `~/.mozart/worktrees/<scope>`. Linux first via `bubblewrap`, then macOS via `sandbox-exec`, then Windows via `AppContainer`.

**Why:** Empirically falsified 2026-05-21 — Claude CLI's `--add-dir` is **contextual, not enforced**. The probe (MOZART_CLAUDE_BIN shim) confirmed Mozart sends the correct argv (`--add-dir`, `--permission-mode=acceptEdits`, `--allowedTools`, `--append-system-prompt` clamp) but the agent still reads any OS-readable path because nothing blocks the syscall. The Atom 7 system-prompt clamp now makes the agent refuse politely, but a jailbreak prompt would bypass it. The OS fence is the only real boundary.

The P0.1 work in this branch (`SandboxLevel` enum, DB column, `set_workspace_sandbox_level` Tauri command, IPC path guard, terminal PTY guard) is all still useful — the OS fence layers on top by reading the workspace's `sandbox_level` and picking the right binding profile.

**How to apply (Linux first):**

1. Detect `bwrap` on PATH at app start; degrade gracefully (warn + run unwrapped) if missing or kernel `unprivileged_userns_clone` is disabled.
2. In `apps/desktop/src-tauri/src/claude_cli/runner.rs::spawn_run`, wrap `Command::new(resolve_claude_bin())` in `Command::new("bwrap")` with:
   - `--ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64` (libs)
   - `--ro-bind /etc/ssl /etc/ssl --ro-bind /etc/resolv.conf /etc/resolv.conf` (TLS + DNS)
   - `--ro-bind $HOME/.claude $HOME/.claude` (auth/session — needed for the API key in keyring fallback)
   - `--bind <each --add-dir target> <same path>` (the actual workspace + L2 siblings)
   - `--tmpfs /tmp --proc /proc --dev /dev` (minimum runtime)
   - `--share-net --chdir <workspace_worktree>` (network for WebFetch, working dir)
3. Expect iteration: claude may shell out to other binaries; each missing one needs an additional `--ro-bind`. Run with the strictest profile and add binds as they break.
4. Skip wrapping in tests (the `MOZART_CLAUDE_BIN` test seam shim doesn't need a sandbox).
5. macOS: `sandbox-exec -p <profile>` with a `.sb` file that allows file-read/file-write on the workspace paths only. Deprecated but functional.
6. Windows: `AppContainer` is non-trivial and probably waits for a later milestone.

**Probe to validate after implementing:** run the same dogfood test that surfaced the gap — `read /home/<user>/Documents/test.txt` in agent mode. With OS fence active, the read should fail at the syscall layer (`ENOENT` or `EACCES`), not just by polite agent refusal.

**Footnote:** if Anthropic ships an upstream `--restrict-fs` / `--sandbox` flag that actually enforces, re-probe and drop the OS-fence dependency for the typical dogfood case. The fence then becomes belt-and-braces rather than the only layer.

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
