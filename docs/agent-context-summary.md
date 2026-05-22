# Agent Context — What Changed and Why

> Companion to [`agent-context-architecture.md`](./agent-context-architecture.md).
> That doc is the spec. This doc is the story.
>
> Status: shipped on branch `wt-agent-audit` as 14 commits (T1–T12 + two
> review follow-ups). Read this first if you want the "what / why / what's
> next" view; read the architecture doc if you want the "exactly how each
> layer is built and rendered" view.

---

## TL;DR

Before this work, every message in a Mozart chat was treated as a fresh
prompt to the agent. The frontend collapsed the entire chat history down
to the latest user message, shipped that single string to `claude -p
<prompt>`, and called it done. Result: agent amnesia. Turn 2 had no idea
what happened in turn 1.

This branch replaces that with a **ContextCompiler** — every agent turn
rebuilds a structured 7-layer envelope from SQLite, renders it with
per-run nonce-framed delimiters, and pipes it to the agent via stdin.
The agent now sees the full conversation state every turn. Forty-five
new tests guard the load-bearing invariants.

The architecture is also provider-agnostic. The Claude CLI is one
renderer behind a trait — swapping in OpenAI, Gemini, or a local model
later is a single new file, not a rewrite.

---

## The problem we fixed

### What users saw

In one Mozart chat:

```
User: My name is Timothy.
Agent: Hi! How can I help you?
User: What is my name?
Agent: I don't have access to that information.
```

The agent didn't have amnesia in the conversational sense — it never
saw the prior message at all. The frontend's `lastUserPrompt(history)`
function picked the most recent `role: 'user'` message and threw the
rest away.

`apps/desktop/src/app/domains/llm-model/data/tauri-claude.adapter.ts`
before the fix:

```ts
const lastPrompt = lastUserPrompt(input.history) ?? '';
commands.startAgentRun(input.workspaceId, lastPrompt, input.mode, channel);
```

The Rust runner then spawned `claude -p <lastPrompt>` as a one-shot
subprocess. No `--resume`, no `--session-id`, no manual history
concatenation. History was persisted in SQLite the whole time — it
just never reached the CLI.

### Why this matters

For a coding-agent product, conversation memory is the product. A
chat where each turn forgets the previous one is roughly useless:
the user can't iterate ("now fix the test that broke"), can't follow
up ("what was the path to that file again?"), and can't trust the
agent's understanding of the task ("you said earlier that...").

---

## The architecture in one diagram

```
User types in composer
         │
         ▼
ChatFacade.sendUserMessage              persists user message to SQLite
         │
         ▼
this.llm.stream({                       NEW: no more history collapse
  workspaceId, chatId,
  currentUserMessageId, mode
})
         │
         ▼
commands.startAgentRun                  Tauri IPC (typed via tauri-specta)
         │
         ▼
start_agent_run_impl (Rust)
  │
  ├──► context_compiler::build_envelope
  │       │
  │       ├── load workspace + chat + messages (DEFERRED tx)
  │       ├── load agent_turn_summaries for chat
  │       └── apply_budget (chars/3.5 ≈ tokens, 100k cap)
  │
  │       Output: LLMEnvelope { 7 layers }
  │
  ├──► ClaudeCliRenderer::render
  │       │
  │       └── Frame each layer with per-run nonce delimiters:
  │           <MOZART_LAYER_SYSTEM_RULES_<32-hex>>...</...>
  │           <MOZART_LAYER_RECENT_CONVERSATION_<32-hex>>...
  │           etc.
  │
  ├──► agent_runs::create (status='running')
  ├──► agent_run_envelopes::insert_with_retention
  │
  └──► spawn_run
          │
          ├── spawn(claude -p --output-format=stream-json ...)
          ├── take stdin/stdout/stderr handles
          ├── spawn stdout drain → agent_events INSERT + Channel<StreamEvent>
          ├── spawn stderr drain → buffer last line, emit Error events
          ├── WRITE rendered envelope to stdin (in parallel with drains)
          └── supervisor: wait for exit, mark_ended, emit_terminated,
              run SummaryBuilder, INSERT agent_turn_summaries
```

