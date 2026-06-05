# Audit — Skills feature & Menu Trigger component

Date: 2026-06-05
Branch: `wt-skills`
Scope: the recent Skills work and the refactored trigger-menu UI component.
Mode: read-only audit. No code changed.

Source plan: `docs/specs/plan-composer-slash-skills-and-debug-view.md`

---

## Executive summary

The branch ships two well-built halves of the Skills feature that are not
connected to each other, plus a third (the debug view) that is out of this
audit's scope.

1. **A generic `MzTriggerMenu` directive** (`libs/mozart-ui/trigger-menu`) — a
   headless, Notion-style trigger/overlay/atomic-token engine. This is the
   strongest piece of the work: genuinely decoupled, ARIA-correct, reusable
   beyond skills, and demonstrated standalone in the sandbox. Quality is high.

2. **A static TS skill catalog** (`libs/desktop-skills-util`) — `SKILL_CATALOG`
   plus pure `visibleSkills` / `groupSkills` selectors with a clean two-axis
   (runtime × source) model. This is what the composer slash menu actually
   renders today.

3. **A Rust filesystem skill-discovery subsystem**
   (`apps/desktop-tauri/src/skills/mod.rs`) exposed as the `list_skills` Tauri
   command. It discovers Mozart / Claude / Codex skills from disk, with a clean
   strategy pattern and tests.

The headline finding: **#2 and #3 are two independent skill systems with
different data models, and #3 is not wired to the UI at all.** The frontend
slash menu reads the static `SKILL_CATALOG`; nothing in TypeScript ever calls
`listSkills`. The Rust discovery code is reachable only through a binding that
has zero callers. So real skill discovery exists but is dark, and the menu shows
a hand-maintained list of five seed skills.

A second finding: the implementation **expanded past the reviewed plan on two
axes**. The plan (`§7 NOT in scope`) explicitly deferred atomic chips ("plain-text
insertion suffices for v1") and deferred dynamic discovery ("v1 catalog is static
TS … DB lands with the marketplace"). The branch shipped atomic chips (the
trigger-menu) and a discovery backend anyway. Neither expansion is bad on its
own; the risk is that they shipped half-integrated, so the codebase now carries
two skill models and one orphaned subsystem.

Nothing here is a correctness bug in shipped user-facing behavior. The slash menu
works. The debt is architectural: duplication, an unused subsystem, and a model
mismatch that will surface the day discovery gets wired.

---

## Current architecture overview

```
  COMPOSER SLASH MENU (what users see today)
  ───────────────────────────────────────────────────────────
  feature-workspace-composer.ts
     skillGroups = groupSkills(visibleSkills(SKILL_CATALOG, {runtime}))   ← STATIC TS
        │  maps SkillDescriptor → SlashMenuGroup/SlashMenuItem (UI view-model)
        ▼
  mz-composer.ts  [mzTriggerMenu] [menu]=skillMenu [insert]=_skillToToken
        │  hosts the generic directive on the contenteditable editor
        ▼
  MzTriggerMenu (libs/mozart-ui/trigger-menu)   ← generic, feature-blind
        │  trigger detect · caret overlay · keyboard forward · pill token insert
        ▼
  MzComposerSlashMenu (libs/mozart-ui/composer)
        filterGroupsByQuery + ActiveDescendantKeyManager + ctx.select


  RUST DISCOVERY (built, registered, NEVER CALLED from TS)
  ───────────────────────────────────────────────────────────
  list_skills(workspace_path)  →  skills::discover_all()
        MozartProjectStrategy   <ws>/.mozart/skills/*.md
        ClaudeProviderStrategy  ~/.claude/skills + <ws>/.claude/skills
        CodexProviderStrategy   ~/.codex/skills  + <ws>/.codex/skills
        dedup_project_over_global
        ▼
  _bindings.ts  listSkills()      ← 0 callers in libs/ apps/ (verified by grep)
```

### Module placement (matches plan §3 D3, correctly)

- `libs/mozart-ui/trigger-menu` — pure UI, feature-blind. Good boundary.
- `libs/mozart-ui/composer` — UI, owns the slash-menu listbox + its own
  view-model types (`SlashMenuItem`, `SlashMenuGroup`). Redeclaring view types
  instead of importing the domain model is the intended pattern (mirrors
  `mz-composer-model-select`), not a DRY violation.
