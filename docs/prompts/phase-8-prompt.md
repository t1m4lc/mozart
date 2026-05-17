# Mozart — Phase 8 prompt

## Non-regression tests in `apps/desktop-e2e`

## Goal

Critical user flows are protected by end-to-end tests that
run in CI before any merge. Refactors can land without fear
of silently breaking the prompt-to-PR loop.

This phase implements automated tests against the
functional scenarios already documented in `docs/test/`
(produced by the post-MVP audit). It also lands a small,
focused batch of unit tests on the pure-logic layers of the
codebase.

**Out of scope this phase** (deliberate) :

- **No component / template / smart-wrapper unit tests.**
  Mozart's testing philosophy reserves unit tests for pure
  logic only. Tests on components add noise and break on
  every UI refactor without catching real regressions.
- **No e2e tests for COULD-priority scenarios.** Only
  MUST-priority in batch 1, SHOULD-priority in batch 2.
  COULD-priority scenarios stay documented but uncovered.
- **No new functional scenarios.** Use the scenarios in
  `docs/test/` as-is. If you discover behavior the audit
  missed, document it in `docs/test/` with a `TODO post-phase-8`
  note ; don't implement coverage for it now.

---

## Context

- `docs/test/README.md` → testing format + priority levels
- `docs/test/phase-1-*.md` through `docs/test/phase-6-*.md`
  → per-phase functional scenarios (Given / When / Then)
- `docs/test/cross-phase-flows.md` → end-to-end flows
  spanning multiple phases (highest-value scenarios)
- `docs/specs/plan.md` → Phase 8 (Goal, Scope, Deliverables,
  testing philosophy)
- `docs/audit/v0.0.1-post-mvp-audit.md` → state of the
  codebase entering Phase 8
- `docs/conventions/phase-7-refactor-conventions.md` → still
  relevant for any test-adjacent refactor
- `apps/desktop` → application to test
- `apps/desktop-e2e` → target project to create (or extend
  if already bootstrapped)

---

## Method

Plan mode. For each block : Phase A (read) → Phase B
(plan) → implement → check acceptance.

**Checkpoints** : STOP after each block and present results.
Do not chain blocks silently.

1. After **Block 0 — Framework decision & bootstrap** :
   present the chosen framework + project structure + first
   smoke test passing → ask confirmation
2. After **Block 1 — MUST-priority e2e scenarios** : present
   list of scenarios implemented + CI status → ask confirmation
3. After **Block 2 — SHOULD-priority e2e scenarios** :
   present updated coverage → ask confirmation
4. After **Block 3 — Unit tests on pure logic** : present
   the ~30 unit tests landed + coverage of `domains/llm-model/data/stream/`
5. After **Block 4 — CI integration + docs** : final report

---

## Execution order

### Block 0 — Framework decision & bootstrap

Two candidates per `plan.md` :

| Option                         | Pros                                                          | Cons                                                 |
| ------------------------------ | ------------------------------------------------------------- | ---------------------------------------------------- |
| WebdriverIO + `tauri-driver`   | Official Tauri recommendation, mature, multi-browser fallback | More verbose API, slightly slower startup            |
| Playwright + Tauri integration | Modern API, fast, great DX                                    | Community-supported for Tauri, may need adapter glue |

Phase A : read the Tauri version in use, check existing dev
deps, check any prior e2e experiments left in the codebase.
Phase B : recommend one, justify, get user confirmation.

Once chosen :

- Create `apps/desktop-e2e/` in the Nx monorepo, sibling of
  `apps/desktop`
- Setup config files, scripts, a `tsconfig.json` consistent
  with the rest of the workspace
- Write **one smoke test** : launch the desktop binary,
  assert the `/welcome` route renders the Mozart logo, exit
  cleanly
- Wire the smoke test into a local `nx e2e desktop-e2e`
  command

The smoke test passing is the checkpoint for Block 0. The
real scenarios start in Block 1.

### Block 1 — MUST-priority e2e scenarios

Read every MUST-priority scenario in `docs/test/`. For each :

- Implement as a test in `apps/desktop-e2e/src/`
- Use page objects or test helpers where it reduces
  duplication across scenarios (e.g. a `signIn()` helper
  used by every authenticated scenario)
- Keep individual tests **short and readable** — one
  scenario = one test function = ~30-80 lines max
- Use realistic test data (real-ish project names, real
  prompt examples) — not `foo` / `bar`
- For Tauri-specific behavior (deep links, file system,
  PTY), use the framework's adapter capabilities

Group tests by feature area within the phase, matching the
file structure of `docs/test/` :

