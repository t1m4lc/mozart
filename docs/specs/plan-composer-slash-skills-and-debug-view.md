# Plan — Composer slash skills + prompt-execution debug view

Status: reviewed (plan-eng-review)
Branch: wt-skills
Scope decision: **both features, minimal, two phases.** Atomic chips, `@file`
context, and a persistent skills DB table stay DEFERRED (already post-MVP in
`plan-v0.1.0-beta.0.md:1920`).

---

## 1. Goal

Two independent features that share the composer:

1. **Provider-aware slash skills** — type `/` in the composer to open a grouped,
   keyboard-navigable dropdown of skills, filtered by the selected model's
   provider, structured so new providers and a Settings filter-mode drop in
   without a rewrite.
2. **Prompt-execution debug view (dev-only)** — a read-only inspector that
   surfaces, per run: the user prompt, the injected 7-layer context, the exact
   rendered payload sent to the CLI, and the response events. Visible only in
   `isDevMode()`, never in production.

---

## 2. What already exists (reuse, don't rebuild)

Feature 1:
- `libs/desktop-llm-model-util/src/lib/providers.config.ts` — static catalog
  pattern (`PROVIDER_REGISTRY`, `LLM_MODEL_CATALOG`) with id/label/icon/
  availability + `agentProviderForModel()`. Template for the skill catalog.
- `ProfileFacade.activeAgentProvider()` (`profile.facade.ts:82`) +
  `agentProviderForModel()` — the provider-keying seam.
- `mz-composer-model-select.ts` — grouped-by-provider menu (group header + items
  + badges). Template for the slash-menu grouping.
- `ComposerModelsStore` + `COMPOSER_MODELS_PORT` → `settings.json`
  `agent.enabledModelIds` — exact pattern for a future `agent.skillFilterMode`.
- `libs/spartan-ui/combobox/**` (`HlmCombobox`, CDK overlay) — **[Layer 1]** the
  caret-anchored overlay primitive. Do not hand-roll an overlay.

Feature 2 — **~80% already built in the backend:**
- `apps/desktop-tauri/src/claude_cli/envelope.rs` — `LLMEnvelope` typed 7-layer
  context struct, derives `specta::Type` (auto-TS-bindable).
- `agent_run_envelopes` table (migration 011) persists **per run**:
  `envelope_json` (full structured context) **and** `rendered_text` (exact
  nonce-framed CLI payload), plus `provider`, `char_count`, `est_tokens`, with
  per-chat retention. `commands/mod.rs:912-965`.
- `db::agent_run_envelopes::get_by_run()` already exists.
- `agent_runs` holds `prompt`/`prompt_source`/`exit_code`/`error_message`.
- `agent_events` + the live `AgentEvent` stream already carry the response side.
- `chats.adapter.ts:44` `insert(...)` already accepts `runId` (column exists).

**Gaps (the only net-new for feature 2):** no `#[tauri::command]` exposes
envelopes, no TS binding (`grep Envelope _bindings.ts` → 0), and the assistant
message isn't linked to the run's `run_id`.

---

## 3. Architecture decisions (locked in review)

### D1 — Skill metadata: two orthogonal axes, not one `provider` field

A single `provider: 'mozart'|'claude'|'codex'` collapses the moment the Mozart
marketplace lands (gstack, Superhuman, paperasse, role skills for ops/sales/
admin are neither "Mozart the provider" nor Claude/Codex skills). Split into:

- **`runtimes`** (compatibility) — *which agent backend can run it.* Drives the
  provider-aware **filter**. `'any'` = agent-agnostic (most Mozart-native +
  marketplace skills).
- **`source`** (provenance) — *where it came from.* Drives **grouping** + the
  future marketplace. `{ kind, publisher? }`.