- `libs/desktop-skills-util` — pure util, no Angular/Tauri imports. The two-axis
  model + selectors + seed catalog.
- `libs/desktop-workspaces-feature` — feature, maps descriptors → view-models.
- `apps/desktop-tauri/src/skills` — Rust discovery.

The layering is clean and respects the documented module boundaries. The problem
is not where the code lives; it is that two of these modules that should be one
pipeline are two disconnected pipelines.

---

## Part 1 — Menu Trigger Component

Files: `libs/mozart-ui/trigger-menu/src/lib/mz-trigger-menu.directive.ts`,
`trigger-menu.types.ts`, `trigger-token.ts`.
Landed in commit `e4b3e15 feat(trigger-menu): generic Notion-style trigger menu behavior`.

### Architecture & API

A single attribute directive `[mzTriggerMenu]`, generic over `<TItem, TData>`.
Inputs:

- `trigger: string` (required) — the character that opens the menu.
- `menu: TemplateRef` (required) — the consumer-supplied overlay content.
- `insert: TokenInsertFn<TItem>` (required) — maps a selected item to a `TokenSpec`.
- `context?: TData` — opaque payload handed back to the menu template.
- `placement: 'top' | 'bottom'` — preferred side; CDK flips when there's no room.

Outputs: `opened`, `closed`.

The directive owns the hard parts and exposes them through a `TriggerMenuContext`
passed via `$implicit`: live `query` signal, `select`, `close`, `onNavKey`,
`menuId`, `setActiveDescendant`. The split is clean: the directive owns
trigger/caret/overlay/token/key mechanics; the menu owns presentation, filtering,
and highlight (`trigger-menu.types.ts:24-53`).

Three design choices stand out as good:

1. **Document capture-phase key interception** (`mz-trigger-menu.directive.ts:159-186`).
   While the menu is open, arrow/enter/tab/escape are caught on the document in
   the capture phase and `stopImmediatePropagation`'d before they reach the
   host's own listeners. This is why the composer needs zero open/close state to
   avoid submitting on Enter (`mz-composer.ts:382-386`). Focus never leaves the
   editor; the directive forwards nav intents to the menu via `onNavKey`. This is
   the right way to do a caret-anchored menu in a contenteditable.

2. **ARIA 1.2 combobox wiring** (`mz-trigger-menu.directive.ts:60-73`). The host
   becomes `role=combobox` with `aria-expanded` / `aria-controls` /
   `aria-activedescendant` driven off signals, and the active option id flows
   back through `setActiveDescendant`. The listbox uses CDK's
   `ActiveDescendantKeyManager` (`mz-composer-slash-menu.ts:151-171`). Accessible
   by construction, not bolted on.

3. **Atomic-token mechanics in pure functions** (`trigger-token.ts`).
   `findActiveTrigger`, `buildTokenElement`, `replaceTriggerWithToken`,
   `tokenBefore/AfterCaret`, and `serializeEditable`/`segmentsOf` are all pure DOM
   helpers, separately testable, with no directive coupling.

### Is it generic and reusable beyond skills?

Yes. The directive references nothing about skills, the `/` character, or the
composer. The sandbox proves it: `apps/sandbox/src/app/trigger-menu.sandbox.ts`
mounts two independent instances (verified at `:169` and `:188`). A future
`@mention` menu, an emoji picker, or a `#tag` menu would reuse it with a
different `trigger`, `menu`, and `insert`. The README states the intent and the
code honors it.

One genuine limitation on genericity: **`trigger` is effectively single
character.** `findActiveTrigger` compares one character at a time
(`trigger-token.ts:47`, `char === trigger`). A multi-character trigger (e.g.
`::`) would not match. For `/`, `@`, `#` this is fine; document it so a future
consumer doesn't assume multi-char support.

### How Skills uses it / leveraging vs bypassing

The composer leverages it correctly and, if anything, uses *more* of it than the
plan called for:

- `mz-composer.ts:128-136` attaches the directive with `[trigger]='/'`,
  `[menu]=skillMenu`, `[insert]=_skillToToken`, `[placement]='top'`.