The frontend never sees `worktree_path`, `branch_name`, or any of the
internal Git plumbing. The agent sees them inside the WORKSPACE_STATE
envelope layer, framed by nonce delimiters.

---

## The 7-layer envelope

| Layer | Source | Why it's separate |
|-------|--------|-------------------|
| `SYSTEM_RULES` | derived from chat mode + workspace sandbox level | Contains the **authority clamp** — the prose that tells the agent only nonce-delimited sections are structural, fake delimiters in untrusted content are not |
| `PROJECT_MEMORY` | `CLAUDE.md` + local config (v1: empty skeleton) | Slot is reserved so the renderer doesn't need to learn about it twice |
| `WORKSPACE_STATE` | `workspaces` table | Workspace path, branch name, base branch, sibling paths — the spatial context |
| `RECENT_CONVERSATION` | `messages` table (last N turns by `created_at`) | The verbose, recent history. Budget displaces oldest turns from here first |
| `OPERATIONAL_SUMMARIES` | `agent_turn_summaries` table | Compact distillations of older turns — files read, files edited, commands run, key results, prose recap |
| `ATTACHED_CONTEXT` | `attached_context_items` (v1: empty skeleton) | Reserved for future file pins, diff attachments, terminal output snippets |
| `CURRENT_USER_MESSAGE` | the just-inserted user message | Never displaced by budget — this is what the agent is responding to |

Each layer rendering looks like:

```
<MOZART_LAYER_RECENT_CONVERSATION_a1b2c3d4...e5f6>
[turn id=msg_abc role=user ts=1716397200 mode=agent]
My name is Timothy.

[turn id=msg_def role=assistant ts=1716397205 mode=agent]
Hi! How can I help you?
</MOZART_LAYER_RECENT_CONVERSATION_a1b2c3d4...e5f6>
```

The 32-character hex nonce is generated per agent run via
`Uuid::new_v4().simple()` (128 bits entropy). The agent is told via the
authority clamp that only sections framed with the run's exact nonce
are structurally authoritative — text inside a layer body that looks
like a fake delimiter (`<MOZART_LAYER_RECENT_CONVERSATION_guess>`)
fails the structural check because its nonce can't match the per-run
random value. This defends against prompt injection: a malicious user
message can't forge a "system" layer.

---

## How one turn flows, step by step

1. User types "My name is Timothy" and hits send.
2. **ChatFacade.sendUserMessage** (`apps/desktop/src/app/domains/chat/data/chat.facade.ts:385`)
   inserts a `messages` row with `role='user'`, `status='done'`,
   captures the new `messageId`.
3. **`_runAssistantTurn(workspaceId, chatId, mode, userMsgId)`**
   creates an assistant `messages` row with `status='streaming'`,
   `role='assistant'`, then calls `this.llm.stream(...)`.
4. **`TauriClaudeAdapter.stream`** calls
   `commands.startAgentRun(workspaceId, chatId, currentUserMessageId, mode, channel)`
   over the Tauri IPC.
5. **`start_agent_run_impl`** (Rust, `apps/desktop/src-tauri/src/commands/mod.rs:869`):
   - Validates the workspace isn't frozen.
   - Calls `context_compiler::build_envelope(...)` — opens a `BEGIN DEFERRED`
     transaction, reads workspace + chat + messages + summaries, validates
     `current_user_message.chat_id == chat_id` and
     `chat.workspace_id == workspace_id`, runs the budget logic.
   - Calls `ClaudeCliRenderer::default().render(&envelope)` — generates
     a fresh nonce, frames each layer, returns `RenderedEnvelope { bytes,
     nonce, char_count, est_tokens }`.
   - Inserts an `agent_runs` row (status='running') and an
     `agent_run_envelopes` row (with the rendered bytes + the structured
     envelope JSON for audit). Both in one db.lock() pass.
   - Calls `spawn_run(workspace, run, &rendered.bytes, mode, channel, db, emit_terminated)`.