```ts
// libs/desktop-skills-util/src/lib/skill.model.ts
export type SkillRuntime = 'claude' | 'codex';            // extensible
export type SkillSourceKind = 'mozart' | 'builtin' | 'marketplace' | 'user';
export type SkillScope = 'global' | 'project';            // future: 'user'

export interface SkillSource {
  readonly kind: SkillSourceKind;
  readonly publisher?: string;                            // 'gstack', 'superhuman', …
}

export interface SkillDescriptor {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly runtimes: 'any' | readonly SkillRuntime[];     // FILTER axis
  readonly source: SkillSource;                           // GROUP axis
  readonly scope: SkillScope;
  readonly availability: 'available' | 'coming_soon';
  readonly category?: string;                             // future marketplace facet (ops/sales/…)
}
```

Your requested "Mozart / Claude / Codex" sections are a special case of
**group-by-`source`** (Mozart first); `gstack`/`Superhuman` slot in as new groups
with zero type changes.

```
   metadata axes (orthogonal)
   ───────────────────────────────────────────────
   runtimes  →  FILTER   →  "show if runs on the selected model's backend"
   source    →  GROUP    →  "which section header it sits under"

   selected model = Claude          selected model = Codex
   ┌─────────────────────┐          ┌─────────────────────┐
   │ Mozart   (any)      │          │ Mozart   (any)      │
   │ gstack   (any)      │          │ gstack   (any)      │
   │ Claude   (claude)   │          │ Codex    (codex)    │
   └─────────────────────┘          └─────────────────────┘
     codex-only skills hidden         claude-only skills hidden
```

### D2 — Visibility: one pure selector + filter-mode seam (default per spec)

```ts
export type SkillFilterMode = 'current' | 'agnostic-plus-current' | 'all';
export const DEFAULT_SKILL_FILTER_MODE: SkillFilterMode = 'agnostic-plus-current';

export function runsOn(skill: SkillDescriptor, runtime: SkillRuntime): boolean {
  return skill.runtimes === 'any' || skill.runtimes.includes(runtime);
}

export function visibleSkills(
  catalog: readonly SkillDescriptor[],
  opts: { activeRuntime: SkillRuntime; filterMode?: SkillFilterMode },
): readonly SkillDescriptor[] { /* pure, fully unit-testable */ }

export function groupSkills(
  skills: readonly SkillDescriptor[],
): readonly { source: SkillSource; label: string; skills: readonly SkillDescriptor[] }[] {}
```

Default `'agnostic-plus-current'` = your "Mozart + current provider". Fed by a
constant now; a `SkillsFilterStore` (mirroring `ComposerModelsStore`) +
`settings.json agent.skillFilterMode` + Settings UI drop in later with **no
selector change**. The model's backend maps to a `SkillRuntime` via one adapter
fn (`agentProviderForModel(model) → 'claude' | 'codex'`).

### D3 — Module placement / dependency graph

```
  libs/desktop-skills-util            (NEW)  util  — model + SKILL_CATALOG + selectors (pure)
        ▲                                    no @angular/@tauri imports
        │ imports
  libs/desktop-workspaces-feature     (EDIT) feature — maps descriptors → UI view-models,
        │                                    derives activeRuntime, handles select/insert
        │ uses
  libs/mozart-ui/composer             (EDIT) ui — NEW mz-composer-slash-menu.ts (own view types),
                                              mz-composer.ts wires slash detection + overlay
```

The slash-menu UI defines its own minimal view-model types (mirrors how
`mz-composer-model-select.ts` redeclares `ModelOption` rather than importing the
domain type) — `mozart-ui` is a pure UI lib and must not depend on `desktop-*`.
The feature maps `SkillDescriptor` → UI view-model. This is the existing pattern,
not a DRY violation.

### D4 — Debug view: read-after-the-fact, dev-only

Data already exists at rest → a read-only query is the smallest correct change;
the hot streaming path and the `AgentEvent` reducer are untouched.