- `skillMenu` (`mz-composer.ts:222-223`) renders `MzComposerSlashMenu`, handing
  the directive's `ctx` down and the feature-supplied `skillGroups()`.
- `_skillToToken` (`mz-composer.ts:344-352`) maps a chosen skill to a pill whose
  `value` is `/<id>`, so it rides the serialized prompt string.

No part of the directive's intended design is bypassed. The slash menu does not
re-implement caret math, overlay positioning, or key handling. This is textbook
consumption.

The notable point is scope, not misuse: the plan (`§4`, `§7`) specified
**plain-text `/<id> ` insertion and explicitly deferred atomic chips**. The
shipped trigger-menu inserts **atomic pill tokens** with delete-as-a-unit
behavior. The Skills feature is therefore exercising a capability the plan said
would not exist yet. That is a scope expansion past the eng-reviewed plan, and it
is undocumented in the plan's review report.

### Concerns

- **C1 (low) — Token `data` payload does not survive a draft round-trip.**
  `buildTokenElement` stashes `data` as a `_tokenData` property on the DOM
  element (`trigger-token.ts:70-72`) and `segmentsOf` reads it back
  (`trigger-token.ts:163-167`). But the composer's draft-restore path rebuilds
  tokens from the serialized string via `splitSkillTokens` →
  `buildTokenElement({ ... })` with **no `data`** (`mz-composer.ts:401-412`). So
  a token created by live selection carries the full skill object; the same token
  restored from a saved draft carries `undefined`. Today nothing downstream reads
  the payload (the prompt only needs `/<id>` text), so this is latent. It will
  bite the first consumer who trusts `segment.data` after a reload.

- **C2 (low) — DOM property as a data channel.** Carrying arbitrary `data` on a
  live DOM node (rather than a serializable attribute or an external map) is the
  mechanism behind C1 and is a soft coupling between the token element and its
  payload. Acceptable for now; revisit if tokens ever need to carry structured
  data through persistence.

- **C3 (low) — Backspace/Delete handling is always-on.** The host keydown
  handler removes atomic tokens whether or not the menu is open
  (`mz-trigger-menu.directive.ts:133-151`). It is documented and harmless, but it
  is a second responsibility (token lifecycle) layered onto a directive otherwise
  framed as "trigger menu". Fine to keep; name it in the README so it isn't
  surprising.

- **C4 (info) — Blur close relies on a `queueMicrotask` focus check**
  (`mz-trigger-menu.directive.ts:188-196`). Works, and the comment explains why,
  but microtask-timed focus reconciliation is the kind of thing that breaks
  subtly across CDK/overlay upgrades. Cover it with a component test.

### Recommendations (Part 1)

- Keep the component. It is the highest-quality artifact in this branch.
- Document the single-character `trigger` limitation in the README and/or the
  `trigger` input doc comment.
- Fix or explicitly accept C1: either serialize token `data` (e.g. JSON on a
  data attribute) or document that restored tokens are data-less by design.
- Add a component-level test for the open-menu key ownership (Enter does not
  submit while open) and the blur-close path, since both rely on timing/capture
  tricks that are easy to regress.

---

## Part 2 — Skills discovery & loading strategy

### The central issue: two skill models, one of them dark

There are two complete, independent representations of a "skill":

| Aspect | TS (`desktop-skills-util`) | Rust (`apps/desktop-tauri/src/skills`) |
|---|---|---|
| Shape | `SkillDescriptor` (`skill.model.ts:27-40`) | `Skill` (`mod.rs:54-69`) |
| Identity/label | `id` + `label` | `id` + `name` |
| Runtime filter | `'any' \| SkillRuntime[]` | `SkillRuntime { Any, Claude, Codex }` |
| Source taxonomy | `kind: mozart \| builtin \| marketplace \| user` + `publisher?` | `SkillSource { MozartProject, ClaudeProvider, CodexProvider }` |
| Availability | `available \| coming_soon` | (none) |
| Category | `category?` | (none) |
| Source of data | hand-written `SKILL_CATALOG` (5 entries) | live filesystem scan |
| Reaches the UI | **yes** (the slash menu) | **no** (zero TS callers) |

