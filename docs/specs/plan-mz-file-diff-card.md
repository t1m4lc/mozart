# Plan — MzFileDiffCard

> **Scope** : new reusable file-diff card under `libs/mozart-ui/`, GitHub-PR-inspired.
> **Source** : engineering review of the UX spec (review session 2026-05-21).
> **Status** : ready to implement after review approval.
> **Branch** : `main` → cut a feature branch before starting.

## 1. Problem

We want a generic UI primitive that represents **a single file modified in a review**
— collapsible card, header with path/copy/expand-all/stats/status, body with unified
diff table, hunk headers, hunk-expand bars, and proper handling for added / deleted /
renamed / binary / too-large / no-diff states. Inspired by GitHub PR diff; rendered
with Mozart's design system (Spartan NG + Tailwind v4 + theme tokens).

Today, **the diff body is already implemented** inside `apps/desktop` for the workspace
right-aside use case (`DiffView`, `UiHunkExpandBar`, `util-diff-parser`). What is
**missing** is the file-block wrapper — collapsible header + status branches + active
state + a clean, reusable lib-level packaging.

## 2. Scope decision (locked)

**Option chosen: Promote + wrap (full cleanup).**

- Promote `DiffView`, `UiHunkExpandBar`, `util-diff-parser` from
  `apps/desktop/src/app/domains/repositories/` into 4 sibling libs under
  `libs/mozart-ui/`.
- Dedupe `UiDiffStats` (apps/desktop) with `MzDiffStats` (lib). Keep `MzDiffStats`.
- Build `MzFileDiffCard` in a new lib that composes the above.
- Migrate every existing consumer to the lib versions.

## 3. NOT in scope

| Excluded | Why |
|---|---|
| File-list / PR-review surface that mounts many cards | Future feature; the card is a building block, not the page. |
| Streaming-diff support (chunked `diffText` updates) | No current driver; parser re-run is fine for whole-diff input. |
| Virtual scroll for "Show anyway" mega-diffs | Opt-in cost the user accepts when they click the button. |
| Side-by-side (split) diff view | Plan specifies unified diff only. |
| Inline comments / review threading | Out of this card; future review-pane work. |
| Syntax highlighting of diff lines | Not requested; current `DiffView` doesn't do it; matching GitHub's tokenization is a separate effort. |
| Word-level / character-level diff inside a line | Not requested; out of scope. |
| Auto-collapse for huge files | Caller decides via `status='too-large'`. |
| Header chrome for `FeatureFileDiff`'s markdown vs diff tab | Stays in `FeatureFileDiff`; the card is presentational. |

## 4. What already exists (sources of truth before this PR)

| Existing | Location | Disposition |
|---|---|---|
| `DiffView` (renderer) | `apps/desktop/src/app/domains/repositories/ui-diff-view/ui-diff-view.ts` | **Promote** → `libs/mozart-ui/diff-view/` as `MzDiffView`. Strip path header (moves to card). Add `expandAll()` method. Add per-gap error state. |
| `UiHunkExpandBar` | `apps/desktop/src/app/domains/repositories/ui-hunk-expand-bar/ui-hunk-expand-bar.ts` | **Promote** → `libs/mozart-ui/hunk-expand-bar/` as `MzHunkExpandBar`. |
| `util-diff-parser` | `apps/desktop/src/app/domains/repositories/util-diff-parser/util-diff-parser.ts` + `.spec.ts` | **Promote** → `libs/mozart-ui/diff-parser/`. Preserve spec verbatim. Export names: `parseGroupedDiff`, `parseUnifiedDiff`, `DiffLine`, `DiffHunk`, `DiffLineKind`, `ParsedDiff`. |
| `UiDiffStats` | `apps/desktop/src/app/domains/repositories/ui-diff-stats.ts` | **Delete** after callers migrate to `MzDiffStats`. |
| `MzDiffStats` | `libs/mozart-ui/diff-stats/src/lib/mz-diff-stats.ts` | **Keep**. Add `aria-label` parity from the apps/desktop copy. |
| `FeatureFileDiff` | `apps/desktop/src/app/domains/repositories/feature-file-diff/feature-file-diff.ts` | **Refactor** to render `MzFileDiffCard` wrapping the diff/markdown body. Markdown tab stays in `FeatureFileDiff`. |
| `hunk-expand-bar.sandbox.ts` | `apps/desktop/src/app/pages/sandbox/` | **Move** → `apps/sandbox/src/app/hunk-expand-bar.sandbox.ts`. |

