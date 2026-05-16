# Mozart — Functional test scenarios

This directory holds **user-facing behavior contracts** extracted
from Phases 1-6 of the v0.0.1 MVP. They are the source of truth for
Phase 8 (end-to-end test automation).

## Format

Each scenario is a structured paragraph with the following shape :

```markdown
### Scenario : <short title>

**Priority** : MUST | SHOULD | COULD

**Preconditions** :
- one bullet per state-of-the-world assumption (auth, db, fs, network)

**Steps** :
1. numbered, imperative-form user actions
2. ...

**Expected** :
- what the user should observe
- what the system should record (DB, files, signals)

**Edge cases** :
- one to three short bullets covering negative paths or alternative
  branches.

**Priority labels** :
- **MUST** — a regression here breaks the core promise of the MVP.
  Phase 8 implements MUST scenarios first.
- **SHOULD** — important but a temporary failure isn't catastrophic.
- **COULD** — quality bar / nice-to-have. Last-tier for Phase 8.
```

## How Phase 8 uses these files

Phase 8 implements end-to-end tests in a new Nx project named
**`apps/desktop-e2e`**, separate from `apps/desktop`. The framework
is not pre-decided — Phase 8's Phase B picks one of :

- **WebdriverIO + `tauri-driver`** (the official Tauri recommendation)
- **Playwright with Tauri integration** (community-supported)

Whichever wins, each scenario in this directory maps to one test :

- the `Preconditions` map to setup hooks (DB seed, faked auth
  token, mocked LLM stream, etc.) ;
- the `Steps` map to driver actions (click / type / press) ;
- the `Expected` lines become assertions ;
- `Edge cases` may be folded into the same test (`describe.each` /
  parametrized cases) or spun out as separate cases — implementer's
  call.

**Implementation order** (per plan.md Phase 8 §Scope) :

1. **Batch 1** : every **MUST**-priority scenario across the 7 files
   below. These are blocking for the merge gate.
2. **Batch 2** : **SHOULD**-priority scenarios.
3. **Deferred** : **COULD**-priority scenarios land after Phase 9
   polish.

Phase 8 also ships ~30 **unit tests** strictly on pure logic — see
the testing philosophy below.

## Testing philosophy (Phase 8, enforced)

Mozart's tests follow a deliberate dichotomy :

- **Unit tests** : ONLY on **pure logic**. Concretely : the parser +
  reducer in `domains/llm-model/data/stream/`, adapter mappers,
  `util-*` functions, and critical signal-store state transitions.
  Co-located `.spec.ts` files. Total budget : ~30 unit tests in MVP.
- **No unit tests on components, templates, or smart wrappers.**
  They add noise without value. The e2e suite is the real safety
  net for UI behavior.
- **No integration tests** in between. Unit-pure vs e2e-flow covers
  the spectrum.
- **E2e tests** : the primary investment. They run against the built
  desktop binary and exercise the same paths a real user would.

If a future scenario tempts you to write a component-level test, the
answer is almost always : grow the e2e scenario instead, or carve out
the pure piece of logic into a util / mapper and unit-test that.

## How to add new scenarios after MVP

When a new feature ships :

1. Add a `phase-<n>-<area>.md` file (or grow the most relevant
   existing one).
2. Use the same format. Don't change it without updating this README.
3. If the feature spans multiple phases (e.g. a new shortcut affects
   composer + sidebar), add the scenario to `cross-phase-flows.md`
   rather than picking one of the phase files.
4. Keep priorities honest. Tag MUST sparingly — a 200-MUST suite is
   a 0-MUST suite when CI is red.

## Open clarifications (TODO)

Where the audit could not infer the intended behavior from code reading
alone, scenarios carry an inline `> TODO clarify` line. Resolve those
with the product owner before turning them into automated tests.

## Legacy files

`docs/test/legacy/` contains pre-audit scenario files in a narrative
format (`## S1 — …`, etc.). Their unique scenarios were merged into
the standardized files above during the Phase 7 reconciliation pass.
The legacy files are retained for historical reference but should NOT
receive new content. New scenarios go into the conforming files only.

The legacy phase-6-e2e.md also carries an atom ↔ scenario coverage
map (atom 0 → scenarios S6.2 + S6.3, etc.) — consult that file when
mapping Phase 6 atoms back to behavior.

## Playwright wiring notes (for Phase 8)

When implementing the e2e harness, keep these realities in mind :

- **Mock Clerk in apps/web** lets tests drive `/login` → `/dashboard`
  without external auth. The desktop side needs a Tauri-aware
  harness (WebdriverIO + `tauri-driver` is the official path).
- **`~/Mozart/get-started/` cleanup** : the create command is
  idempotent, but tests should reset this folder between runs to
  avoid drift from prior agent edits.
- **PTY testing (`claude login`)** is the trickiest case : the CLI
  is interactive. Recommend stubbing `spawn_claude_login` in test
  mode to emit a canned token-paste then exit 0, or skipping the
  PTY flow and only running the API-key fallback in CI.
- **Notifications** : CI test runners typically don't surface OS
  notifications. Asserting the call reached
  `commands.emitMessageEndNotification` is enough for the spec ;
  visual verification is manual.