The two source taxonomies do not map onto each other. TS thinks in
`mozart / builtin / marketplace / user`; Rust thinks in
`mozart-project / claude-provider / codex-provider`. The bindings expose the Rust
shape verbatim (`_bindings.ts:2467-2479`), so the day someone wires `listSkills`
into the composer, they must write a reconciliation layer: map Rust source enum →
TS source kind + publisher, invent `availability`/`label`/`category`, and merge
the result with whatever stays static. That work does not exist yet.

This is a direct consequence of the two halves landing in parallel (plan §8
literally schedules them as parallel lanes) without a follow-up task to converge
them.

### How Mozart skills are discovered

- **Static path (live in UI):** none. There are two Mozart-native entries hard
  coded in `SKILL_CATALOG` (`explain`, `summarize-changes`,
  `skills.catalog.ts:9-26`), `source.kind = 'mozart'`, `runtimes = 'any'`.
- **Filesystem path (built, dark):** `MozartProjectStrategy`
  (`mod.rs:168-193`) scans `<workspace>/.mozart/skills/*.md`, flat markdown
  files. Default runtime `Any` unless frontmatter `runtimes` narrows to a single
  provider (`mozart_runtime`, `mod.rs:115-126`). Always `Project` scope. Reads
  optional `model` frontmatter into `model_hint`.

### How Claude skills are discovered

- **Static path:** one hard-coded entry (`review`, `runtimes: ['claude']`,
  `source.kind: 'builtin', publisher: 'claude'`).
- **Filesystem path (dark):** `ClaudeProviderStrategy` (`mod.rs:246-267`) scans
  `~/.claude/skills` (Global) and `<workspace>/.claude/skills` (Project) via
  `scan_skill_root`. That scanner handles both `<name>/SKILL.md` and one level of
  publisher nesting `<publisher>/<name>/SKILL.md` (e.g. `gstack/ship/SKILL.md`),
  and skips dot-dirs like `.system` (`mod.rs:197-244`). Runtime forced to
  `Claude`; publisher captured from the nesting folder.

### How Codex skills are discovered

- **Static path:** one hard-coded entry (`codex-review`, `runtimes: ['codex']`,
  `publisher: 'codex'`).
- **Filesystem path (dark):** `CodexProviderStrategy` (`mod.rs:269-290`),
  identical shape to Claude but rooted at `~/.codex/skills` and
  `<workspace>/.codex/skills`, runtime forced to `Codex`.

The strategy pattern is clean and extensible: a future `MozartMarketplace`
strategy (calling the web API) drops in at `strategies()` (`mod.rs:294-300`)
without touching callers. The module header documents this intent well, including
the rationale that discovery is filesystem-based because neither CLI exposes a
"list skills" command yet (`mod.rs:13-17`).

### Caching, scanning, indexing, refresh

- **Frontend:** there is no caching because there is no fetch. `skillGroups`
  (`feature-workspace-composer.ts:223-236`) is a `computed` over the static
  const, recomputed on `activeAgentProvider()` change. Cheap and correct, but it
  caches nothing dynamic.
- **The `list_skills` doc comment is aspirational/inaccurate.**
  `commands/mod.rs:72-76` states "The frontend caches the result and re-calls
  only when appropriate, so the FS isn't rescanned on every slash-menu open."
  No such frontend code exists. The comment describes a design that was never
  wired.
- **Backend:** `discover_all` re-scans the filesystem on every call with no
  caching, indexing, or memoization (`mod.rs:305-312`). It does run on a blocking
  thread (`spawn_blocking`, `commands/mod.rs:88-92`), so it won't stall the async
  runtime. Dedup is `dedup_project_over_global` (`mod.rs:314-330`): project scope
  shadows global for the same `(source, id)`. Order is deterministic (strategy
  order, then discovery order). For the current scale (a handful of skill files)
  re-scanning is fine; at marketplace scale it would want a cache + invalidation.

### Normalization into a common model

Two normalizations exist, and they are not the same normalization:

1. **Rust → wire:** `skill_from_file` (`mod.rs:128-158`) parses frontmatter,
   falls back `name → directory stem`, trims fields, resolves runtime by source.
   Solid, with tests for frontmatter, nesting, dot-dir skipping, and dedup.