Consumers of the deleted/promoted symbols:

- `apps/desktop/src/app/domains/workspaces/feature-file-content/feature-file-content.ts` — re-export update only (uses `FeatureFileDiff` already).
- `apps/desktop/src/app/domains/workspaces/feature-workspace-files.ts` — swap `UiDiffStats` → `MzDiffStats`.
- `apps/desktop/src/app/domains/workspaces/ui/workspace-row/workspace-row.ts` — already on `MzDiffStats`. No change.
- `apps/desktop/src/app/domains/repositories/ui-file-tree-row/ui-file-tree-row.ts` — swap `UiDiffStats` → `MzDiffStats`.
- `apps/desktop/src/app/domains/repositories/index.ts` — drop the removed exports.

## 5. Architecture

### 5.1 Dependency graph

```
                       libs/mozart-design-tokens
                       (--diff-add-bg, --diff-remove-bg,
                        --diff-hunk-bg, --diff-add-marker-fg,
                        --diff-remove-marker-fg)
                                  ▲
                                  │ (CSS vars consumed via Tailwind v4)
                                  │
   ┌──────────────────────────────┴──────────────────────────────┐
   │                                                              │
   │   libs/mozart-ui/file-diff-card  (MzFileDiffCard)            │
   │                ▲    ▲    ▲                                   │
   │                │    │    │                                   │
   │   ┌────────────┘    │    └──────────────┐                    │
   │   │                 │                   │                    │
   │   │  libs/mozart-ui/diff-view           │                    │
   │   │  (MzDiffView, header-stripped)      │                    │
   │   │              ▲           ▲          │                    │
   │   │              │           │          │                    │
   │   │   libs/mozart-ui/        libs/mozart-ui/                 │
   │   │   diff-parser            hunk-expand-bar                 │
   │   │   (pure TS)              (MzHunkExpandBar)               │
   │   │                                                          │
   │   └─ libs/mozart-ui/diff-stats (MzDiffStats — existing)      │
   │                                                              │
   │   + Spartan primitives (collapsible, badge, button,          │
   │     icon, tooltip)                                           │
   └──────────────────────────────────────────────────────────────┘
                                  ▲
                                  │ scope:app
                                  │
   apps/desktop  ⇒  FeatureFileDiff  ⇒  MzFileDiffCard
   apps/sandbox  ⇒  file-diff-card.sandbox + hunk-expand-bar.sandbox
```

### 5.2 Module boundaries

Every new lib gets `scope:mozart-ui` in its `project.json` `tags`. After scaffolding,
run `bash tools/verify-scope-tags.sh` to confirm — a missing tag silently exempts the
lib from `@nx/enforce-module-boundaries`.

Allowed imports (per CLAUDE.md):
- `scope:mozart-ui` → `scope:mozart-ui | scope:spartan | scope:shared`

The 4 new libs only import from `libs/spartan-ui/*` (Spartan) and from each other.

### 5.3 Public API

#### `MzFileDiffCard`

