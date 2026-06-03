# Local / open-source model support in Mozart — fresh rethink

> **Intended use:** paste this into `/plan-ceo-review` (or read it as the brief)
> on a **new branch started from `main`**. A first spike
> (`spike/local-llm-transport`) is being abandoned — see "Why we're restarting".
> Keep this file as the kickoff brief; don't carry the spike's code.

---

## The essential product need
Let users run **open-source models inside Mozart**, with an experience close to how
they use Claude Code today:
- Choose a local/open-source model **during onboarding**, and **download** it there.
- Use it for agentic coding (read/edit files, run commands, iterate → diff), like Claude Code.
- **Minimal external tools.** Don't make users install/manage a stack of things.
- **Simple, integrated, smooth.** Local models should feel native to Mozart.
- **Optional & non-blocking.** Not everyone wants local models; the default install
  stays fast; onboarding must finish even with **no provider configured**
  (exploration mode); local is a path you opt into, never a gate.

## Why we're restarting (critical learning)
The first spike implemented local support by **driving the OpenCode CLI over ACP**,
with Ollama as the model backend. We are dropping that approach:
- **OpenCode is now a direct competitor** (its own desktop app). Mozart must **not
  depend on it or promote it** — not as a required install, and not bundled.
- The spike also accumulated a lot of legacy. Cleaner to restart from `main`.

## Hard constraints / principles (carry these into any plan)
- **No dependency on OpenCode** (or any competitor agent app).
- **No heavy bundling.** No large binaries or models shipped in the app; base install
  stays small and fast.
- **End users need no toolchain.** macOS/Windows/Linux users run the **distributed
  binary** — no Rust/Node/build tools to *use* Mozart (those are dev-only).
- **Provider-based architecture.** Today: Claude Code (default), Local (this work),
  Mozart Cloud (future, vision only) — so Cloud slots in later behind the same seam.
- **Transparent, reversible dependencies.** Anything installed/downloaded via Mozart
  must be explicit, user-confirmed (no silent installs/downloads), in user-level
  locations, documented, and removable. **Mozart should manage only models**, not
  heavy external runtimes.
- **Signing reality:** builds are Tauri-updater-signed but **not** Apple-notarized /
  Windows-Authenticode (Gatekeeper/SmartScreen apply). No OS code-signing yet.
- **Don't touch production flows:** web/landing auto-deploy; desktop release via `v*`
  tags. (A manual signed *staging* build workflow was designed but deferred — see
  `~/.claude/plans/i-said-staging-but-snazzy-ladybug.md`.)

## Reusable assets already in Mozart (concepts worth keeping; the spike proved them)
Most of the spike is reusable — only the **OpenCode agent harness** is being discarded.
- **Provider-neutral agent seam (Rust):** a `ProviderTransport` trait, a shared run
  **supervisor** (terminal-state machine), a canonical **`StreamEvent`** the UI
  consumes, and a summary builder. Built specifically so a second provider can plug in.
  (Claude path = drive the `claude` CLI.)
- **Tool primitives already exist (Rust):** worktree file read/write, diff, commit,
  terminal/run, file-tree, and a **sandbox** (defense-in-depth). I.e. most "agent
  tools" a local loop would call are already implemented as Mozart operations.
- **Model infra (NOT OpenCode — reusable):** Ollama daemon detection, hardware probe
  (RAM/disk), a pinned model catalog (Qwen2.5-Coder 7B/3B/1.5B), resumable model pull.
- **Onboarding/UX patterns:** two-choice provider step (Claude detected → default;
  else Local recommended), non-blocking skip/exploration mode, in-app model download
  with explicit confirm + pre-download disclosure, persisted setup state, a "Manage
  local dependencies" settings view (manifest of pulled models + reversible remove),
  and transparency docs (`docs/local-models.md`).

## The core architectural question to resolve
Local models need an **agent loop** — the role OpenCode played for local, and the
role the `claude` CLI plays for Claude: read context → call tools (edit/read/bash) →
iterate → produce a diff. **Do we build a small loop ourselves, or integrate a
lower-level, non-competitor solution?** Decompose into two layers:

**1. Model serving** (run weights, expose an API):
- **Ollama** — best "download in onboarding" UX (model registry, `ollama pull`,
  OpenAI-compatible API); one trusted external tool; not a Mozart competitor.
- **Embedded inference** (llama.cpp / candle / mistral.rs) — zero external tools, but
  big binary + GPU build matrix + we own model-file management. Heavy.
- Others (LM Studio / Jan / vLLM) — GUI apps or server-grade; poor fit for desktop end users.

**2. Agent loop** (the OpenCode role):
- **Thin Rust tool-calling loop** on the standard OpenAI-compatible tool-calling API,
  executing a small toolset (read/write/edit/list/bash) in the existing sandbox,
  emitting `StreamEvent`s. Smallest dependency footprint; native to the Rust seam.
- **Rust agent framework** (e.g. `rig`) — same idea, library-provided loop; one crate.
- **JS framework** (e.g. **Genkit**) — not Rust; would need a Node sidecar and fights
  the Tauri/Rust architecture; you still build the coding tools. Likely poor fit.
- **Vendor OpenCode internally** (npm, no user install) — still depends on a
  competitor's agent (license/strategic debt). Likely rejected.

**Dominant risk is model quality, not the harness:** small OSS models (≤7B) are
unreliable at multi-step tool-calling. Every option hits this ceiling — OpenCode did
too. So the *scope* question matters as much as the *tech* question.

## What we want from the review
1. **Challenge the premise:** is "agentic parity with Claude Code, locally" the right
   bar for v1 — or is a narrower wedge the 10-star MVP given model limits (e.g.
   excellent local **chat/ask** + simple single-file edits first, full agentic later)?
2. A **recommended architecture** (model serving + agent loop) with an explicit
   **build-vs-integrate** decision and justification — and how it avoids competitor deps.
3. The **simplest MVP path** and what to explicitly **defer**.
4. **Effort + risk** estimate, and the **validation** that should come first.
5. How it fits the **provider seam** so Mozart Cloud slots in later.

## Suggested first concrete step
A **1-day spike**: a minimal Rust tool-calling loop against Ollama (qwen2.5-coder),
one real edit task, **measure tool-use reliability** — to ground the scope decision
before building anything substantial.
