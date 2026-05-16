# Phase 7 prompt

## Refactor + UI State Store + Angular 22 alignment

## Goal

Refactor the existing codebase to make UI state more
predictable, reduce imperative glue code, improve
maintainability, and align with modern Angular 22 patterns.

This phase does **not** rewrite the app. It fixes the audit's
blockers and majors, normalizes the store layer with Redux
DevTools visibility, and applies focused refactors guided by
the conventions doc.

**Out of scope this phase** (deliberate) :

- **Chat decommission (IMP-007)** — the user will handle this
  separately. Do NOT remove, refactor, or touch chat-related
  code. Leave routes, components, stores, and tests as they
  are. If chat code is in the way of an unrelated refactor,
  flag it in the final report and skip the refactor.
- **UI repositioning (IMP-003, IMP-004)** — macOS window
  controls placement and Open in IDE / Commit / Create PR
  button placement are tricky UX decisions. The user will
  handle these manually. Skip them from the blocker list, but
  KEEP IMP-001 (filter popover bug) and IMP-002 (notification
  unification) in scope.

**Important rule on tests** : do NOT add unit tests on
components, templates, or smart wrappers during this phase.
Mozart's testing philosophy (per `plan.md` Phase 8) reserves
unit tests for pure logic only — parsers, reducers, mappers,
util functions. If you write a new pure helper in
`util-*/`, a co-located `.spec.ts` is fine. Everything else
waits for Phase 8 e2e tests.

---

## Context

- `docs/audit/v0.0.1-post-mvp-audit.md` → improvement task list,
  source of truth for what to fix this phase
- `docs/conventions/phase-7-refactor-conventions.md` → technical
  conventions every refactor must respect (linkedSignal, async
  primitives, DTO boundaries, error handling, anti-patterns,
  component checklist, naming, architecture)
- `docs/specs/plan.md` → Phase 7 (Goal, Scope, Deliverables)
- `docs/done.md` → historical MVP record
- `docs/test/` → functional scenarios for reference (don't
  implement tests here — Phase 8 does that)
- `apps/desktop/src/app` → application code
- `libs/ui` → shared dumb components

Read these in order before starting.

---

## Method

Plan mode all the way. For each task : Phase A (read the
code) → Phase B (plan the change) → implement → check
acceptance.

**Checkpoints** : STOP after each block below and present
results to the user before proceeding. Do not chain blocks
silently.

1. After **Block 0 — Test docs reconciliation** : present the
   decision matrix (legacy file → archive / merge /
   supersede) before applying anything
2. After **Block 1 — Phase 6.5 patch pass** : present the
   diff summary + list of fixed IMPs + ask user confirmation
   to proceed
3. After **Block 2 — Composer refactor** : present diff
   summary + Composer's new shape + ask confirmation
4. After **Block 3 — Store refactor + DevTools** : present
   the new DevTools-visible state tree (which stores got
   `withDevtools`, what `domains/ui-state/` looks like) +
   ask confirmation
5. After **Block 4 — Polish & cleanup** : present final report
   (8 sections, see below)

---

## Execution order

### Block 0 — Test docs reconciliation

**Before any code change**, reconcile legacy test docs with
the new audit-generated ones.

Legacy files :

```
docs/test/phase-1-critical-scenarios.md
docs/test/phase-4-aside-and-files-scenarios.md
docs/test/phase-6-e2e.md
```

For each legacy file :

- Compare with the corresponding new file
- Decide : **archive** (move to `docs/test/legacy/`),
  **merge** (extract unique scenarios into the new file),
  or **supersede** (delete after confirming the new file
  covers it)
- Update `docs/test/README.md` to reflect the final state

Present the decision matrix at the checkpoint. Apply only
after user confirms.

### Block 1 — Phase 6.5 patch pass

Fix the patch-level items in this exact order :

| Order | ID        | Title                                                         |
| ----- | --------- | ------------------------------------------------------------- |
| 1     | `IMP-001` | Filter popover : use `facade.all()` not `facade.visible()`    |
| 2     | `IMP-002` | Notification path unification (one JS path, permission-aware) |
| 3     | `IMP-005` | Dashboard hero                                                |
| 4     | `IMP-006` | Quick-start "Coming soon" gate                                |
| 5     | `IMP-010` | Clone URL validation                                          |
| 6     | `IMP-012` | Group-by-Status re-enable                                     |
| 7     | `IMP-016` | (per audit)                                                   |
| 8     | `IMP-020` | (per audit)                                                   |

Goal : fix obvious UX / logic bugs to stabilize the app
before any refactor.

**Skipped** : `IMP-003` (macOS controls placement), `IMP-004`
(action buttons placement), `IMP-007` (chat decommission).
User handles these.

### Block 2 — Composer refactor + Signal Forms

Per `IMP-011`, `IMP-013`, `IMP-014` :

- Simplify composer state
- Remove excessive local mutable state
- Migrate appropriate form state to Signal Forms where
  suitable (per `plan.md` cross-cutting convention)
- Avoid unnecessary `effect()` — use `linkedSignal` /
  `computed` instead (see conventions §1.2, §1.4)
- Keep async flows declarative and cancellable

The composer is the most-touched user surface ; keep changes
small, ship in a reviewable chunk.

