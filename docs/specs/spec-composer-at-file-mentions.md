# Spec — Composer `@`-file mentions (multi-select context picker)

Status: eng-reviewed 2026-06-06 (decisions locked below), not implemented
Date: 2026-06-05
Related: `docs/specs/plan-composer-slash-skills-and-debug-view.md` (the `/` slash
menu this mirrors), `docs/audit-skills-and-trigger-menu.md`

> **Eng-review decisions (2026-06-06) — these override the original draft where they conflict:**
>
> - **Substrate:** the `@` menu is built **exactly like the `/` skill menu** —
>   Spartan **`BrnCommand` (cmdk)** in controlled mode inside `MzTriggerMenu`,
>   inline `@` trigger, **focus stays in the editor**. Multi-select is a Spartan
>   **`hlm-checkbox`** per row + a persistent selection `Set`. The literal
>   `hlm-select-multiple` / `hlm-combobox-multiple` are **rejected**: they are
>   `BrnPopover`-based, own their trigger, and steal focus (`autoFocus`), which is
>   incompatible with the caret-anchored, focus-retained trigger-menu model.
> - **Flat list, no sections:** one ordered list — **open-tab files → changed
>   files → everything else** (tail sorted `viewed_at` desc, then `localeCompare`),
>   deduped across tiers. Each row carries a **tiny badge** (open / status letter)
>   so the ranking is legible without section headers.
> - **`@path` is a reference, not content transport (path-only):** at send we do
>   **not** read or inline file contents. The raw `@path` text rides the prompt;
>   the envelope emits a **content-less** `AttachedContextItem { kind:'file',
label: path }`. Rationale: Mozart's providers (Claude Code, Codex, harness
>   agents) already have workspace file access; inlining wastes tokens and context.
>   The attachment model stays evolvable — a future provider that cannot read
>   workspace files can add a capability layer that selectively inlines content.
> - **Draft restore:** rebuild `@`-pills by **longest-match against the known
>   path set** from `ProjectFilesStore` (never whitespace-split — paths contain
>   `/`, `.`, and may contain spaces). If the path set is not loaded yet, **do not
>   corrupt the draft** — defer pill reconstruction / keep raw text until paths
>   are available.

---

## 1. Goal

Type `@` in the composer to open a file picker that adds one or more project
files to the prompt's **attached context**. Same trigger mechanics as the `/`
skill menu, but **multi-select**: filter by typing, toggle several files across
multiple filter passes, then commit the whole set with Enter.

Two things make it more than the skill menu:

1. **Multi-select with persistent selection.** The typed filter (`@test`) and the
   selection are independent. Backspacing the filter back to bare `@` clears the
   filter but keeps the already-checked files selected in the background. The
   user can filter again, check more, and Enter commits the union.
2. **Curated ordering + sections.** Files open in workspace tabs and files with
   uncommitted changes float to the top; the rest are all project files sorted
   by last-viewed date, then alphabetically.

On commit, the selected files become `attached_context` items on the run
envelope (the seam already exists, see §2).

---

## 2. What already exists (reuse, don't rebuild)

- **`@mozart-ui/trigger-menu` `MzTriggerMenu`** — the generic trigger directive.
  It already takes a `trigger` char, opens a caret-anchored CDK overlay, keeps
  focus in the editor, forwards arrow/enter via `ctx.onNavKey`, and inserts an
  atomic pill token. Built to be reused for exactly this (`@`). Needs one
  addition for multi-select (see §4 D1).
- **cmdk list pattern** — `libs/mozart-ui/composer/src/lib/mz-composer-slash-menu.ts`
  renders Spartan `BrnCommand` headless: controlled `[search]`, keyManager driven
  by `ctx.onNavKey`, scroll-into-view, group/empty handling. The `@` menu is the
  same shape plus a selected-state checkbox per row.
- **File list** — `commands.listTree(...)` → `FileNodeDto[]`
  (`apps/desktop-tauri/src/file_tree.rs`, cached via `file_tree_cache`,
  gitignore-aware). Source for "all project files".
- **Last-viewed date** — `workspace_file_views` table
  (`WorkspaceFileView { workspace_id, path, viewed_at, viewed_at_hash }`,
  `apps/desktop-tauri/src/db/workspace_file_views.rs`). Source for view-date sort.
  Needs a `list_by_workspace` read (only `upsert`/lookup exist today).