6. **`spawn_run`** (`apps/desktop/src-tauri/src/claude_cli/runner.rs:304`):
   - Builds the argv: `["-p", "--output-format=stream-json", "--include-partial-messages", "--verbose"]`
     plus the sandbox flags. No positional prompt — the envelope goes via stdin.
   - Spawns the child with `Stdio::piped()` on all three pipes.
   - Takes all three handles upfront.
   - Spawns the stdout drain task (parses stream-json lines into
     `StreamEvent` enum values, emits them via the Channel to the
     frontend, persists each as an `agent_events` row).
   - Spawns the stderr drain task (buffers the last non-empty line for
     the exit branch, emits Error events).
   - Writes the rendered envelope to stdin, shuts down the write side.
   - Spawns the supervisor task — polls `cancelled` flag while child is
     alive, then on exit: resolves the final status (`done` / `error` /
     `stopped` / `crashed`), calls `agent_runs::mark_ended`, emits the
     `AgentRunTerminated` event, runs the SummaryBuilder, captures the
     workspace diff if the run succeeded.
7. **Frontend** (`TauriClaudeAdapter.stream`) consumes the Channel —
   each `StreamEvent` flows through `translate(ev)` into an `AgentEvent`,
   the chat facade applies the event via `applyAgentEvent(prevState,
   event)`, the message UI updates reactively.
8. When the supervisor emits `AgentRunTerminated`, the listener in
   `tauri-claude.adapter.ts` pushes a final `terminalEvent(status)` and
   closes the iterator. The facade persists the final message content,
   status, and turn state.