```ts
// libs/mozart-ui/file-diff-card/src/lib/mz-file-diff-card.ts
export type FileDiffStatus =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'binary'
  | 'too-large'
  | 'no-diff';

@Component({ selector: 'mz-file-diff-card', ... })
export class MzFileDiffCard {
  // Identity
  readonly path = input.required<string>();
  readonly oldPath = input<string | null>(null); // only meaningful when status='renamed'
  readonly status = input<FileDiffStatus>('modified');

  // Stats
  readonly additions = input<number>(0);
  readonly deletions = input<number>(0);

  // Diff body (forwarded to MzDiffView when status renders the body)
  readonly diffText = input<string>('');
  readonly loading = input<boolean>(false);
  readonly error = input<string | null>(null);
  readonly fetchContext = input<FetchContextLines | null>(null);
  readonly fileLineCount = input<number | null>(null);

  // UI state
  readonly defaultCollapsed = input<boolean>(false);
  readonly active = input<boolean>(false);

  // Outputs
  readonly refresh = output<void>();
  readonly copy = output<string>();              // emitted with path on successful copy
  readonly copyError = output<Error>();          // emitted with the rejection
  readonly showAnyway = output<void>();          // emitted when too-large 'Show anyway' clicked
  readonly toggleCollapsed = output<boolean>();  // emitted with new collapsed value
}
```

ASCII layout of the rendered card:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ▾  src/app/feature/foo.ts                  [MOD]  +12 −4  ▆▆▂▁     │  ← header (always visible)
│   [copy] [expand-all]                                       [↻]    │
├─────────────────────────────────────────────────────────────────────┤
│ @@ -10,7 +10,8 @@ fn foo()                                          │  ← hunk header
│  ctx10                                                              │  ← context
│  ctx11                                                              │
│  ctx12                                                              │
│ -old13                                                              │  ← remove (rose bg)
│ +new13                                                              │  ← add    (emerald bg)
│ +inserted13a                                                        │
│  ctx14                                                              │
│  ctx15                                                              │
│  ctx16                                                              │
│ ──────── ▲ 34 hidden lines ▼ ────────                               │  ← expand bar
│ @@ -50,6 +51,5 @@ fn bar()                                          │
│  ctx50                                                              │
│ -old52                                                              │
│  ctx54                                                              │
└─────────────────────────────────────────────────────────────────────┘
```

Collapsed:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ▸  src/app/feature/foo.ts                  [MOD]  +12 −4  ▆▆▂▁     │
└─────────────────────────────────────────────────────────────────────┘
```

Active (`active=true`):

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓  ← ring/border accent
┃ ▾  src/app/feature/foo.ts                  [MOD]  +12 −4  ▆▆▂▁     ┃
┃   ...                                                               ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

Renamed:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ▾  src/old/path.ts → src/new/path.ts          [REN]  +12 −4  ▆▆    │
└─────────────────────────────────────────────────────────────────────┘
```

Status placeholders:

```
binary      │ Binary file changed.
too-large   │ Diff too large to render (5,234 additions, 1,892 deletions).  [ Show anyway ]
no-diff     │ No textual changes.
```

#### `MzDiffView` (post-strip)

```ts
@Component({ selector: 'mz-diff-view', ... })
export class MzDiffView {
  readonly path = input<string | null>(null);
  readonly diffText = input<string>('');
  readonly fetchContext = input<FetchContextLines | null>(null);
  readonly fileLineCount = input<number | null>(null);

  expandAll(): void; // NEW — public method, invoked by MzFileDiffCard via viewChild
}
```

What was removed: the entire path-header `<div>` (path + refresh button) — the card
owns header chrome now. Loading / error / empty messaging stays inside MzDiffView for
when it's used standalone.

#### `MzHunkExpandBar`

Unchanged surface; selector/class rename only.

#### `mozart-ui/diff-parser`

Pure-TS lib. Re-exports the existing symbols verbatim:

```ts
export { parseGroupedDiff, parseUnifiedDiff } from './lib/diff-parser';
export type { DiffLine, DiffHunk, DiffLineKind, ParsedDiff } from './lib/diff-parser';
```

### 5.4 State ownership

```
MzFileDiffCard                            MzDiffView
─────────────────────                     ───────────────────
collapsed: signal<bool>                   stateByPath: signal<Map<path, PathState>>
copyState: signal<'idle'|'copied'|'err'>  parsedDiff: computed(parseGroupedDiff(diffText))
                                          renderItems: computed(buildRenderItems(...))