- **Open tabs** — `UiStateFacade.fileTabsFor(workspaceId) → PersistedFileTab[]`
  (`libs/desktop-ui-state-data-access`). Source for the "Open tabs" section.
- **Changed files** — `repos.listChangedFiles(workspaceId) → ChangedFile[]`
  (status + path). Source for the "Changes" section.
- **Attached-context seam** — `envelope.rs`
  `AttachedContextLayer { items: Vec<AttachedContextItem> }`,
  `AttachedContextItem { kind, label, content }`. v1 ships empty by design; the
  renderer already handles a non-empty Vec. `@`-files populate this. The debug
  view already renders this layer.

The static-catalog vs filesystem-discovery tension that bit the `/` menu does NOT
apply here: there is one source of truth (the repo), reached through existing
commands.

---

## 3. UX

Flat list, no section headers. Ordering encodes the tiers; a tiny per-row badge
makes that ordering legible.

```
  composer editor (contenteditable)
     │  user types '@'  → OPEN picker at caret (MzTriggerMenu, trigger='@')
     ▼   (focus stays in editor — same as the '/' menu)
  ┌──────────────────────────────────────────────┐
  │  ☑ src/app/foo.ts                    [open]    │  ← tier 1: open tabs
  │  ☐ src/app/bar.ts                    [open]    │
  │  ☑ src/lib/x.ts                       [M]      │  ← tier 2: changed files
  │  ☐ README.md                                   │  ← tier 3: everything else
  │  ☐ package.json                                │     (viewed_at desc, then A→Z)
  │  … (filtered live by the text after '@')       │
  ├──────────────────────────────────────────────┤
  │  2 selected · Enter to attach · Esc to cancel  │  ← footer affordance
  └──────────────────────────────────────────────┘

  Single flat list. Tiers are: open-tab files → changed files → everything else.
  A file in tier 1/2 is deduped out of the tail. Badge: [open] for tab files,
  status letter (M/A/…) for changed files; no badge for the tail.

  type   '@test'  → filter narrows (cmdk [search]); checked rows stay checked
  Space / click   → TOGGLE a file's selection (does NOT close)
  Backspace → '@' → filter clears; selection persists (background)
  Arrow ↑/↓       → move active row (scrolls into view, skips hidden)
  Enter           → commit ALL selected → @pills in composer + content-less
                    AttachedContextItem references (no file read at send)
  Esc / outside   → cancel; selection discarded; menu closes
```

Empty/edge states: no project files → "No files"; query matches nothing →
"No matches" (cmdk empty).

---

## 4. Architecture decisions (proposed — open for eng review)

### D1 — `MzTriggerMenu` gains a multi-select commit path

The directive's `ctx.select(item)` today inserts one token and closes. Multi-select
needs: toggling without closing, and a single commit of N items on Enter. Proposed
context additions (additive, single-select callers unaffected):

```ts
interface TriggerMenuContext<TData> {
  // …existing: query, data, select, close, onNavKey, menuId, setActiveDescendant
  readonly mode: 'single' | 'multi';          // from a new directive input
  readonly commit: (items: readonly unknown[]) => void;  // multi: insert N tokens, then close
}
```

- `[selectionMode]="'multi'"` input on `mzTriggerMenu`.
- In multi mode the menu owns the selection Set; `onNavKey('enter')` calls
  `ctx.commit(selectedItems)`. The directive inserts one pill per item at the
  trigger position (space-separated) and closes once.
- `select` stays the single-select fast path (click a row in single mode).

Alternative considered: keep the directive single-only and have the `@` menu
insert tokens itself via a separate API. Rejected — token insertion + caret
math is exactly what the directive owns; duplicating it re-creates the coupling
the audit warned about.

### D2 — Selection state lives in the menu, not the directive

The filter (`ctx.query()`) and the selection are orthogonal. The menu component
holds `selected = signal<Set<string>>` keyed by path. Filtering (typing/backspacing
after `@`) only changes `[search]`; it never touches `selected`. This is what makes
"backspace to `@`, selection persists" work. cmdk renders all rows; the active/visible
set is the filtered view; the checked state is read from `selected`.

```
  query   ──→ cmdk [search] ──→ visible rows           (transient)
  selected ─────────────────→ row checkbox state        (persists across query)
  Enter   ──→ commit(selected ∩ known files)            (union, order = sections)
```