For the **next turn** in the same chat, step 5's `build_envelope` walks
the `messages` table — turn 1's user message and assistant message are
there. Both land in `RECENT_CONVERSATION`. Turn 1's `agent_turn_summaries`
row (written by step 6's supervisor SummaryBuilder) lands in
`OPERATIONAL_SUMMARIES`. The agent sees the full prior turn.

---

## The 12 atoms (T1–T12)

| Atom | Commit | What landed |
|------|--------|-------------|
| T1 | `1a178d8` | Migrations 011 (`agent_run_envelopes` + `prompt_source` column on `agent_runs`) and 012 (`agent_turn_summaries`) |
| T2 | `4e9e19e` | DB modules for both new tables: CRUD + insert-with-retention (50 envelopes per chat) |
| T3 | `ab82791` | `LLMEnvelope` types + `ContextCompiler` (`build_envelope`) with cross-entity validation, budget, fail-closed on missing data |
| T4 | `eedac25` | `ClaudeCliRenderer` with per-run nonce framing, 10 unit tests including forged-delimiter defense |
| T5 | `8b7dfba` | Spawn rewire — `start_agent_run` IPC takes `chatId` + `currentUserMessageId`; rendered envelope flows via stdin |
| T6 | `81e026f` | Frontend — dropped `lastUserPrompt`, widened `LlmStreamInput`, threaded IDs through `chat.facade.ts` |
| T7 | `98774c4` | `SummaryBuilder` (pure fn) + post-run hook writes `agent_turn_summaries` from `agent_events` |
| T8 | `70a0878` | `summary_built` / `summary_skip` telemetry |
| T9 | `10656ee` | `prompt_source` round-trip + DEFAULT-backfill tests + summary out-of-order defense |
| T10 | `2767e28` | End-to-end two-turn recall integration test through the IPC pipeline |
| T11 | `831ec1b` | WAL startup assertion on file-backed init |
| T12 | `cd63c6f` | TODOS.md deferred items + the architecture doc itself committed |

Plus two review follow-ups:
- `3b68739` — `/review` pass: include `crashed` runs in summary hook, align migration 012 docstring with `SummaryBuilder` output.
- `006f9d7` — `/codex` adversarial pass: budget bypass, FK cascade gap, orphan `running` rows, stdin deadlock (the four highest-value findings of the whole review cycle — Codex earned its keep).

---

## Bugfixes worth understanding

These weren't found by tests or by Claude's own review. Codex's independent
adversarial pass surfaced them. Each is a lesson in what the test suite
didn't catch.

### Bug 1 — Budget bypass

**Symptom:** A chat with 200 turns produced ~200 `agent_turn_summaries`
rows. The ContextCompiler loaded all of them via
`agent_turn_summaries::list_for_chat` (no limit). `apply_budget` only
summed `recent_conversation + current_user_message` chars. The summary
layer grew unbounded. The 100k token budget was a polite suggestion,
not an enforced cap.

**Fix:** `apply_budget` now sums summaries too. When the budget is
exceeded, it displaces oldest `recent_conversation` turns first
(they're verbose); once those are exhausted, it drops oldest summaries.
A second pass runs after placeholder synthesis in case the new
placeholders pushed the envelope back over budget.

**Lesson:** "Apply a budget to X" is incomplete without listing every
input X covers. The tests asserted budget-respects-recent-turns; they
didn't assert budget-respects-summaries because the budget didn't
include summaries.

### Bug 2 — FK cascade gap

**Symptom:** A user deletes a repo via `remove_repo`. SQLite cascades
through agent_events → agent_runs → messages → chats → workspaces →
tasks → repos. But the new tables `agent_run_envelopes` and
`agent_turn_summaries` (added in this branch) had FK references with no
`ON DELETE CASCADE`. Step 2 (`DELETE FROM agent_runs`) would fail with
`FOREIGN KEY constraint failed` once a user had run any agent turn on
the repo. Repos with agent activity became un-deletable.

**Fix:** `repos::delete` now deletes both new tables (scoped by
`chat_id`) before the existing cascade chain.

**Lesson:** When you add a new table that references existing tables,
every existing cascade chain that touches those parents is suddenly
broken. The migration tests verified the schema; they didn't verify
that downstream code paths still worked.

### Bug 3 — Orphan `running` runs on spawn failure

**Symptom:** `start_agent_run_impl` writes the `agent_runs` row
(status='running') BEFORE calling `spawn_run`. If `spawn_run` errors
(binary missing, stdin write fails, git_checkpoint blows up), the
supervisor task never starts, `emit_terminated` never fires, and the
row sits at 'running' forever. The frontend shows a phantom spinner.
Analytics accumulate orphans.

**Fix:** Wrap `spawn_run` in a `match`. On `Err(e)`, lock the DB and
call `agent_runs::mark_ended(..., "error", ..., Some(&format!("spawn
failed: {e}")))`, then return the original error.

**Lesson:** "Best-effort cleanup on the unhappy path" needs to live at
every transition between persistent state and a process that might
fail before it can self-clean.

### Bug 4 — stdin pipe deadlock

**Symptom:** Linux pipe buffers default to 64KB. Rendered envelopes
target ~350KB. The runner used to write the full envelope to child
stdin BEFORE spawning the stdout/stderr drain tasks. If the child
wrote enough to stdout during startup to fill its stdout pipe, the
child blocked on stdout. Parent blocked on stdin (the child wasn't
draining its stdin because it was blocked on stdout). Classic two-pipe
deadlock — neither side could make progress until `kill_on_drop` fired
(which won't, because the parent task is alive and stuck).

**Fix:** Take all three pipe handles upfront. Spawn the drain tasks
FIRST so they're consuming output as soon as the child produces it.
Then write stdin. The drain tasks keep the stdout/stderr pipes from
filling, so the child consumes stdin freely.

**Lesson:** Whenever you pipe both directions to a child process,
spawn the readers before the writer starts producing significant data.
The unidirectional `Stdio::piped()` mental model leaks here.

---

## UX impact

### What users see now

- **Two-turn recall works.** "My name is Timothy" → "What is my name?"
  → "Timothy." This is the headline outcome.
- **Follow-up questions work.** "Now fix the test that broke" lands
  with the agent knowing which test, which file, which error.
- **Stop + resume works.** If you stop the agent mid-turn, the partial
  assistant message persists (status='stopped') and is part of the
  next turn's `RECENT_CONVERSATION`. The agent can pick up from where
  it stopped.
- **Restart-survives works.** Close Mozart, reopen, ask a follow-up
  referencing an earlier turn — the context is loaded from SQLite,
  not from the in-memory Angular store.
- **Long chats degrade gracefully.** Past 20 turns or 100k tokens,
  oldest turns get displaced into compact `OPERATIONAL_SUMMARIES`
  entries (files read, files edited, commands run). The agent still
  has a working recap, not a blank.

### What users don't see (deliberately)

- The 7 envelope layers, the nonce delimiters, the authority clamp —
  all internal. The agent sees them; the user doesn't.
- The `agent_run_envelopes` table accumulates the last 50 envelopes per
  chat (retention prune fires in the same transaction as the insert).
  This is a debug artifact; the user has no UI for it.
- The post-run summary distillation runs in the supervisor task after
  every terminated run. No spinner, no notification — it just shows up
  in the next turn's `OPERATIONAL_SUMMARIES` layer.

### Failure modes users do see

- If the ContextCompiler can't load context (current message missing,
  cross-entity mismatch, history load failed), the IPC returns
  `AppError::ContextLoad` with a diagnostic string. The frontend
  renders a fixed "context unavailable for this turn" affordance in
  chat. This is the **fail-closed** posture: a context-free agent run
  is worse than a visible failure.

### What's still rough

- No token meter in the composer (the user can't see how close they
  are to the budget). Tracked as a deferred TODO.
- The 50-per-chat envelope retention prune is the only cleanup. When a
  user archives a workspace, the envelope + summary rows stay around
  forever for that chat's history. Tracked as a deferred TODO.

---

## Provider abstraction — adding the next LLM

This is the part that pays off long-term. The architecture is split
cleanly between **what to send** (provider-agnostic) and **how to send
it** (provider-specific).

### What's provider-agnostic

- `LLMEnvelope` (`apps/desktop/src-tauri/src/claude_cli/envelope.rs`) —
  the typed 7-layer struct. No Claude-specific fields.
- `ContextCompiler::build_envelope` — works for any provider.
- `EnvelopeStats` — char count + estimated tokens + budget_hit flag.
- `agent_runs`, `agent_run_envelopes`, `agent_turn_summaries`,
  `agent_events` — all tables track provider via `agent_run_envelopes.provider`
  (currently always `"claude_cli"`).

### What's provider-specific

- `EnvelopeRenderer` trait (`apps/desktop/src-tauri/src/claude_cli/providers/claude_cli_renderer.rs`):

  ```rust
  pub struct RenderedEnvelope {
      pub bytes: String,
      pub nonce: String,
      pub provider: &'static str,
      pub char_count: usize,
      pub est_tokens: usize,
  }

  pub trait EnvelopeRenderer: Send + Sync {
      fn render(&self, envelope: &LLMEnvelope) -> RenderedEnvelope;
  }
  ```

- `ClaudeCliRenderer` is one implementation. It emits nonce-framed
  delimiters because Claude CLI reads a single text prompt and the
  delimiters are how we let the model parse it back into layers.

- The transport (how the rendered bytes reach the model) is also
  provider-specific. Claude CLI takes stdin; an OpenAI HTTPS API
  would build a `messages: [{role, content}]` array and POST it.

### Adding an OpenAI provider (sketch)

```
1. Add libs/openai-api as a Rust crate (or use reqwest directly).

2. New file: apps/desktop/src-tauri/src/claude_cli/providers/openai_renderer.rs
   - struct OpenAiRenderer { ... }
   - impl EnvelopeRenderer for OpenAiRenderer {
       fn render(&self, envelope: &LLMEnvelope) -> RenderedEnvelope {
           // Build a JSON payload:
           //   { "messages": [
           //       { "role": "system", "content": <system_rules + authority_clamp> },
           //       { "role": "system", "content": <workspace_state + project_memory> },
           //       ... one message per recent_conversation turn,
           //       { "role": "user", "content": <current_user_message> },
           //     ],
           //     "stream": true
           //   }
           // Set provider = "openai", char_count = serialized.len(), etc.
       }
     }

3. New file: apps/desktop/src-tauri/src/claude_cli/providers/openai_runner.rs
   - Replaces spawn_run for OpenAI. Posts to api.openai.com,
     consumes the SSE stream, translates server events into the
     existing StreamEvent enum, writes agent_events rows the same
     way the Claude CLI runner does.

4. Wire selection — start_agent_run_impl reads
   chat.llm_id (currently unused), maps it to a renderer + runner
   pair, threads both through. Default stays claude_cli.

5. Frontend — no change needed. The Channel<StreamEvent> protocol is
   provider-agnostic; the chat facade doesn't know or care which
   model is on the other end.
```

The only Claude-specific decisions the rest of the codebase made are:

- The nonce-delimiter format. OpenAI's role-based message array doesn't
  need delimiters — each role is its own message. So the OpenAI
  renderer wouldn't use nonces; the authority clamp lives in the first
  `system` message instead.
- The `--include-partial-messages --verbose --output-format=stream-json`
  argv. OpenAI uses SSE; the parser would be different.
- The sandbox flags (`--add-dir`, `--permission-mode`, `--allowedTools`).
  OpenAI's API doesn't have these. The OS-level sandbox (deferred —
  see `TODOS.md` "real OS-level filesystem fence") becomes the only
  defense; that work is independent of the LLM-provider question.

The hard work — figuring out **what context to send** — is already done.
Plugging in a new provider is a renderer + a runner. Estimated effort:
2-3 days for OpenAI or Gemini once the API account exists.

---

## What's deferred

Tracked in `TODOS.md`:

1. **Per-call read-only DB connection** (D4) — `build_envelope` currently
   runs through the shared mutexed connection. The architecture called
   for a separate `SQLITE_OPEN_READ_ONLY` connection per build so the
   primary mutex stays free for writers. Functionally correct today
   (WAL gives consistent reads); a latency optimization for heavy
   concurrent agent activity. Tagged TODO in `start_agent_run_impl`
   next to the shared-mutex `build_envelope` call.

2. **Workspace archival cleanup** — `agent_run_envelopes` and
   `agent_turn_summaries` accumulate forever for archived chats. The
   50-per-chat retention prune only fires on new envelope inserts.
   Two-part fix: active cleanup on chat close + background sweep for
   chats closed N days ago.

3. **LLM-driven summary distillation** — v1 SummaryBuilder is
   deterministic ("Read 1 file, edited 2 files, ran 1 command."). An
   LLM-driven version would produce richer `text_summary` at the cost
   of a second model dependency. Designed as a `SummaryDistiller` trait
   alongside `EnvelopeRenderer`.

4. **Composer token meter** — circular fill indicator showing how close
   the current chat is to the budget. CEO-deferred (the architecture
   handles budget automatically; the meter is informational only).

5. **Test coverage** for the four codex-found bugs that didn't have
   tests until the regression guards landed in this branch. The
   takeaway: assert behavior, not just shape. The migration tests
   verified the FK columns existed; they didn't verify the cascade
   still worked end-to-end.

---

## Reading order for new contributors

1. This document — the story.
2. [`agent-context-architecture.md`](./agent-context-architecture.md) —
   the spec. Read in full before modifying any part of the envelope
   shape.
3. The 12 commits in order (`git log main..HEAD --oneline --reverse`) —
   the implementation, one atom at a time.
4. `apps/desktop/src-tauri/src/claude_cli/context_compiler.rs` —
   the load-bearing function (`build_envelope`).
5. `apps/desktop/src-tauri/src/claude_cli/providers/claude_cli_renderer.rs` —
   the rendering boundary. This is where a future provider would slot in.
6. `apps/desktop/src-tauri/src/claude_cli/runner.rs` — the transport
   boundary. Stdin pipe to claude CLI. Same file would gain
   `openai_runner.rs` as a sibling when the second provider lands.

If you find something this doc doesn't explain, please add it. Future-you
will thank you.