toggle()    → collapsed.set(!collapsed)   onExpand(gap, evt)
copyPath()  → navigator.clipboard         expandAll()  ← NEW (called via viewChild)
expandAll() → viewChild(MzDiffView)?.expandAll()
```

`stateByPath` survives across `path` input changes — preserves expansion state when a
caller switches files in a single `MzDiffView` instance. Within a card list (one
`MzDiffView` per card), `stateByPath` is effectively a single-entry map; documented
as a dual-purpose data structure.

### 5.5 Diff design tokens (added to `libs/mozart-design-tokens`)

```css
/* libs/mozart-design-tokens/src/lib/base.css (light) */
:root {
  --diff-add-bg: oklch(0.95 0.05 145 / 0.6);
  --diff-remove-bg: oklch(0.95 0.05 25 / 0.6);
  --diff-hunk-bg: oklch(0.95 0.04 240 / 0.5);
  --diff-add-marker-fg: oklch(0.55 0.15 145);
  --diff-remove-marker-fg: oklch(0.55 0.15 25);
}

/* dark mode override */
.dark {
  --diff-add-bg: oklch(0.30 0.06 145 / 0.4);
  --diff-remove-bg: oklch(0.30 0.06 25 / 0.4);
  --diff-hunk-bg: oklch(0.30 0.05 240 / 0.4);
  --diff-add-marker-fg: oklch(0.70 0.15 145);
  --diff-remove-marker-fg: oklch(0.70 0.15 25);
}
```

> Numeric values shown are placeholders — the implementer tunes them against the
> existing emerald/rose look during sandbox dogfooding so the visual change vs the
> current `DiffView` is intentional, not accidental. The contract is the token names.

Consumers reference them via Tailwind v4 arbitrary values: `bg-[var(--diff-add-bg)]`,
`text-[var(--diff-add-marker-fg)]`, etc. The existing `bg-emerald-500/[0.08]` literals
in `DiffView` are replaced during promotion.

## 6. Implementation plan (atoms + lanes)

Each atom is one commit (per CLAUDE.md). Atoms within a lane are sequential; lanes are
parallelizable.

### Lane A — Promote `util-diff-parser` → `mozart-ui/diff-parser`

1. **A1** Scaffold lib: `pnpm nx g @nx/js:lib mozart-ui/diff-parser --tags=scope:mozart-ui --bundler=none --unitTestRunner=vitest` (or matching existing pattern). Verify `prefix: "mz"` in `project.json`.
2. **A2** Move `util-diff-parser.ts` → `libs/mozart-ui/diff-parser/src/lib/diff-parser.ts`. Update internal imports. Re-export from `src/index.ts`.
3. **A3** Move `util-diff-parser.spec.ts` verbatim → `libs/mozart-ui/diff-parser/src/lib/diff-parser.spec.ts`. Update import path. Run `pnpm nx test mozart-ui-diff-parser` — must pass with no fixture changes.
4. **A4** Delete original `apps/desktop/src/app/domains/repositories/util-diff-parser/` directory. Update `apps/desktop/src/app/domains/repositories/index.ts` re-exports.

### Lane B — Promote `UiHunkExpandBar` → `mozart-ui/hunk-expand-bar`

1. **B1** Scaffold lib (same pattern as A1, with `prefix: "mz"`).
2. **B2** Move component, rename class `UiHunkExpandBar` → `MzHunkExpandBar`, selector `app-hunk-expand-bar` → `mz-hunk-expand-bar`. Update internal imports.
3. **B3** Add spec `mz-hunk-expand-bar.spec.ts` covering: direction=up shows only up button, direction=down shows only down, direction=both shows both; shift-click doubles count; linesAvailable=0 disables both buttons; emit count capped at linesAvailable.
4. **B4** Delete original `apps/desktop/src/app/domains/repositories/ui-hunk-expand-bar/`. Update repositories barrel.

### Lane C — Add diff design tokens

1. **C1** Add the 5 CSS variables (light + dark) to `libs/mozart-design-tokens/src/lib/base.css`. Update README if one exists.

### Lane D — Promote `DiffView` → `mozart-ui/diff-view` (depends on A + B)

1. **D1** Scaffold lib. Add deps on `mozart-ui/diff-parser` and `mozart-ui/hunk-expand-bar`.
2. **D2** Move component, rename `DiffView` → `MzDiffView`, selector `app-diff-view` → `mz-diff-view`. Update imports.
3. **D3** **Strip path header.** Remove the top `<div class="flex h-8 ...">` block (path + refresh button) and the `HlmButtonImports` import. Update template + host classes. Remove the `refresh` output (caller surfaces refresh).
4. **D4** Replace `bg-emerald-500/[0.08]` / `bg-rose-500/[0.08]` / `bg-sky-500/[0.06]` literals with the new tokens via `bg-[var(--diff-add-bg)]` etc. Light and dark stay token-driven.
5. **D5** Add `expandAll()` public method: walks every gap, computes max remaining count, calls the existing `onExpand` machinery for each direction. Bounded by `fileLineCount`. No-op if `fetchContext` is null.
6. **D6** Add per-gap error state to `PathState` (e.g. `errors: ReadonlyMap<gapIndex, string>`). `onExpand`'s `.catch` populates it. `buildRenderItems` adds `{ kind: 'expand-error', gapIndex, message }` rendered as a retry strip in place of the expand bar. (This is the bundled-in TODO from review section 5.)
7. **D7** Add spec covering: `buildRenderItems` with 0 hunks → preamble only; with N hunks → N+1 gap slots; gap 0 starting at line 1 → no bar; last gap with `fileLineCount=null` → no bar. `computeExpandRange`: direction=down with gap 0 → null; direction=up with last gap + null fileLineCount → null; fully expanded → null; beyond fileLineCount → clamped. `bumpExpansion` + `mergeCache`: path change preserves prior path's state. `expandAll()`: 0 gaps → no fetch; N gaps → N fetches; 0 available → skipped. Per-gap error: rejected fetch populates errors map.
8. **D8** Delete original `apps/desktop/src/app/domains/repositories/ui-diff-view/`.

### Lane E — Dedupe `MzDiffStats`

1. **E1** Add `aria-label` computed property to `MzDiffStats` (parity with apps/desktop `UiDiffStats`).
2. **E2** Update `apps/desktop/src/app/domains/repositories/ui-file-tree-row/ui-file-tree-row.ts` and `apps/desktop/src/app/domains/workspaces/feature-workspace-files.ts` to import from `@mozart-ui/diff-stats`.
3. **E3** Delete `apps/desktop/src/app/domains/repositories/ui-diff-stats.ts`. Update repositories barrel.

### Lane F — Build `MzFileDiffCard` (depends on C + D + E)

1. **F1** Scaffold lib `libs/mozart-ui/file-diff-card/`. Deps on `mozart-ui/diff-view`, `mozart-ui/diff-stats`, Spartan primitives (`collapsible`, `badge`, `button`, `icon`, `tooltip`).
2. **F2** Implement `MzFileDiffCard` per §5.3 API:
   - Header with chevron (Spartan Collapsible trigger), path (with rename arrow logic), copy button, expand-all button, `MzDiffStats`, status badge.
   - Body via `@if (!collapsed())` mounting `<mz-diff-view>` for textual statuses, placeholder div for binary/too-large/no-diff.
   - `copyPath()` with tooltip morph and 1.5s reset timer (cleared on destroy).
   - `expandAll()` via `viewChild(MzDiffView)`.
   - Active state via `ring-2 ring-ring/30` on the host (or equivalent token-based accent).
3. **F3** Spec `mz-file-diff-card.spec.ts` covering every branch in §7.1 coverage diagram.

### Lane G — Migrate `FeatureFileDiff` (depends on F)

1. **G1** Refactor `FeatureFileDiff` to render `<mz-file-diff-card>` wrapping the diff/markdown body. Markdown tab UI moves into the card slot or stays as a header above. Refresh wired through `(refresh)` output. (One commit; behavior preserved.)
2. **G2** Add regression spec `feature-file-diff.spec.ts` covering: markdown vs diff mode switching, diff fetch on workspace/path/refreshTick change, fileBody cache invalidation on tick, fetchContext callback wiring, stale-response (fetchId) handling, copy/copyError surface through to caller.

### Lane H — Sandbox + Apps/Sandbox (depends on B + F)

1. **H1** Move `apps/desktop/src/app/pages/sandbox/hunk-expand-bar.sandbox.ts` → `apps/sandbox/src/app/hunk-expand-bar.sandbox.ts`. Update imports to `@mozart-ui/hunk-expand-bar`. Wire route in `apps/sandbox/src/app/app.routes.ts`.
2. **H2** Create `apps/sandbox/src/app/file-diff-card.sandbox.ts` with examples for every status, active=true, defaultCollapsed=true, renamed (with arrow), binary, too-large + showAnyway, no-diff, long diff with multiple hunks + expand bars. Include a "list of 5 cards" example for visual review. Wire route.
3. **H3** Delete the old apps/desktop sandbox file and update its route.

### Execution order

```
Wave 1 (parallel): A, B, C, E
Wave 2          : D       (after A + B)
Wave 3          : F       (after C + D + E)
Wave 4 (parallel): G, H   (after F)
```

## 7. Tests

### 7.1 Coverage diagram

```
CODE PATHS                                                       USER FLOWS
[+] libs/mozart-ui/file-diff-card/                               [+] Workspace right-aside diff (regression)
  └── MzFileDiffCard                                               ├── [REGRESSION] Select file → diff renders
      ├── toggle() expand/collapse                                 ├── [REGRESSION] Switch files preserves per-path state
      │   ├── [GAP→★★★] default expanded → toggle → collapsed     ├── [REGRESSION] Refresh button triggers fetch
      │   └── [GAP→★★★] defaultCollapsed=true → toggle → expanded ├── [REGRESSION] Markdown file → preview tab still works
      ├── status branches                                          └── [REGRESSION] FS-watcher tick re-fetches + clears cache
      │   ├── [GAP→★★★] modified|added|deleted|renamed → MzDiffView
      │   ├── [GAP→★★★] binary → "Binary file" placeholder       [+] Empty/edge UX
      │   ├── [GAP→★★★] too-large → "Show anyway" + (showAnyway)   ├── [GAP→★★] No path selected (sandbox eyeball)
      │   └── [GAP→★★★] no-diff → "No textual changes"             ├── [GAP→★★] Empty diff (no changes)
      ├── rename display                                           └── [GAP→★★] Loading → first paint
      │   ├── [GAP→★★★] renamed + oldPath !== path → arrow
      │   └── [GAP→★★★] renamed + oldPath === path → single
      ├── copyPath()
      │   ├── [GAP→★★★] success → tooltip 'Copied!' 1.5s + (copy)
      │   ├── [GAP→★★★] failure → 'Copy failed' + (copyError)
      │   └── [GAP→★★★] reset timer cleared on destroy
      ├── expandAll()
      │   ├── [GAP→★★★] viewChild present → forwards
      │   └── [GAP→★★★] viewChild absent (status=binary) → no-op
      └── active class
          └── [GAP→★★] active=true → ring/border accent applied