### D3 — `desktop-files-data-access` thin store that REUSES `RepositoriesFacade` (no port)

**Revised in implementation (2026-06-06):** the originally-planned new store +
`FILES_PORT` + Tauri adapter is **rejected as duplication**. `RepositoriesFacade`
(`desktop-repositories-data-access`) already maintains a cached, FS-watcher-
refreshed file tree (`cachedTreeFor`) and changed-files split
(`cachedChangedFilesFor`), and `FileViewsFacade.viewsFor` already exposes
per-path `viewedAt` timestamps. So:

- `ProjectFilesStore` is a **thin reactive selector** over those existing
  facades + `UiStateFacade.fileTabsFor` — no new cache, no `FILES_PORT`, no new
  Tauri command. `fileEntriesFor(ws)` returns a `computed` that merges them via
  `mergeFileEntries`.
- The Rust `workspace_file_views::list_by_workspace` read (old T2) is **no longer
  needed** — `viewedAt` is already available client-side.

The pure ranking/merge stays a `desktop-files-util` selector (testable, no
Angular/Tauri), mirroring `desktop-skills-util`.

```
  listTree(repo)         ─┐
  listChangedFiles(ws)   ─┼─►  mergeFileEntries()  ─►  one flat ranked list
  fileTabsFor(ws)        ─┤        (pure, util)        (each entry: path, tier, badge)
  workspace_file_views   ─┘
```

Flat ordering (no sections). Each entry carries a `tier` and a display `badge`:

1. **tier 0 — open-tab files** (badge `open`)
2. **tier 1 — changed files** (badge = status letter `M`/`A`/…)
3. **tier 2 — everything else** (no badge), sorted `viewed_at desc` (from
   `workspace_file_views`), then path `localeCompare`.

A file present in tier 0 or 1 is de-duplicated out of tier 2 (and a file that is
both open and changed lands in tier 0). The `tier` field is what the sort keys on
**and** what the row badge renders from — so legibility is free, not extra model.

### D4 — Result: inline `@`-pills + content-less attached_context reference (path-only)

Two layers, consistent with how `/skill` works:

- **Editor**: each committed file inserts an atomic pill whose token value is
  `@<path>` (reuses `MzTriggerMenu` token mechanics; longest-match-against-known-
  paths rebuild for `@` on draft restore — see C1, not whitespace-split).
- **Send (path-only — RESOLVED, D4-Q below)**: the bare `@path` text rides the
  serialized prompt as the reference. The feature resolves each `@<path>` token →
  pushes a **content-less** `AttachedContextItem { kind: 'file', label: path }`
  onto the envelope's `attached_context`. **No file is read or inlined at send.**

Contract: `@path/to/file.ts` means **"this file is relevant context and is
available in the workspace."** The agent reads it with its own tools.

**D4-Q — RESOLVED: path-only reference (not content transport).** Mozart's
providers (Claude Code, Codex, harness agents) already have workspace file access,
so inlining content wastes tokens and adds context-window pressure for no value.
The attachment model stays **capability-aware and evolvable**: if a future
provider cannot read workspace files directly, add a provider-capability layer
that selectively inlines content (or exposes a Mozart file-reading tool) at that
time. We optimize for the architecture we actually have. Keeping a content-less
`AttachedContextItem` (rather than dropping it) is what preserves that evolution
hook and lets the debug view list attached files.

### D5 — Module placement

```
  desktop-files-util          (NEW) util — file entry model + merge/rank selectors (pure)
  desktop-files-data-access   (NEW) data-access — ProjectFilesStore + FILES_PORT
  mozart-ui/composer          (EDIT) ui — mz-composer-at-menu.ts (multi-select cmdk list)
  mozart-ui/trigger-menu      (EDIT) ui — add selectionMode + commit (D1)
  desktop-workspaces-feature  (EDIT) feature — wire store → menu, resolve tokens → context
  desktop-tauri               (EDIT) Rust — workspace_file_views::list_by_workspace; attach
                                       resolved files into attached_context at run start
```

---

## 5. Test coverage map (target 100% of new paths)