```
  RUN START (Rust, commands/mod.rs)
    build_envelope() → LLMEnvelope ──┐
    render()        → rendered_text ─┴─► INSERT agent_run_envelopes  (already happens)
    AgentRun.run_id ─────────────────────────────────────────┐
                                                              │ returned in LlmRunHandle.runId
  FRONTEND (chat.facade.ts _runAssistantTurn)                 │
    after llm.stream(...) → persist handle.runId onto the     ▼
    assistant message  (chats.adapter insert already takes runId)

  DEBUG PANEL (dev-only, opened for a message)
    isDevMode() gate ─► facade.runEnvelope(message.runId)
       └─► #[tauri::command] #[cfg(debug_assertions)] get_run_envelope(run_id)
              └─► db::agent_run_envelopes::get_by_run()  (already exists)
       renders: prompt │ 7 context layers │ rendered_text │ char/token stats │ events
```

- **Dev gating, two layers:** UI behind `isDevMode()` (+ optional `mozart:debug`
  localStorage escape hatch, matching `apps/desktop/src/main.ts`); command behind
  `#[cfg(debug_assertions)]` so it never compiles into release binaries (matches
  the dev-only commands at `commands/mod.rs:3469`).
- **Bindings dual-copy:** the build uses the hand-maintained `_bindings.ts`, not
  the generated one — hand-add the `get_run_envelope` signature + `LLMEnvelope`/
  `AgentRunEnvelope` types after regenerating.
- **`@file` synergy:** the envelope's `attached_context` layer already exists
  (empty in v1). Rendering it in the panel previews exactly where future `@file`
  data will appear — no `@file` code needed.

---

## 4. Slash-menu UX

```
  textarea keydown / input
     │
     ├─ char '/' at line-start (or after whitespace) → OPEN overlay at caret
     │
     ├─ overlay OPEN:
     │     type        → filter (computed over visibleSkills, case-insensitive,
     │                    matches label + id; groups recomputed)
     │     ArrowDown/Up → move active item (skips group headers + coming_soon)
     │     Enter / Tab  → select active → insert "/<id> " replacing the typed token
     │     Escape       → close, leave typed text as-is
     │     space / no match / caret leaves token → close
     │
     └─ insertion (v1): plain text "/<id> " at the caret. Atomic chips DEFERRED.
```

Empty/edge states: no matches → "No skills" row; `coming_soon` rows rendered
disabled with a badge (mirrors model-select); switching the model live
re-filters the open menu.

---

## 5. Test coverage map

```
CODE PATHS                                              USER FLOWS
[+] desktop-skills-util/selectors.ts                    [+] Slash menu
  ├── runsOn()                                            ├── [GAP] type '/' opens overlay at caret
  │   ├── [GAP] runtimes==='any' → true                  ├── [GAP] filter narrows as you type
  │   ├── [GAP] includes runtime → true                  ├── [GAP] Arrow/Enter selects, inserts "/id "
  │   └── [GAP] excludes runtime → false                 ├── [GAP] Escape closes, keeps text
  ├── visibleSkills()                                     ├── [GAP] switch model → menu re-filters
  │   ├── [GAP] mode 'current'                            └── [GAP] no-match → "No skills" row
  │   ├── [GAP] mode 'agnostic-plus-current' (default)  [+] Debug view (dev-only)
  │   ├── [GAP] mode 'all'                                ├── [GAP] [→E2E] hidden in prod (isDevMode false)
  │   └── [GAP] coming_soon excluded from runnable       ├── [GAP] open panel → layers + rendered_text
  └── groupSkills()                                       └── [GAP] re-open old run → fetch by runId
      ├── [GAP] Mozart group first
      ├── [GAP] publisher groups (gstack/superhuman)    [+] Error/empty states
      └── [GAP] stable order                              ├── [GAP] runId missing → panel shows "no envelope"
[+] desktop-skills-util/skill-token.ts (pure)            └── [GAP] get_run_envelope returns None → empty
  └── parse '/' token + replacement range
      ├── [GAP] '/' at line start
      ├── [GAP] '/' after whitespace (not mid-word)
      └── [GAP] caret/replacement-range correctness
[+] Rust commands/mod.rs
  └── get_run_envelope()
      ├── [GAP] returns envelope + rendered_text for known run
      ├── [GAP] None for unknown run
      └── [GAP] [#cfg] absent in release build
[+] chat.facade.ts _runAssistantTurn
  └── [REGRESSION] runId persisted onto assistant message

COVERAGE TARGET: 100% of new paths. All current entries are GAPs (new code).
Legend: [→E2E] integration test  ·  [REGRESSION] mandatory
```