```
apps/desktop-e2e/src/
├── helpers/
│   ├── sign-in.ts
│   ├── create-project.ts
│   └── send-prompt.ts
├── phase-1-projects-workspaces.spec.ts
├── phase-2-chat-composer.spec.ts
├── phase-3-agent-stream.spec.ts
├── phase-4-git-files-pr.spec.ts
├── phase-5-auth.spec.ts
├── phase-6-onboarding.spec.ts
└── cross-phase-flows.spec.ts
```

For each scenario, copy its **title + priority + summary**
as a comment at the top of the test, with a link back to
the file in `docs/test/`. Makes it trivial to navigate from
test to scenario doc.

### Block 2 — SHOULD-priority e2e scenarios

Same pattern as Block 1, scoped to SHOULD-priority scenarios.

Skip COULD-priority — they're documented but not automated
yet. They become candidates for post-Phase-9 polish.

### Block 3 — Unit tests on pure logic

Budget : **~30 unit tests total**. Not less (the parser /
reducer alone deserves ~15). Not more (component tests are
forbidden — see §Out of scope).

Targets in priority order :

1. **`domains/llm-model/data/stream/` parser + reducer**
   (~15 tests) :
   - Parser : every `StreamEvent` type produced correctly
     from fixture chunks
   - Parser : malformed JSON, truncated chunks, encoding
     edge cases
   - Reducer : every `StreamEvent` → correct `TurnState`
     transition
   - Reducer : `plan_proposal` flow (PENDING → ACTIVE → DONE)
   - Reducer : token usage capture from `message_end`

2. **Adapter DTO mappers** (~8 tests) :
   - Workspace DTO ↔ model
   - Project DTO ↔ model
   - Chat DTO ↔ model
   - Anything else where typo-level bugs would be invisible

3. **Critical signal store transitions** (~5 tests) :
   - Chat facade : `sendMessage` transitions store to
     streaming, `message_end` transitions back
   - Workspace facade : `markChatRead` clears unread flag
   - Project facade : adding a project auto-creates
     workspace + chat

4. **Util-\* pure functions** (~2 tests) :
   - Branch name sanitization
   - Selection fallback (`keepPreviousSelectionOrFirst`)
   - Any other pure helper landed during Phase 7

Co-locate `.spec.ts` files next to the implementation
(standard Angular pattern). Use the same test runner as the
rest of Angular (Jest or Vitest, per the monorepo's setup).

**Forbidden** : tests on components, templates, smart
wrappers, facades' wiring (only their pure state transitions),
adapter integration (mock the Tauri layer, don't actually
spawn it).

### Block 4 — CI integration + docs

- Update the CI pipeline (`.github/workflows/` or whatever
  Mozart uses) to run :
  - Unit tests on every PR (fast)
  - E2e tests on every PR (slower, parallelizable)
  - Block merge if either fails
- Add a `README.md` in `apps/desktop-e2e/` :
  - How to run e2e locally (`nx e2e desktop-e2e`)
  - How to debug a failing test
  - How to add a new scenario (point to `docs/test/`)
  - Test data conventions
- Update `docs/test/README.md` :
  - Mark covered MUST + SHOULD scenarios as ✅
  - Note that COULD scenarios remain uncovered
  - Convention for adding new scenarios post-Phase-9

---

## Acceptance criteria

- `apps/desktop-e2e/` exists in the Nx monorepo
- Framework chosen and justified
- Every **MUST-priority** scenario from `docs/test/` covered
  by an e2e test, passing locally + in CI
- Every **SHOULD-priority** scenario covered (Block 2
  complete or explicitly deferred with reason)
- **COULD-priority** scenarios remain documented but
  uncovered (this is correct, not a gap)
- ~30 unit tests landed in the listed pure-logic locations
- **Zero component / template unit tests** introduced
- CI pipeline runs unit + e2e on every PR, blocks merge on
  failure
- `apps/desktop-e2e/README.md` documents how to run + debug
  - add scenarios
- `docs/test/README.md` shows the coverage status

---

## Final report — 8 sections

1. **Executive summary** — 5 bullets max : framework picked,
   scenarios covered, unit tests landed, CI status, overall
   state
2. **Framework decision** — choice + justification + 1-line
   regret (if any)
3. **E2e coverage table** — `| Scenario | Priority |
Status | File |` for every scenario in `docs/test/`
4. **Unit tests landed** — `| Target | Test count | What
it covers |`
5. **CI pipeline** — what runs, on what trigger, with
   timings
6. **Deferred scenarios** — SHOULD or MUST that couldn't be
   automated, with one-line reason per scenario
7. **Helpers / page objects landed** — list of reusable
   test helpers in `apps/desktop-e2e/src/helpers/`
8. **Build / test status** — green / red

---

Effort suggestion : **High**. Time budget : 2-3 Claude Code
sessions across the 4 blocks, with checkpoint reviews
between.