```
[+] desktop-files-util/merge.ts  (flat, tier-ranked)
  ├── [GAP] tier order: open-tab files → changed → tail; deduped across tiers
  ├── [GAP] file that is BOTH open AND changed lands in tier 0 (open), once
  ├── [GAP] tail sorted viewed_at desc then path localeCompare
  ├── [GAP] no views → tail is pure alphabetical
  ├── [GAP] each entry carries tier + badge (open / status letter / none)
  └── [GAP] empty repo → []
[+] desktop-files-util/split-file-tokens.ts  (C1 — longest-match restore)
  ├── [GAP] '@a/b.ts' rebuilt by longest-match vs known paths
  ├── [GAP] path WITH SPACES ('@src/my notes.ts') round-trips intact
  ├── [GAP] lookalike text ('@nope', 'a@b') stays plain (not a known path)
  └── [GAP] known-path set empty/not-loaded → keep raw text, no corruption
[+] desktop-files-data-access/project-files.store.ts
  ├── [GAP] caches per workspace; refresh on file-tree/changes events
  ├── [GAP] listTree/changed/tabs/views merged via the util
  └── [GAP] port error → empty + error state
[+] mozart-ui/trigger-menu (D1)
  ├── [GAP] multi mode: select toggles, does NOT close
  ├── [GAP] enter → commit(items) inserts N pills once, then closes
  └── [REGRESSION] single mode unchanged (skill menu still works)  ← CRITICAL
[+] mozart-ui/composer/mz-composer-at-menu.ts
  ├── [GAP] selection persists across [search] changes (filter → '@' → filter)
  ├── [GAP] selected file filtered OUT then Enter → commit uses full Set
  ├── [GAP] checkbox reflects selected Set; arrow nav scrolls (cmdk)
  └── [GAP] row badge renders from entry.tier (open / status / none)
[+] desktop-workspaces-feature
  ├── [GAP] commit → @pills inserted at caret (space-separated)
  └── [GAP] send → @path text preserved verbatim in prompt; content-less
            AttachedContextItem{kind:'file',label} emitted; NO file read
[+] Rust
  ├── [GAP] workspace_file_views::list_by_workspace
  └── [GAP] attached_context gets content-less file references at run start
            (path-only — assert no file read / no content field set)
```

---

## 6. Failure modes

| Path                | Failure                                   | Handling                                                                        |
| ------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| listTree            | huge repo (100k files)                    | cmdk filters in-memory; backend/indexed filter past N is deferred (§7). Flag.   |
| draft restore       | known-path set not loaded yet (race)      | do NOT corrupt the draft — defer pill rebuild / keep raw text until paths load. |
| stale path          | file deleted after select                 | path-only: `@path` stays as text; agent reports if missing. No send-time read.  |
| views read          | no rows for a fresh workspace             | tail falls back to alphabetical (no crash).                                     |
| selection vs filter | selected file filtered out then committed | commit uses the full `selected` Set, not the visible rows.                      |

Path-only removes the content/binary/size failure surface entirely (no read at
send). No silent + unhandled + critical path identified.

---

## 7. NOT in scope (defer)

- `@folder` (attach a directory tree), `@symbol`, `@url`, `@terminal` — the
  `AttachedContextItem.kind` field reserves these; ship `file` first.
- Backend/indexed fuzzy search for very large repos (in-memory cmdk filter first;
  revisit with a Rust/JS path index when repo size warrants — see C1 note).
- **Provider-capability content inlining** — path-only ships now. A future
  provider that can't read workspace files gets a capability layer that
  selectively inlines content (or a Mozart file-read tool). Deferred by design.
- Persisting the attached-context set across sessions (selection is per-compose).
- (Moot under path-only) content de-dup / token-budget trimming / `kind:'diff'`
  for changed files — no content is transported, so these don't apply.

---

## 8. Open decisions for eng review

1. **D1** multi-select: **RESOLVED** — extend `MzTriggerMenu` (cmdk + checkbox),
   reuse the `/` menu pattern. Literal `hlm-select-multiple` rejected (focus model).
2. **D4-Q** content vs path-only: **RESOLVED** — path-only reference, content-less
   `AttachedContextItem`. No read at send. (see D4)
3. Inline `@`-pills vs. a separate "context tray": **RESOLVED** — inline `@`-pills,
   "like the `/` skill menu". Flat list, per-row badge. No tray.
4. Large-repo threshold for in-memory filtering: **deferred** to §7 (indexed search).
5. `kind:'diff'` for changed files: **moot** under path-only (no content transport).

