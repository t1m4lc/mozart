# Spec — Composer `@`-file mentions (multi-select context picker)

Status: draft spec (not yet eng-reviewed, not implemented)
Date: 2026-06-05
Related: `docs/specs/plan-composer-slash-skills-and-debug-view.md` (the `/` slash
menu this mirrors), `docs/audit-skills-and-trigger-menu.md`

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

```
  composer editor (contenteditable)
     │  user types '@'  → OPEN picker at caret (MzTriggerMenu, trigger='@')
     ▼
  ┌──────────────────────────────────────────────┐
  │  ☐  Open tabs                                  │  ← section: files in tabs
  │     ☑ src/app/foo.ts                           │
  │     ☐ src/app/bar.ts                           │
  │  ☐  Changes (3)                                │  ← section: uncommitted
  │     ☑ src/lib/x.ts            M                 │
  │  ☐  All files                                  │  ← view-date desc, then A→Z
  │     ☐ README.md                                │
  │     ☐ package.json                             │
  │  … (filtered live by the text after '@')       │
  ├──────────────────────────────────────────────┤
  │  2 selected · Enter to attach · Esc to cancel  │  ← footer affordance
  └──────────────────────────────────────────────┘

  type   '@test'  → filter narrows (cmdk [search]); checked rows stay checked
  Space / click   → TOGGLE a file's selection (does NOT close)
  Backspace → '@' → filter clears; selection persists (background)
  Arrow ↑/↓       → move active row (scrolls into view, skips hidden)
  Enter           → commit ALL selected → @pills in composer + attached context
  Esc / outside   → cancel; selection discarded; menu closes
```

Empty/edge states: no project files → "No files"; query matches nothing →
"No matches" (cmdk empty); a section with zero items is hidden.

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

### D3 — New `desktop-files-data-access` lib + a merged list source

Mirror `desktop-skills-data-access`: a `ProjectFilesStore` (cached per workspace)
that merges three sources into one ranked list, plus a port. The pure ranking/merge
is a `desktop-files-util` selector (testable, no Angular/Tauri), mirroring
`desktop-skills-util`.

```
  listTree(repo)         ─┐
  listChangedFiles(ws)   ─┼─►  mergeFileEntries()  ─►  ranked + sectioned list
  fileTabsFor(ws)        ─┤        (pure, util)
  workspace_file_views   ─┘
```

Ranking within "All files": `viewed_at desc` (from `workspace_file_views`), then
path `localeCompare`. "Open tabs" and "Changes" are separate top sections; a file
in a section is de-duplicated out of "All files".

### D4 — Result: inline `@`-pills + attached_context at send

Two layers, consistent with how `/skill` works:

- **Editor**: each committed file inserts an atomic pill whose token value is
  `@<path>` (reuses `MzTriggerMenu` token mechanics; `splitSkillTokens`-style
  rebuild for `@` on draft restore).
- **Send**: the feature resolves each `@<path>` token in the serialized prompt →
  reads the file → pushes an `AttachedContextItem { kind: 'file', label: path,
  content }` onto the envelope's `attached_context`. The bare `@path` text still
  rides the prompt so the agent sees the reference; the content is attached, not
  inlined into the user message.

Open question (D4-Q): embed file content at send vs. send only the path and let
the agent read it via its own tools. Recommend **attach content** for non-harness
providers and small files, with a per-file size cap; defer large-file/binary
handling (see §6). Flag for eng + a provider-cost check.

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
[+] desktop-files-util/merge.ts
  ├── [GAP] tabs + changes float to top sections, deduped from All files
  ├── [GAP] All files sorted viewed_at desc then path asc
  ├── [GAP] no views → pure alphabetical
  └── [GAP] empty repo → []
[+] desktop-files-data-access/project-files.store.ts
  ├── [GAP] caches per workspace; refresh on file-tree/changes events
  ├── [GAP] listTree/changed/tabs/views merged via the util
  └── [GAP] port error → empty + error state
[+] mozart-ui/trigger-menu (D1)
  ├── [GAP] multi mode: select toggles, does NOT close
  ├── [GAP] enter → commit(items) inserts N pills once, then closes
  └── [REGRESSION] single mode unchanged (skill menu still works)
[+] mozart-ui/composer/mz-composer-at-menu.ts
  ├── [GAP] selection persists across [search] changes (filter → '@' → filter)
  ├── [GAP] checkbox reflects selected Set; arrow nav scrolls (cmdk)
  └── [GAP] '@path' token rebuild on draft restore
[+] desktop-workspaces-feature
  ├── [GAP] commit → @pills inserted at caret
  └── [GAP] [→E2E] send → attached_context items carry file content
[+] Rust
  ├── [GAP] workspace_file_views::list_by_workspace
  └── [GAP] attached_context populated from resolved @paths at run start
```

---

## 6. Failure modes

| Path | Failure | Handling |
|---|---|---|
| listTree | huge repo (100k files) | cap + lazy; cmdk filters in-memory — may need backend filter past N. Flag. |
| attach content | large/binary file | per-file byte cap; skip binary (detect), attach a "binary, N bytes" stub or omit. |
| stale path | file deleted after select | resolve-at-send skips missing files; pill shows but item dropped (or warn). |
| views read | no rows for a fresh workspace | fall back to alphabetical (no crash). |
| selection vs filter | selected file filtered out then committed | commit uses the full `selected` Set, not the visible rows. |

No silent + unhandled + critical path identified, given the size cap and
skip-missing rules.

---

## 7. NOT in scope (defer)

- `@folder` (attach a directory tree), `@symbol`, `@url`, `@terminal` — the
  `AttachedContextItem.kind` field reserves these; ship `file` first.
- Backend fuzzy search for very large repos (in-memory cmdk filter first).
- Persisting the attached-context set across sessions (selection is per-compose).
- Content de-duplication / token-budget trimming of attached files.

---

## 8. Open decisions for eng review

1. **D1** multi-select: extend `MzTriggerMenu` (recommended) vs. menu-owned insertion.
2. **D4-Q** attach file *content* vs. path-only reference (provider cost / harness).
3. Inline `@`-pills vs. a separate "context tray" above the composer for selected files.
4. Large-repo threshold where in-memory filtering stops being acceptable.
5. Whether "Changes" should attach the *diff* (`kind: 'diff'`) rather than full content.

---

## 9. Implementation tasks (rough, post-review)

- [ ] **T1** desktop-files-util — file entry model + `mergeFileEntries` (sections + rank) + tests
- [ ] **T2** Rust — `workspace_file_views::list_by_workspace` (+ binding)
- [ ] **T3** desktop-files-data-access — `ProjectFilesStore` + `FILES_PORT` (cache/refresh) + tests
- [ ] **T4** mozart-ui/trigger-menu — `selectionMode` + `commit` multi-select path + tests
- [ ] **T5** mozart-ui/composer — `mz-composer-at-menu.ts` (multi-select cmdk list) + tests
- [ ] **T6** desktop-workspaces-feature — wire store → `@` menu; resolve `@path` tokens
- [ ] **T7** Rust — populate `attached_context` from resolved files at run start + tests
- [ ] **T8** composer — `@`-token rebuild on draft restore (mirror `splitSkillTokens`)