2. **TS descriptor → UI view-model:** the feature maps `SkillDescriptor` →
   `SlashMenuGroup`/`SlashMenuItem` (`feature-workspace-composer.ts:226-235`),
   collapsing `availability` into a `disabled` boolean.

There is **no normalization bridging the two**, which is exactly the gap that
makes the Rust subsystem unusable from the UI today.

### Grouping, filtering, search, presentation

This part is genuinely good and well-tested (`selectors.spec.ts`,
`slash-menu.logic.spec.ts`):

- **Filter (runtime axis):** `visibleSkills` (`selectors.ts:35-47`) with three
  modes (`current`, `agnostic-plus-current` default, `all`). The default mode is
  a single argument, so a future `agent.skillFilterMode` setting is a one-line
  change. `coming_soon` skills are kept visible but rendered disabled.
- **Group (source axis):** `groupSkills` (`selectors.ts:68-94`) buckets by
  `publisher ?? kind`, orders by `SKILL_SOURCE_REGISTRY` order (Mozart first),
  then alphabetical. Publisher skills (gstack, etc.) each get their own header.
- **Search:** `filterGroupsByQuery` (`slash-menu.logic.ts:64-76`) narrows by the
  live query against `label` + `id`, dropping emptied groups. Minor: it does not
  search `description`.
- **Token re-hydration:** `splitSkillTokens` (`slash-menu.logic.ts:26-55`)
  rebuilds chips from a serialized draft only when `/<id>` is a known skill id at
  a word boundary, so `/whatever`, `foo/commit`, `/committed` stay plain text.
  Carefully done and tested.

The two-axis (runtime × source) model from plan D1 is the right call and is
implemented faithfully. It cleanly absorbs the "Mozart / Claude / Codex" sections
the product wants while leaving room for marketplace publishers.

### Architectural weaknesses, duplication, coupling, scalability

- **W1 (high) — Orphaned subsystem.** The entire Rust discovery + binding is dead
  from the user's perspective. It compiles, is registered
  (`bindings_export.rs:33`, `lib.rs:26`), is tested, and is never called. Dead
  paths rot: they drift from the consumer that will eventually use them and give a
  false sense of "discovery is done".

- **W2 (high) — Dual model with no reconciliation.** Covered above. Two `Skill`
  shapes, two source taxonomies, no bridge. This is the main integration debt.

- **W3 (medium) — Misleading documentation.** The `list_skills` caching comment
  describes behavior that does not exist. A reader trusts it and assumes the
  pipeline is wired.

- **W4 (medium) — Trust boundary when discovery goes live.** The catalog comment
  (`skills.catalog.ts:1-5`) justifies static TS on security grounds: "the DB is
  user-writable and a tampered row must not be able to surface a runnable skill."
  The filesystem discovery reintroduces exactly that surface by another door: a
  cloned repo's checked-in `<workspace>/.mozart/skills/*.md` (and `.claude` /
  `.codex` skills) would auto-appear as runnable skills. Before wiring discovery,
  decide the trust policy for workspace-scoped skills (prompt, sandbox, or trust
  list). This is a supply-chain consideration, not a today-bug.

- **W5 (low) — `parse_frontmatter` dead code.** `mod.rs:88-91` builds a `lines`
  iterator and advances it once (`let _ = lines.next();`) but then re-iterates
  `rest.lines().skip(1)`; the first iterator is unused leftover. Harmless,
  trivial cleanup.

- **W6 (low) — No cross-source id collision strategy.** `dedup_project_over_global`
  dedups within `(source, id)`. If discovery is ever flattened across sources for
  invocation, `id` collisions across providers (two `review` skills) need a
  resolution rule. Today the menu keeps them separated by group, so it is fine.

---

## Risks & technical debt