**Regression (mandatory):** persisting `runId` onto the assistant message changes
an existing path (`_runAssistantTurn`) — add a `chat.facade.spec.ts` assertion
that a completed turn's assistant message carries the run's `runId`.

---

## 6. Failure modes

| Codepath | Realistic prod failure | Test? | Error handling? | User sees |
|----------|------------------------|-------|-----------------|-----------|
| slash token parse | caret mid-word, IME composition, paste | add | guard: only open at line-start/after-ws | menu just doesn't open (safe) |
| visibleSkills | stale filterMode / empty catalog | add | empty → "No skills" row, never empty crash | "No skills" |
| runId linkage | stream errors before handle.runId set | add | null runId → panel shows "no envelope for run" | dev-only empty state |
| get_run_envelope | row evicted by retention | add | `Option` → None handled | dev-only "no envelope" |
| dev gating | command called in prod build | add (cfg test) | `#[cfg(debug_assertions)]` + `isDevMode()` UI gate | nothing (hidden) |

No failure mode is both silent AND unhandled → **no critical gaps.**

---

## 7. NOT in scope (deferred, with rationale)

- **Atomic Notion-style chips** — heavy; plain-text insertion suffices for v1
  (post-MVP in beta.0).
- **`@file` / context shortcuts** — explicitly out; the debug view's
  `attached_context` layer previews the seam without building it.
- **Skills DB table + `attached_skills` persistence** — v1 catalog is static TS
  (mirrors `providers.config.ts`); DB lands with the marketplace.
- **`SkillsFilterStore` + Settings UI + `agent.skillFilterMode`** — selector
  takes the mode param now; the store/UI is a later drop-in.
- **Marketplace, publisher install, `category` browse** — types reserved
  (`source.publisher`, `category`), no UI.
- **Debug view in production** — dev-only by hard requirement.
- **Live debug events / streaming envelope** — read-after-the-fact only.

---

## 8. Parallelization

```
Lane A (Phase 1 — slash skills):  desktop-skills-util → mozart-ui/composer → desktop-workspaces-feature
Lane B (Phase 2 — debug view):    apps/desktop-tauri (Rust) → _bindings.ts → desktop-chat-data-access → debug panel UI
```

Lanes A and B touch disjoint modules (A: skills util + composer chrome; B: Rust +
chat data-access + a panel). **Launch A and B in parallel worktrees.** Only shared
seam: both eventually mount inside the composer host — merge A first (it owns
composer chrome), then B adds the dev-only panel trigger. Conflict risk: low.

---

## 9. Implementation Tasks

Synthesized from this review's findings. P1 blocks ship; P2 same branch; P3 follow-up.

### Phase 1 — Provider-aware slash skills

- [ ] **T1 (P1, human: ~3h / CC: ~20min)** — desktop-skills-util — scaffold lib + `skill.model.ts` (two-axis metadata)
  - Surfaced by: Architecture D1
  - Files: `libs/desktop-skills-util/**` (project.json, index, skill.model.ts)
  - Verify: `pnpm nx lint desktop-skills-util` + scope-tags
- [ ] **T2 (P1, human: ~2h / CC: ~15min)** — desktop-skills-util — `SKILL_CATALOG` seed (Mozart `any`, Claude, Codex, one marketplace example)
  - Surfaced by: Architecture D1
  - Files: `libs/desktop-skills-util/src/lib/skills.catalog.ts`
  - Verify: unit test catalog shape
- [ ] **T3 (P1, human: ~3h / CC: ~20min)** — desktop-skills-util — `runsOn`/`visibleSkills`/`groupSkills` + `runtimeForModel` adapter, full unit tests
  - Surfaced by: Architecture D2, Test map
  - Files: `selectors.ts`, `selectors.spec.ts`
  - Verify: `pnpm nx test desktop-skills-util`