[+] libs/mozart-ui/diff-view/   (currently 0 tests)
  └── MzDiffView
      ├── buildRenderItems
      │   ├── [GAP→★★★] no hunks → preamble only
      │   ├── [GAP→★★★] N hunks → N+1 gap slots
      │   ├── [GAP→★★★] gap 0 with hunk @ line 1 → no bar
      │   └── [GAP→★★★] last gap + fileLineCount=null → no bar
      ├── computeExpandRange
      │   ├── [GAP→★★★] direction=down + gap 0 → null
      │   ├── [GAP→★★★] direction=up + last gap + null fileLineCount → null
      │   ├── [GAP→★★★] fully expanded → null
      │   └── [GAP→★★★] beyond fileLineCount → clamped
      ├── bumpExpansion + mergeCache
      │   ├── [GAP→★★★] path change preserves prior path's state
      │   └── [GAP→★★★] mergeCache with stale path ignored
      ├── expandAll() (NEW)
      │   ├── [GAP→★★★] no fetcher → no-op
      │   ├── [GAP→★★★] N gaps remaining → N fetch calls
      │   └── [GAP→★★★] gap with 0 available → skipped
      └── per-gap error state (NEW)
          └── [GAP→★★★] fetchContext rejects → retry strip rendered

[+] libs/mozart-ui/hunk-expand-bar/   (currently 0 tests)
  └── MzHunkExpandBar
      ├── showUp/showDown
      │   ├── [GAP→★★★] direction=up → only up
      │   ├── [GAP→★★★] direction=down → only down
      │   └── [GAP→★★★] direction=both → both
      ├── [GAP→★★★] shift-click doubles step
      └── [GAP→★★★] linesAvailable=0 disables, no emit