---

## 9. Implementation tasks (rough, post-review)

- [x] **T1** desktop-files-util — file entry model (`path, tier, badge`) +
      `mergeFileEntries` (flat, tier-ranked, deduped) + `flattenFilePaths` + tests. Done.
- [x] ~~**T2** Rust — `workspace_file_views::list_by_workspace`~~ — DROPPED.
      `FileViewsFacade.viewsFor` already exposes `viewedAt` client-side.
- [x] **T3** desktop-files-data-access — thin `ProjectFilesStore` reusing
      `RepositoriesFacade` + `FileViewsFacade` + `UiStateFacade` (no port, no
      second cache). Done. (Store DI test still to write.)
- [x] **T4** mozart-ui/trigger-menu — generalized to `[triggers]` array + `selectionMode` + `commit` multi-select path + Space-forward (multi only). Done. (REGRESSION test
      for single-mode `/` — CRITICAL — still to write.)
- [x] **T5** mozart-ui/composer — `mz-composer-at-menu.ts` (flat cmdk list, checkbox-style
      indicator per row, persistent selection Set, per-row badge). Done. (Component test to write.)
- [x] **T6** desktop-workspaces-feature — store → `[fileItems]` → `@` menu, refresh on
      ws change. Send resolution handled in Rust (T7), not the frontend. Done.
- [x] **T7** Rust — `context_compiler` extracts `@path` mentions from the sent message
      and emits content-less `AttachedContextItem { kind:'file', label }` references,
      validated by existence (stat, not read). nbsp-aware, trailing-punctuation-tolerant.
      Done + 3 unit tests.
- [ ] **T8** mozart-ui/composer — `splitFileTokens` longest-match-vs-known-paths draft
      rebuild (handles `/`, `.`, spaces; safe when path set not loaded) + tests.
      Lives in the composer UI lib beside `splitSkillTokens` (NOT in
      desktop-files-util) — `mozart-ui` (`scope:mozart-ui`) must not depend on
      `app:desktop` libs; the host feature supplies the known-path set.

---

## Worktree parallelization strategy

| Step | Modules touched            | Depends on      |
| ---- | -------------------------- | --------------- |
| T1   | desktop-files-util         | —               |
| T8   | desktop-files-util         | T1 (shares lib) |
| T2   | desktop-tauri (db)         | —               |
| T7   | desktop-tauri (envelope)   | T2              |
| T3   | desktop-files-data-access  | T1, T2          |
| T4   | mozart-ui/trigger-menu     | —               |
| T5   | mozart-ui/composer         | T4              |
| T6   | desktop-workspaces-feature | T3, T5, T7      |

- **Lane A:** T1 → T8 (sequential, shared `desktop-files-util`)
- **Lane B:** T2 → T7 (sequential, shared `desktop-tauri`)
- **Lane C:** T4 → T5 (sequential, shared `mozart-ui`)
- T3 waits on A+B; T6 is the final integration, waits on C + T3 + T7.

Execution: launch **A, B, C in parallel worktrees**. Merge. Then T3, then T6.
No two parallel lanes share a module directory → no conflict flags.

---

## GSTACK REVIEW REPORT

| Review        | Trigger               | Why                             | Runs | Status       | Findings                              |
| ------------- | --------------------- | ------------------------------- | ---- | ------------ | ------------------------------------- |
| CEO Review    | `/plan-ceo-review`    | Scope & strategy                | 0    | —            | —                                     |
| Codex Review  | `/codex review`       | Independent 2nd opinion         | 0    | —            | —                                     |
| Eng Review    | `/plan-eng-review`    | Architecture & tests (required) | 1    | CLEAR (PLAN) | 5 decisions resolved, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps                      | 0    | —            | —                                     |
| DX Review     | `/plan-devex-review`  | Developer experience gaps       | 0    | —            | —                                     |

- **UNRESOLVED:** 0 — all five review decisions (substrate, open-trigger, attach-mode, row-markers, pill round-trip) were answered.
- **Scope outcome:** SCOPE_REDUCED — path-only deleted the content/binary/size machinery; flat list removed section grouping. 8 tasks, all P1.
- **VERDICT:** ENG CLEARED — ready to implement. UI scope is non-trivial (composer flat-list multi-select); `/plan-design-review` is optional but reasonable before build.