| ID | Risk | Severity | Impact if ignored |
|---|---|---|---|
| W1 | Rust discovery built but unused | High | "Discovery done" illusion; code rots away from its future consumer |
| W2 | Two skill models, no reconciliation | High | Wiring discovery later requires unplanned bridge work; silent field loss (`availability`, `label`, `category`) |
| W4 | Workspace-scoped FS skills are a trust surface | Medium | Cloned repo could surface runnable skills once discovery is wired |
| W3 | `list_skills` caching comment is false | Medium | Misleads the next implementer about what exists |
| C1 | Token `data` lost on draft round-trip | Low | First consumer of `segment.data` after reload gets `undefined` |
| Scope | Chips + discovery shipped past the deferred plan | Low | Plan no longer reflects reality; review report stale |
| W5 | `parse_frontmatter` leftover iterator | Low | Cosmetic |

No P0/critical correctness defects in shipped user-facing behavior. The slash
menu works end to end against the static catalog.

---

## Recommendations

Prioritized, smallest-correct-change first. No code changed as part of this
audit.

1. **Decide the ownership of the catalog before writing more code.** Pick one of
   two target states and write it down:
   - (a) Discovery-first: `list_skills` becomes the source of truth; the static
     `SKILL_CATALOG` shrinks to Mozart-native seeds only and is merged with
     discovered skills. Requires the reconciliation layer (W2).
   - (b) Static-first (current de facto): keep the static catalog as the real
     system and treat the Rust discovery as not-yet-shipped. Then either delete
     the dead path or mark it clearly experimental/feature-flagged.
   This is the decision that unblocks everything else; it is genuinely the user's
   call (product timing, marketplace roadmap).

2. **Resolve W1 either way.** If keeping the Rust discovery, add a tracking task
   and a `// not yet wired` note at the command and the binding. If not, remove
   `list_skills`, the binding, and `skills/mod.rs` to stop the rot. Do not leave
   it silently dead.

3. **Fix the false caching comment (W3)** on `list_skills` regardless of the
   above. It is one paragraph and it lies about the system.

4. **Specify the model bridge (W2)** as a real task: Rust `SkillSource` →
   TS `{ kind, publisher }`, plus how `availability` / `label` / `category` are
   sourced for discovered skills (frontmatter? defaults?). This is the work the
   parallel-lanes plan never scheduled.

5. **Settle the trust policy for workspace skills (W4)** before discovery goes
   live. At minimum, treat `<workspace>/.{mozart,claude,codex}/skills` as
   untrusted-by-default and require an explicit opt-in, mirroring the reasoning
   already written in `skills.catalog.ts:1-5`.

6. **Update the plan / its review report.** Record that atomic chips and the
   discovery backend shipped despite being listed as deferred, so the spec
   matches the branch.

7. **Trigger-menu polish (Part 1):** document the single-char trigger limit;
   decide on C1 (serialize token data or document the loss); add tests for
   open-menu key ownership and blur-close.

8. **Minor cleanups:** `parse_frontmatter` leftover iterator (W5); consider
   matching `description` in slash search.

---

## Suggested next steps

1. Hold a short decision on Recommendation 1 (catalog ownership). One sentence of
   "done" definition. Everything downstream forks on it.
2. File tasks for W1 (resolve the orphan), W2 (model bridge spec), W3 (fix
   comment now), and W4 (trust policy). W3 is a free win today.
3. If discovery-first is chosen, sequence: model bridge → wire `listSkills` in
   `feature-workspace-composer` with a cache/refresh seam → trust policy →
   delete the static entries that discovery now provides.
4. If static-first is chosen, decide delete-vs-flag for the Rust subsystem and
   stop carrying unwired surface area.
5. Land the trigger-menu test + doc follow-ups (Recommendation 7) independently;
   they do not depend on the catalog decision.

---

## Validation checklist (not run — per project agent policy)

Recommended commands to verify the current state and any follow-up changes:

- Confirm the orphan: `grep -rn "listSkills" libs apps --include="*.ts" | grep -v _bindings.ts` (expect no callers).
- TS skills lib: `pnpm nx test desktop-skills-util` and `pnpm nx lint desktop-skills-util`.
- Composer slash logic: `pnpm nx test composer` (covers `slash-menu.logic.spec.ts`).
- Rust discovery: `cargo test -p` the desktop-tauri crate (covers `skills::tests`).
- Module boundaries: `tools/verify-scope-tags.sh`.
- Manual: type `/` in the composer, confirm grouping/filter/keyboard-nav/escape,
  switch model and confirm live re-filter, and confirm Backspace deletes a chip
  as a unit.