- [ ] **T4 (P1, human: ~3h / CC: ~25min)** — desktop-skills-util — `skill-token.ts` pure parser (detect `/` token + replacement range) + tests
  - Surfaced by: Slash-menu UX, Test map, Failure modes
  - Files: `skill-token.ts`, `skill-token.spec.ts`
- [ ] **T5 (P1, human: ~1d / CC: ~40min)** — mozart-ui/composer — `mz-composer-slash-menu.ts` (HlmCombobox overlay, groups, keyboard nav, view-model types)
  - Surfaced by: Architecture D3, Slash-menu UX
  - Files: `libs/mozart-ui/composer/src/lib/mz-composer-slash-menu.ts` (+ spec)
  - Verify: component spec — open/filter/arrow/enter/escape
- [ ] **T6 (P1, human: ~4h / CC: ~30min)** — mozart-ui/composer — wire slash detection + overlay + insertion into `mz-composer.ts`
  - Surfaced by: Slash-menu UX
  - Files: `mz-composer.ts`, `mz-composer.spec.ts`
- [ ] **T7 (P1, human: ~3h / CC: ~20min)** — desktop-workspaces-feature — derive `activeRuntime`, map descriptors→view-models, pass to composer
  - Surfaced by: Architecture D2/D3
  - Files: `feature-workspace-composer.ts` (+ spec)

### Phase 2 — Debug view (dev-only)

- [ ] **T8 (P1, human: ~4h / CC: ~30min)** — desktop-tauri — `get_run_envelope` command, `#[cfg(debug_assertions)]`, over existing `get_by_run`
  - Surfaced by: Architecture D4
  - Files: `commands/mod.rs`, `bindings_export.rs` (+ Rust test incl. release-absence)
  - Verify: `cargo test` in `apps/desktop-tauri`
- [ ] **T9 (P1, human: ~2h / CC: ~15min)** — desktop-core-tauri — hand-add bindings (`get_run_envelope`, `LLMEnvelope`, `AgentRunEnvelope`)
  - Surfaced by: Architecture D4, bindings dual-copy
  - Files: `libs/desktop-core-tauri/src/lib/_bindings.ts`
- [ ] **T10 (P1, human: ~3h / CC: ~20min)** — desktop-chat-data-access — persist `runId` onto assistant message after `llm.stream`
  - Surfaced by: Architecture D4, Regression rule
  - Files: `chat.facade.ts`, `chat.facade.spec.ts`
  - Verify: spec asserts completed turn carries runId
- [ ] **T11 (P1, human: ~4h / CC: ~30min)** — data-access — adapter+facade `runEnvelope(runId)`
  - Files: chat or llm-model data-access adapter/facade (+ spec)
- [ ] **T12 (P1, human: ~1d / CC: ~40min)** — debug panel UI — read-only inspector behind `isDevMode()`; renders prompt, 7 layers, rendered_text, stats, events; empty states
  - Surfaced by: Architecture D4, Test map, Failure modes
  - Files: new mozart-ui/feature debug panel (+ spec)
- [ ] **T13 (P2, human: ~2h / CC: ~15min)** — verify dev gating end-to-end (panel hidden in prod build; command absent)
  - Surfaced by: Failure modes
  - Verify: prod build smoke + cfg test

### Follow-ups (P3, NOT this branch)
- [ ] **T14 (P3)** — `SkillsFilterStore` + `settings.json agent.skillFilterMode` + Settings UI
- [ ] **T15 (P3)** — atomic chip insertion, `@file` context, skills DB table + marketplace

---

## 10. Inline ASCII-diagram comments to add during implementation

- `desktop-skills-util/selectors.ts` — the two-axis filter/group diagram (§3 D1).
- `chat.facade.ts _runAssistantTurn` — the runId-linkage flow (§3 D4) near the
  `llm.stream` call.
- `mz-composer.ts` — the slash keydown/overlay state machine (§4).

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 4 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED — ready to implement. Scope reduced to two minimal
  phases; chips/`@file`/skills-DB deferred. Design review optional (slash menu +
  dev-only panel are mostly chrome reuse).