### Block 3 — Store refactor + Redux DevTools

Per `plan.md` Phase 7 scope :

- Audit every store in
  `apps/desktop/src/app/domains/*/data/*.store.ts`
- Confirm all use `@ngrx/signals` `signalStore` consistently
- Add `withDevtools('storeName')` to every visible store
- Create / improve `domains/ui-state/` :
  - selected project / workspace / chat IDs
  - sidebar expand state per project
  - active modal stack
  - theme preference
  - notification + sound prefs
  - tour completion flags
- Store IDs in `ui-state`, derive entities from the relevant
  domain store (see conventions §1.3)
- Use `linkedSignal` in components for selection with local
  fallback (see conventions §1.2)

### Block 4 — Polish & cleanup

Final pass :

- Address remaining majors from audit (`IMP-008`, `IMP-009`,
  `IMP-015` per audit's domain grouping)
- Harmonize dialogs
- Improve error states per conventions §4
- Clean up duplication only where the abstraction stays simple
  (conventions §1.1)
- Add `ARCHITECTURE.md` at repo root (1 page : domains map +
  3 conventions recap)
- Run the restricted grep pass below
- Verify build + checks pass

---

## Acceptance criteria

- `IMP-001` fixed first
- `IMP-002`, `IMP-005`, `IMP-006`, `IMP-010`, `IMP-012`,
  `IMP-016`, `IMP-020` fixed in Block 1
- `IMP-003`, `IMP-004`, `IMP-007` explicitly skipped (user
  handles)
- Composer refactored per conventions
- Every visible `signalStore` connected to Redux DevTools
  with `withDevtools`
- `domains/ui-state/` exists with the listed responsibilities
- Root `ARCHITECTURE.md` exists (~1 page)
- Test docs reconciled (legacy vs new)
- Conventions doc respected throughout (verified by spot
  checks during code review)
- Grep pass run, justified exceptions documented
- No new component / template unit tests introduced
- App builds, existing checks pass

---

## Restricted grep pass

Run only these greps. For each match, decide refactor or keep
with one-line justification.

```bash
# RxJS hygiene
rg "\.subscribe\(" apps/desktop/src/app --type ts
rg "setTimeout\(" apps/desktop/src/app --type ts
rg "setInterval\(" apps/desktop/src/app --type ts

# Signal hygiene
rg "effect\(" apps/desktop/src/app --type ts

# Mutation hygiene
rg "\.push\(" apps/desktop/src/app/domains --type ts
rg "\.splice\(" apps/desktop/src/app/domains --type ts

# Modern Angular APIs (only when already touching the file)
rg "@ViewChild|@ViewChildren" apps/desktop/src/app --type ts
rg "\*ngIf|\*ngFor" apps/desktop/src/app --type html

# Signal Forms — Reactive Forms must migrate
rg "FormGroup|FormControl|FormBuilder|Validators" apps/desktop/src/app --type ts
rg "ngModel|FormsModule|ReactiveFormsModule" apps/desktop/src/app --type ts

# Zoneless hygiene — these usually hide a missing signal read
rg "detectChanges\(\)|markForCheck\(\)" apps/desktop/src/app --type ts
rg "ChangeDetectorRef" apps/desktop/src/app --type ts
rg "NgZone" apps/desktop/src/app --type ts

# Rust safety
rg "panic!\(|\.unwrap\(\)|\.expect\(" src-tauri/src

# Architectural boundaries (must stay clean)
rg "from ['\"]@tauri-apps" libs apps/desktop/src/app | grep -v "tauri.*\.adapter\.ts"
rg "from ['\"]@mozart" libs/ui --type ts | grep -v "import type"
rg "ChangeDetectionStrategy\.Default" apps/desktop/src/app --type ts
```

Skipped (too ambiguous, noise-heavy) : generic `loading =`,
`error =`, `data =` patterns.

---

## Final report — 8 sections

Keep it concise. The report is for the user, not an essay.

1. **Executive summary** — 5 bullets max : what shipped,
   what was skipped, overall state of the codebase
2. **IMP completion table** — `| IMP-XXX | Status | Files
| Notes |` for every item touched (including skipped
   ones)
3. **Refactors performed** — `| File | Why | What changed |`
   for non-IMP refactors
4. **Refactors deferred** — anything seen but not done, with
   a one-line reason ; assign a new `IMP-XXX` for the
   backlog
5. **New domains / structure changes** — what landed in
   `domains/ui-state/`, any other structural moves
6. **Grep pass results** — counts per pattern + justified
   exceptions
7. **DevTools state tree confirmation** — list of stores
   now visible with `withDevtools` + a one-line description
   of what each holds
8. **Build / checks status** — green / red, what to retry

---

## What this prompt does not do

- Does not add component unit tests
- Does not touch chat code
- Does not move macOS window controls or action buttons
- Does not rewrite working code for stylistic reasons alone
- Does not migrate every `*ngIf` to `@if` opportunistically —
  only when touching the file for another reason
- Does not extract every duplicate into a util — only when
  the abstraction stays simple (see conventions §1.1)

Effort suggestion : **XHigh**. Time budget : 2-4 Claude Code
sessions across the 4 blocks, with checkpoint reviews
between.