[+] libs/mozart-ui/diff-parser/   (MOVED — keep 100%)
  └── parseGroupedDiff + parseUnifiedDiff → [★★★ TESTED — preserve fixtures verbatim]

[+] apps/desktop  (FeatureFileDiff regression — currently 0 tests, CRITICAL gap)
  └── feature-file-diff.spec.ts (NEW)
      ├── [GAP→★★★] markdown vs diff mode switch on isMarkdownPath
      ├── [GAP→★★★] diff fetch on workspaceId/path/refreshTick change
      ├── [GAP→★★★] fileBody cache invalidation on refreshTick
      ├── [GAP→★★★] fetchContext callback fetches + slices correctly
      ├── [GAP→★★★] stale fetchId discards results
      └── [GAP→★★★] copy/copyError outputs pass through to host

LLM integration: none in scope.

COVERAGE TARGET: 100% of new branches + 100% regression of existing FeatureFileDiff flow.
QUALITY TARGET: ★★★ on every gap (behavior + edge + error path).
NO E2E in this PR (per review decision).
```

### 7.2 Test files

| File | Purpose |
|---|---|
| `libs/mozart-ui/diff-parser/src/lib/diff-parser.spec.ts` | Existing fixtures moved verbatim. |
| `libs/mozart-ui/hunk-expand-bar/src/lib/mz-hunk-expand-bar.spec.ts` | NEW — direction, shift-click, disabled state. |
| `libs/mozart-ui/diff-view/src/lib/mz-diff-view.spec.ts` | NEW — buildRenderItems, computeExpandRange, bumpExpansion, expandAll, per-gap error. |
| `libs/mozart-ui/file-diff-card/src/lib/mz-file-diff-card.spec.ts` | NEW — every branch in §7.1 card section. |
| `apps/desktop/src/app/domains/repositories/feature-file-diff/feature-file-diff.spec.ts` | NEW — regression suite. CRITICAL per IRON RULE: existing component has 0 tests. |

All 4 new lib `project.json` files get a `test` target (Vitest, matching the existing
pattern used by parser spec).

## 8. Failure modes

| Failure | Test? | Error handling? | User-visible? |
|---|---|---|---|
| `navigator.clipboard.writeText` rejects (insecure context) | ✓ (`copyPath failure`) | ✓ tooltip morphs to 'Copy failed' + `(copyError)` | ✓ tooltip + caller toast option |
| `fetchContext` rejects during expand | ✓ (per-gap error state) | ✓ retry strip replaces expand bar (D6) | ✓ inline "Failed to load — retry" |
| `expandAll()` called with `fetchContext=null` | ✓ | ✓ no-op | n/a (button can be disabled by caller) |
| `expandAll()` called with `status=binary` (no MzDiffView mounted) | ✓ | ✓ viewChild undefined → no-op | n/a |
| `status` flips mid-flight (e.g. modified → binary) | covered by `status branches` test | ✓ `@if` unmounts MzDiffView, state lost | acceptable; caller owns status |
| `oldPath === path` with `status='renamed'` | ✓ (rename display) | ✓ single path rendered | ✓ no broken arrow |
| User clicks "Show anyway" on enormous diff → browser hangs | n/a (opt-in) | n/a | accepted; documented limit |
| `MzDiffView` mounted with `diffText=''` and no hunks | covered (no hunks branch) | ✓ "No changes" placeholder inside MzDiffView | ✓ |

**No critical gaps remaining** — the previously-silent expand-bar failure is fixed
in atom D6 as part of this PR (the bundled TODO from review).

## 9. TODOS.md updates

None. The only candidate (expand-bar load-failed visible state) was bundled into this
PR per review decision — see atom D6.

## 10. Parallelization (worktree strategy)

| Lane | Modules touched | Depends on |
|---|---|---|
| A — diff-parser promotion | `libs/mozart-ui/diff-parser`, `apps/desktop/src/app/domains/repositories/util-diff-parser`, repositories barrel | — |
| B — hunk-expand-bar promotion | `libs/mozart-ui/hunk-expand-bar`, `apps/desktop/.../ui-hunk-expand-bar`, repositories barrel | — |
| C — diff tokens | `libs/mozart-design-tokens` | — |
| D — diff-view promotion + strip + tokens + expandAll + error | `libs/mozart-ui/diff-view`, `apps/desktop/.../ui-diff-view`, repositories barrel | A, B |
| E — diff-stats dedupe | `libs/mozart-ui/diff-stats`, `apps/desktop/.../ui-diff-stats`, `apps/desktop/.../ui-file-tree-row`, `apps/desktop/.../feature-workspace-files` | — |
| F — MzFileDiffCard | `libs/mozart-ui/file-diff-card` | C, D, E |
| G — FeatureFileDiff migration + regression spec | `apps/desktop/.../feature-file-diff` | F |
| H — sandbox migration + new sandbox | `apps/sandbox`, `apps/desktop/.../pages/sandbox` | B, F |

Execution: **Lane A + B + C + E in parallel worktrees → merge → Lane D → Lane F → Lane G + H in parallel.**

Conflict flags:
- Lanes A, B, D, E all touch `apps/desktop/src/app/domains/repositories/index.ts` (barrel). **Sequential edits required** when merging — keep changes small and merge in order A, B, E, then D.
- Lane H touches `apps/desktop/src/app/pages/sandbox/` (delete) and `apps/sandbox/src/app/` (add). No conflict between the two.

## 11. Completion summary

- Step 0: Scope Challenge — **scope reduced per recommendation** (Promote + wrap chosen; no parallel-implementation duplication).
- Architecture Review: **4 issues found**, all resolved (lib granularity = 4 siblings; DiffView header stripped; too-large status-driven with Show anyway; diff semantic tokens added).
- Code Quality Review: **2 issues found**, all resolved (oldPath added for rename; copy feedback via tooltip morph + outputs).
- Test Review: **diagram produced, 34+ gaps identified, all addressed in the plan** (4 spec files added; FeatureFileDiff regression spec added per IRON RULE).
- Performance Review: **0 issues** (too-large valve + lazy mount via `@if` cover the concerns).
- NOT in scope: **written** (§3).
- What already exists: **written** (§4).
- TODOS.md updates: **0 items deferred** (only candidate bundled in atom D6).
- Failure modes: **0 critical gaps remaining** after D6.
- Outside voice: **skipped this round** (user did not request).
- Parallelization: **4 waves, 8 lanes** (4 parallel in Wave 1, 1 in Wave 2, 1 in Wave 3, 2 parallel in Wave 4).
- Lake Score: **4/4 ask-recommendations chose the complete option** (full cleanup, full test coverage, semantic tokens, build-now error state).

## 12. Unresolved decisions

None.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run; UI primitive, scope is engineering-shaped |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 6 issues found, 6 resolved; 0 critical gaps; 0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run; spec covers UX intent; recommend before implementation |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a |

- **UNRESOLVED:** 0 decisions across all reviews.
- **VERDICT:** ENG CLEARED — ready to implement. Recommend `/plan-design-review` before starting since the visual treatment (active state accent, status badge palette, token tuning) benefits from a design pass.
