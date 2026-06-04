# Phase A — Foundation Refactor Architecture Analysis

> Read-only diagnosis of `apps/desktop/src/app` before the routing refactor
> to `/project/:projectId/workspace/:workspaceId/tab/:tabId`. No code is
> changed here. Sections A–G describe current state + problems found.
> Section H proposes a pragmatic target. **KISS, no over-engineering.**

**Date:** 2026-05-22  **Branch:** `main`  **Scope:** `apps/desktop/src/app`

---

## Executive summary

The codebase **already follows the Angular Architects domain/layer pattern**
(`domains/<name>/{data, feature-*, ui-*, util-*}`). `ARCHITECTURE.md` codifies
three conventions and they are mostly upheld. This is good news — the
foundation is more present than absent. The work is **tightening boundaries
that already exist**, not introducing them.

The diagnosis identified six headline issues. After human review
(2026-05-22), only the first two are actioned pre-routing-refactor ; the
rest are deferred. They are recorded below for context.

1. **Actioned now: `shell/shell-project-list.ts` bypasses several `workspaces`
   public-API exports via deep imports** — the structural violation worth
   fixing before the routing refactor.
2. **Actioned now: `ui-message-markdown` is shared cross-domain** (`chat` and
   `repositories`) but lives in `chat/`. Belongs in `libs/mozart-ui/`.
3. *Deferred:* `runs` is functionally a tab type inside `workspaces`, not a
   peer domain. Same for `terminals`. Both manage one xterm-per-workspace.
   Conceptually correct to collapse but not required before routing/state
   refactor.
4. *Deferred to routing refactor:* `ui-state` mixes "selected ids" with
   "per-workspace UI prefs" (aside tabs, file view flow, tree expansion).
   The split is natural once the new route owns per-workspace UI state.
5. *Deferred to routing refactor:* `FileTabsService` lives in
   `workspaces/data` but is session UI state — will be replaced by `:tabId`
   route params after the refactor.
6. *Deferred:* Several "smart features" exceed 400-500 lines (only
   `feature-workspace-files` is an obvious split candidate ; defer until
   the routing refactor makes the seam natural). Comment hygiene
   (G1/G2 — scattered plan identifiers like "P0.3 / R0.3.E") is touched
   as-you-go.

**There is no big-bang refactor here.** A small, ordered sequence of moves
will land the structure the routing refactor needs without changing any
product behavior. Section H lists them.

---

## A. Domain boundary diagnosis

### Current state

```
apps/desktop/src/app/
├── core/                  cross-domain glue + Tauri-typed bindings
├── shell/                 AppShell + cross-domain sidebar composer
├── pages/                 routed shells (dashboard, settings, etc.)
└── domains/
    ├── auth/              welcome route, Clerk deep-link, session
    ├── chat/              chats, messages, streaming, queue
    ├── llm-model/         pure stream parser + reducer + providers
    ├── onboarding/        4-step wizard, tour, get-started bootstrap
    ├── profile/           Anthropic + GitHub connections, notification prefs
    ├── projects/          project list, dialogs (add/clone/init/create)
    ├── repositories/      file tree, diffs, commit, PR, file views
    ├── runs/              per-workspace run-command xterm
    ├── tasks/             per-project task seed (1:1 with workspace in MVP)
    ├── terminals/         per-workspace PTY xterm
    ├── ui-state/          activeWorkspaceId + per-workspace UI prefs
    └── workspaces/        workspace entity, detail page, branch picker,
                           file tabs, IDE detection, install state, etc.
```

12 domains. All are named after product concepts (projects, workspaces,
chats, runs, terminals, etc.), not technical buckets. `ARCHITECTURE.md`
documents the layout.

### Problems found

| # | Problem | Severity |
|---|---|---|
| A1 | **`runs` and `terminals` are sibling micro-domains around the same primitive (xterm + PTY per workspace).** `runs/data/run-registry.service.ts` and `terminals/data/terminal-registry.service.ts` are near-duplicate shapes — both `providedIn:'root'`, both keep a `Map<workspaceId, {term, fit, status\|close}>`, both wire xterm event handlers to a Tauri channel. `runs.facade` even imports `TerminalEvent` from the `terminals` index. Read against the routing refactor's mental model, both will become tabs inside a workspace: `/workspace/:id/tab/run` and `/workspace/:id/tab/terminal`. They are not separate domains — they are two implementations of one "PTY tab" pattern. | **Important** |
| A2 | **`repositories` is the unusual case of a "noun" domain whose every method takes `workspaceId`.** It owns the file tree, diff viewer, file-view tracker, commit dialog, and PR dialog — all reads/writes against a single workspace's worktree. The product vocabulary is **changes** (per CLAUDE.md). The folder name "repositories" leaks the Git noun; nothing the user sees ever says "repository" — they see Project (the registered repo) and Changes (the diff). The split between `workspaces` (entity + status + branches) and `repositories` (files + diffs + commits inside that workspace) is real, but the **naming** is a leftover. | **Nice-to-have** |
| A3 | **`ui-state` is two domains in one.** Today it holds: (a) `activeWorkspaceId` + `expandedProjectIds` + `collapsedStatusIds` (genuine cross-cutting "what's selected" state, app-global), and (b) `asideStateByWorkspace` + `fileViewStateByWorkspace` + `treeExpandedByWorkspace` (per-workspace UI preferences persisted to localStorage). After the routing refactor, the per-workspace UI state should be **scoped to the route**, not a global Map keyed by id. So `ui-state` will be split anyway; flagging now so the split is intentional, not accidental. | **Important** |
| A4 | **`tasks` is data-only and may be a misleading domain name.** `tasks/index.ts` exposes a facade + adapter + types, and that's it. `apps/desktop/src/app/domains/tasks/` is 7 files / 149 lines. `ARCHITECTURE.md` describes it as "per-project task seed (1:1 with workspaces in MVP)". In product vocabulary, a Task is the user intent that produces a Workspace — but the current data model has tasks as a separate row that workspaces foreign-key to. The domain is consistent with the data model, but a future reader expecting "tasks" to be a UI-visible thing will be confused. **Not worth touching today.** | **Nice-to-have** |
| A5 | **No "files" or "changes" domain** — the file/diff surface is split between `repositories` (logic) and `workspaces` (`feature-file-content`, `feature-workspace-files`, `FileTabsService`). The seam runs through `feature-workspace-files.ts` which imports from `repositories`, `ui-state`, AND `workspaces` to compose the "Files + Changes" pane. Conceptually there is one **file viewing surface** here; structurally it lives in two domains. Not a leak — both imports go through public index — but worth noting as the routing refactor will want a single owner for the file-tab route. | **Nice-to-have** |
| A6 | **No outright duplicated domains, no artificial domains.** Every domain has real-world referent + meaningful state or behavior. No "shared", no "common", no "helpers" pretending to be a domain. The vocabulary check (worktree / HEAD / agent-wip-) holds in the UI. | — |

### Verdict

**Domains are mostly right.** The diagnosis is: collapse `runs`+`terminals`,
rename `repositories`, and split `ui-state` later when the routing refactor
makes the split natural. Don't force `tasks` or `files` into being more than
they are.

---

## B. Layer boundary diagnosis (feature / ui / data-access / util)

### Current state

The convention is consistently:

- `data/` — stores, facades, adapter tokens + implementations, DTOs, mappers
- `feature-*` — smart components (route hosts, orchestrators, dialog roots)
- `ui-*` — presentational components (rows, cards, menus, dialogs)
- `util-*` — pure helpers (relative-time formatter, JWT decoder, name generator)

| Domain | data | feature | ui | util |
|---|---|---|---|---|
| auth | facade, store?, adapter, model, dto | feature-welcome | ui-welcome-card | util-clerk-url, util-decode-jwt, util-parse-deep-link |
| chat | facade, store, adapter, dto, mapper, model | feature-chat-list, feature-chat-content | message-list, agent/user/system message components, message-markdown | — |
| llm-model | adapter, providers config, stream/event types + reducer + fixtures | — | — | — |
| onboarding | facade, model, adapter (4), 4× tauri impl | feature-step-* (5), feature-tour, feature-claude-login-pty, feature-git-status | ui-onboarding-stepper, ui-step-shell, ui-disclosure-card, ui-tour-closing-card | util-git-install-instructions |
| profile | facade, model (2), adapter | feature-connections, feature-notification-prefs | ui-* (7 dialogs/cards) | — |
| projects | facade, store, adapter, mapper, model, dto, mock | feature-add-project | ui-* (8 components: row, menu, dialogs, filter, empty state) | — |
| repositories | facade (2), store, adapter, mapper, model, cache store | feature-file-tree, feature-file-diff, feature-file-toolbar, feature-commit-dialog, feature-create-pr-dialog | ui-changes-context-menu, ui-confirm-discard-dialog, ui-file-tree-row, ui-file-tree-skeleton | util-status-badge |
| runs | facade, adapter, model, registry service | feature-workspace-run | — | — |
| tasks | facade, store, adapter, mapper, model, dto | — | — | — |
| terminals | facade, adapter, model, registry service | feature-workspace-terminal | — | — |
| ui-state | facade, store | — | — | — |
| workspaces | facade, store, adapter, mapper, model, dto, mock, status, file-tabs.service, ide-detection.service, open-in-tools | feature-detail (page + store), feature-workspace-aside, feature-workspace-middle, feature-workspace-files, feature-workspace-processes, feature-chat-tab-bar, feature-file-content | ui/* (10 components: row, toolbar, menus, empty states, branch-picker, status-menu, etc.) | util-workspace-name, util-relative-time |

### Problems found

| # | Problem | Severity |
|---|---|---|
| B1 | **Naming inconsistency: `feature-*.ts` flat vs `feature-*/feature-*.ts` nested.** `onboarding/` is flat (`feature-claude-login-pty.ts`, `feature-git-status.ts`). `workspaces/` is nested (`feature-workspace-middle/feature-workspace-middle.ts`). Both are valid layouts; one is for single-file features, the other for multi-file features. The mix is fine functionally, but a contributor seeking pattern consistency will pick one and disagree with the other. | **Nice-to-have** |
| B2 | **No `ui/` subfolder convention.** `workspaces/ui/` is the only domain with a nested `ui/` subfolder grouping presentational components — every other domain uses flat `ui-*.ts` files. This drift happened organically. Either choice is fine; pick one and apply uniformly. | **Nice-to-have** |
| B3 | **`workspaces/data/file-tabs.service.ts` is data-access by location but UI-state by behavior.** Holds `Map<workspaceId, openPaths>` + `Map<workspaceId, activePath>` in-memory; no Tauri call, no persistence, no DTO mapping. Imported deep by 3 features. It does not belong in `data/` — it belongs in `ui-state/` (with the rest of the per-workspace UI prefs) or as a peer service. | **Important** |
| B4 | **`workspaces/data/ide-detection.service.ts` is shared cross-feature state, not strictly data-access.** Stores the list of IDEs the user has on PATH. Used by `feature-detail` and `feature-add-project` (projects domain may also read it indirectly). Fine to leave here; just naming it a "service" rather than a store/facade is correct. Mostly inert. | — |
| B5 | **No `ui/` layer for `chat` siblings.** The chat UI components (`message-list`, `agent-message`, `user-message`, `setup-progress-message`, `system-info-message`, `ui-message-markdown`) are in `domains/chat/ui/<name>/<name>.ts` AND `domains/chat/ui-message-markdown/<name>.ts` — i.e. both styles in the same domain. Tiny inconsistency. | **Nice-to-have** |
| B6 | **`onboarding/data/` houses both the abstract adapter ports AND the Tauri implementations** (`tauri-*.adapter.ts`). Convention elsewhere is: port in the domain, Tauri impl is provided in `core/tauri-adapters.ts`. Onboarding co-locates the impl, then `core/tauri-adapters.ts` deep-imports it. **Two equally reasonable choices; the inconsistency is the problem, not either choice.** | **Nice-to-have** |
| B7 | **Layer separation is otherwise clean.** No `ui-*` component imports a store. No `data/` imports a feature. The pattern is honored. | — |

---

## C. Component responsibility audit

### Largest smart components (lines, no spec/no template stripping)

| Lines | File |
|---|---|
| 728 | `domains/chat/data/chat.facade.ts` |
| 584 | `core/tauri-adapters.ts` |
| 552 | `domains/workspaces/feature-workspace-files.ts` |
| 533 | `domains/workspaces/feature-file-content/feature-file-content.ts` |
| 516 | `shell/shell-project-list.ts` |
| 429 | `domains/workspaces/data/workspace.facade.ts` |
| 420 | `domains/workspaces/feature-workspace-middle/feature-workspace-middle.ts` |
| 363 | `domains/workspaces/feature-detail/workspace-detail.page.ts` |
| 328 | `domains/repositories/feature-file-tree/feature-file-tree.ts` |
| 321 | `domains/repositories/feature-file-diff/feature-file-diff.ts` |
| 319 | `domains/onboarding/feature-onboarding-step-provider.ts` |

`core/_bindings.ts` (2201 lines) is **tauri-specta auto-generated** and out of scope.

### Per-component findings

| # | Component | Diagnosis | Recommendation | Severity |
|---|---|---|---|---|
| C1 | `domains/workspaces/feature-workspace-files.ts` (552 LOC) | Owns: (a) tabs UI (All files / Changes), (b) FS watcher attach/detach lifecycle, (c) initial fetch + cache-miss orchestration, (d) `agentRunTerminated` listener and auto-route to Changes, (e) staged/unstaged grouping, (f) toggle-staged / discard / copy-path actions, (g) the full template with two tabs and a 25-line row template. The component combines: file tree shell + changes list + FS-watch effect + agent-event listener + git mutations. This is the clearest "too many hats" component in the codebase. | **Split into:** (i) `feature-workspace-files` keeps the tabs container + watcher attach lifecycle, (ii) extract `feature-changes-list` (sibling) owning the Changes tab content + the staged/unstaged grouping + the agent-run auto-route effect + mutation actions, (iii) keep the row template inline in `feature-changes-list`. Do NOT extract a `ChangedFileRow` dumb component — used once with no reuse. | **Important** |
| C2 | `domains/workspaces/feature-file-content/feature-file-content.ts` (533 LOC) | Owns: (a) edit-vs-diff mode tabs, (b) file load + baseline + SHA hash, (c) editor value/dirty/saving signals, (d) save + stale-conflict + frozen banner, (e) scroll-persist for the diff surface only, (f) view-mark integration with `FileViewsFacade`. Dense but **all responsibilities are about "displaying one file"** — one cohesive thing. Splitting would create dumb pass-through children. | **Keep as-is.** The size is intrinsic complexity. If anything is extractable later, it's the save/load logic into a `FileContentStore` to free the component to focus on UI; not needed today. | — |
| C3 | `shell/shell-project-list.ts` (516 LOC) | Owns: (a) two render modes (groupBy=project, groupBy=status), (b) drag-to-reorder projects, (c) per-row data lookups across projects + workspaces + chat + diff-stats facades, (d) rename / status / pin / unread / delete actions, (e) workspace context menu wiring, (f) empty-state and ghost-row handling. It is — by `ARCHITECTURE.md` Convention #2 — the legal cross-domain composer. So density is expected. The split would only artificially separate "group-by-project view" from "group-by-status view" which would force template duplication. | **Keep as-is.** It's the architectural seam; that's what seams look like. | — |
| C4 | `domains/workspaces/feature-detail/workspace-detail.page.ts` (363 LOC) | Owns: routing-resolved id input, workspace + project derivations, current-branch + target-branch effects, file-tab vs chat decision, openIn / commit / createPr / run / stopRun actions, and 3 effect blocks. **This is the workspace route host.** Its size matches what a route page does — every action that lives "on this page" routes through here. | **Keep as-is.** Once the routing refactor lands, this page becomes `/project/:projectId/workspace/:workspaceId` and its responsibilities shrink because tabs will be route children. | — |
| C5 | `domains/workspaces/feature-workspace-middle/feature-workspace-middle.ts` (420 LOC) | Owns: composer wiring + chat scroll orchestration (at-bottom detector, attach/detach, programmatic scroll grace window, per-tab restore, message-arrival auto-follow). The scroll orchestration is the bulk. **One cohesive responsibility: managing the chat scroll surface.** | **Keep as-is.** Splitting "composer" from "scroll orchestrator" would just create a dumb composer child with the same lifetime as the parent. | — |
| C6 | `domains/chat/data/chat.facade.ts` (728 LOC) | Owns: hydration, send/queue/cancel, assistant turn loop (event-by-event reducer apply), persistent content/status/turn-state flushes, queue-second-message-while-streaming, terminal-state notification, chat lifecycle (create/close/rename), `setActiveChat`. This is a fat facade — but **the assistant turn loop is genuinely one operation that has to coordinate every persistence touchpoint**. Splitting into multiple files creates indirection without simplifying the loop. | **Keep as-is.** If anything, extract `_runAssistantTurn` + flush helpers into a private `chat-stream-orchestrator.ts` alongside the facade (data/ stays the home). Not blocking the routing refactor. | **Nice-to-have** |
| C7 | `domains/workspaces/data/workspace.facade.ts` (429 LOC) | Owns: list/hydrate, install lifecycle (signal Map), create-with-pending-row, branches list, status transitions (with reopen confirmation hook), pin/unread/rename mutations, merge action, diff-stats refresh. **All ops are on workspaces or workspace-scoped.** The install-state Map is unusual for a facade — could move to `ui-state` or a peer service — but it's a small section. | **Keep as-is.** Optionally lift `_installs` Map into its own `workspace-install.service.ts` if more workspace-scoped lifecycle state arrives. Not needed today. | — |
| C8 | `core/tauri-adapters.ts` (584 LOC) | The central Tauri↔domain wiring file. Every domain adapter token is bound here. **Size is structural — one provider function per domain.** Splitting per-domain bind into separate files would obscure the "all Tauri bindings live in one place" invariant. | **Keep as-is.** | — |
| C9 | `domains/onboarding/feature-onboarding-step-provider.ts` (319 LOC) | One step of the wizard with all its dialog/state plumbing. | **Keep as-is.** | — |

### Verdict

**One real split:** `feature-workspace-files.ts → + feature-changes-list`.
Everything else is "dense but cohesive" or "dense because it's the seam".
No fake dumb children.

---

## D. State ownership audit

### Classification

| Scope | What lives here today | Notes |
|---|---|---|
| **App / global** | `shared-util-theme` (ThemeService — theme + dark mode), `core/layout.service.ts` (left/right panel open + compact viewport), `core/connectivity.service.ts` (online/offline), `core/window-focus.service.ts`, `domains/profile/data/notification-prefs.adapter`, `core/feature-flags.ts` | Correct level. |
| **Project** | `domains/projects/data/project.store` (list, sort, hidden, hover, expanded, groupBy, mergeMode cache, runCommand) | Correct level. |
| **Workspace (collection-level)** | `domains/workspaces/data/workspace.store` (workspace entities) | Correct level. |
| **Workspace (per-workspace)** | `domains/workspaces/data/workspace.facade._installs` (install lifecycle Map), `domains/workspaces/data/workspace.facade._diffStats` (Map), `domains/workspaces/data/file-tabs.service` (open files Map + active Map), `domains/workspaces/data/ide-detection.service`, `domains/repositories/data/file-views.store` (per-workspace file-viewed Map), `domains/repositories/data/file-tree-cache.store`, `domains/runs/data/run-registry.service` (xterm + status Map), `domains/terminals/data/terminal-registry.service` (xterm + close Map), `domains/ui-state/data/ui-state.store` (`asideStateByWorkspace`, `fileViewStateByWorkspace`, `treeExpandedByWorkspace`) | **Spread across 7 different homes.** All are per-workspace and would become route-scoped after the refactor. |
| **App-global selection** | `domains/ui-state/data/ui-state.store` (`activeWorkspaceId`, `expandedProjectIds`, `collapsedStatusIds`) | Correct level. |
| **Chat (per-workspace, per-chat)** | `domains/chat/data/chat.store` (chats + messages by workspace/chat), `domains/chat/data/chat.facade.activeRuns` (in-flight Map), `domains/chat/data/chat.facade._activeChatByWorkspace`, `_lastActivityByWorkspace`, `pendingFlush` | Correct level. |
| **Tab / file-tab (per-workspace, per-tab)** | `core/scroll-position.service.ts` (scrollTop + attach mode by tabKey), `domains/workspaces/data/file-tabs.service` (open/active by workspace), `domains/repositories/data/file-views.store` | These will collapse into route params + per-route-scoped state after the refactor. |
| **Component local** | Component `signal()` + `linkedSignal()` for editor value, dirty flag, save error, dialog state, edit/inline-rename | Correct level. |

### Problems found

| # | Problem | Severity |
|---|---|---|
| D1 | **`FileTabsService` (in `workspaces/data/`) holds per-workspace UI state that conceptually belongs with `ui-state`.** The state is session-only, in-memory Maps keyed by workspaceId. It is the same kind of thing as `ui-state.store.fileViewStateByWorkspace`. | After the routing refactor, file tabs become route-scoped (`/tab/:tabId`). Today's `FileTabsService` exists because the route param doesn't exist yet. **Don't move it now** — moving session state from one Map to another adjacent Map adds churn for zero behavior change. The routing refactor will obsolete this service. **Important to KNOW; nice-to-have to act.** | **Nice-to-have** |
| D2 | **`ui-state` mixes global selection with per-workspace UI prefs.** Today: `activeWorkspaceId` + `expandedProjectIds` + `collapsedStatusIds` are app-global ; `asideStateByWorkspace` + `fileViewStateByWorkspace` + `treeExpandedByWorkspace` are workspace-scoped and localStorage-persisted. | After the routing refactor, the second group should attach to the workspace route's resolver/scoped store rather than living in a global Map. Surface the seam now in a comment; act on it during the routing refactor. | **Important** |
| D3 | **`workspaces.facade._installs` and `workspaces.facade._diffStats` are signal Maps inside the facade.** Both are per-workspace lifecycle state ; both belong "next to the workspace entity" but exist on the facade rather than the store. Not a problem — facades can own ephemeral signal Maps — but if a third such map appears, lift them to a `workspace-state.service.ts` peer to the entity store. | **Nice-to-have** |
| D4 | **`run-registry` and `terminal-registry` hold xterm instances** (not just data — actual `Terminal` objects from xterm.js, plus FitAddon) at app scope. This is correct because xterm must outlive route changes (terminal output survives navigating away). The "registry holds heavyweight per-workspace UI objects" pattern is the right call. | — |
| D5 | **No state is owned at the wrong scope as a bug.** No app-global component holds workspace-specific state ; no per-workspace component holds app-global state. Pre-empting the easy win: there are no `signal()` declarations in `ui-*` presentational components anywhere I checked. | — |

---

## E. Duplication audit

### Real duplication worth flagging

| # | Pattern | Where | Severity |
|---|---|---|---|
| E1 | **Per-workspace xterm-+-PTY registry pattern** | `runs/data/run-registry.service.ts` (~95 LOC) and `terminals/data/terminal-registry.service.ts` (~175 LOC) implement the same shape: `providedIn:'root'`, `Map<workspaceId, {term, fit, ...}>`, `ensureEntry`/`getOrCreate`, lifecycle on PTY exit. `runs` is read-only (`disableStdin: true`), `terminals` is interactive (write+resize+theme effect). The intersection is large. | **Important** |
| E2 | **`toast.error('Could not X', { description: errorMessage(err) })` boilerplate** | Repeated 6+ times in `shell-project-list.ts` alone (rename / pin / unread / delete project / hide / status). Mostly fine — a generic helper would obscure the message. Don't unify. | — (do not act) |
| E3 | **Optimistic-update / rollback pattern in `workspace.facade`** | `setStatus`, `reopen`, `togglePinned`, `toggleUnread`, `markRead`, `rename`, `setLastMergeAction` all follow the exact same shape: read current → optimistic set → try adapter → catch + revert. 7 occurrences. **A generic helper would be a bad abstraction** — each method's revert-on-error needs the specific previous value, which is field-specific. The repetition reads clearly; abstracting would make it less clear. | — (do not act) |
| E4 | **`unwrap` + bespoke `mergeLocally` unwrap in `tauri-adapters.ts`** | `unwrap` is reused everywhere ; `mergeLocally` has a one-off because it needs to preserve the typed `AppError.kind`. Comment explains why. **Real edge case ; don't unify.** | — |
| E5 | **`TerminalEvent` type duplicated as a DTO and a model** | `core/_bindings.ts` has `TerminalEvent` (DTO from Rust), `domains/terminals/data/terminal-event.model.ts` has `TerminalEvent` (model). `core/tauri-adapters.ts` has a `toTerminalEventModel` mapper. This is the **right separation** — DTOs from the wire, models in the domain — even though both are tiny discriminated unions. | — |
| E6 | **`crypto.randomUUID()` wrapper duplicated** | `workspace.facade.ts:424` (`cryptoRandomUUID()`), and `chat.facade.ts:481` uses `crypto.randomUUID()` directly. Tiny. Probably fine. | — |
| E7 | **No store-method duplication, no DTO mapper duplication, no Tauri command wrapper duplication.** | The Tauri provider in `tauri-adapters.ts` is structurally repetitive (one provider function per adapter) but that repetition is the file's purpose. | — |
| E8 | **No UI duplication of meaningful note.** Workspace status menus, file rows, and dialog headers all use Spartan/Hlm primitives consistently. | — |

### Verdict

**One real consolidation: `runs`+`terminals` registry.** Everything else is
either intentionally explicit or would become a bad abstraction if unified.

---

## F. Import direction audit

### Convention

Per `ARCHITECTURE.md` Convention #1: domains import each other only through
their `index.ts`. Shell is the only legal cross-domain composer. Within a
domain: `feature → ui → util` and `feature → data-access → util`.

### Violations found

| # | Violation | Files | Severity |
|---|---|---|---|
| F1 | **`shell-project-list.ts` reaches into `workspaces/data/` and `workspaces/ui/` for 6 imports** | `shell/shell-project-list.ts:36-45`: `WorkspaceContextMenu`, `WorkspaceEmptyState`, `WorkspaceRow` (all from `domains/workspaces/ui/...`), `WorkspacesFacade` from `data/`, `Workspace` model from `data/`, `UI_WORKSPACE_STATUSES` + `UiWorkspaceStatus` + `UiWorkspaceStatusMeta` from `data/`. **The `WorkspaceContextMenu`, `WorkspaceEmptyState`, and `WorkspaceRow` components are NOT re-exported from `workspaces/index.ts`.** This is the violation. | **Critical** |
| F2 | **`shell-right.ts` reaches into `domains/workspaces/ui/merge-action-menu/`** | `shell/shell-right.ts:21`: `MergeActionMenu` is not in `workspaces/index.ts`. | **Important** |
| F3 | **`onboarding/onboarding.guard.ts` imports `../auth/dev-bypass`** (deep import into sibling domain) | `onboarding.guard.ts:3` deep-imports `isDevAuthBypassActive` from `../auth/dev-bypass`. The function IS re-exported from `auth/index.ts`. The import should be `from '../auth'`. | **Important** |
| F4 | **`projects/data/project.facade.ts` deep-imports `workspaces/data/workspace-status`** | `project.facade.ts:7`: `UI_WORKSPACE_STATUSES` is re-exported from `workspaces/index.ts`, but the import bypasses it. | **Important** |
| F5 | **`onboarding/data/tauri-get-started-project.adapter.ts` deep-imports `workspaces/data/workspace.adapter`** | Pulls `workspaceFromDto` from a sibling's `data/` folder. `workspaceFromDto` is NOT re-exported from `workspaces/index.ts`. The onboarding bootstrap needs to construct a Workspace model from a Tauri payload that already includes a workspace; the cleanest fix is to either (a) re-export `workspaceFromDto` from `workspaces/index.ts`, or (b) have the workspaces facade expose a `fromBootstrapPayload(...)` method that the onboarding code can call. **(b) is cleaner.** | **Important** |
| F6 | **`repositories/feature-file-diff/feature-file-diff.ts` deep-imports `chat/ui-message-markdown/ui-message-markdown`** | `feature-file-diff.ts:14`: the markdown renderer is used to render diff hunk descriptions. The markdown component is NOT re-exported from `chat/index.ts`. The component is genuinely cross-domain (it's a generic markdown renderer that happens to live in `chat/`) — the cleanest fix is to move it to `libs/mozart-ui/` since both `chat` and `repositories` use it. | **Important** |
| F7 | **`core/add-project.flow.ts` imports 3 domain facades** (ChatFacade, ProjectsFacade, WorkspacesFacade) | `add-project.flow.ts` orchestrates project add → workspace create → chat seed. By `ARCHITECTURE.md`, "core/ is cross-domain glue allowed to import Tauri APIs directly" — but it's importing domain facades, not Tauri. **It's behaving like another legal cross-domain composer (alongside `shell/`).** Either (a) accept that `core/` may compose facades, or (b) move this flow to `shell/add-project.flow.ts`. **(a) is the lower-friction choice** — but document it. | **Nice-to-have** |
| F8 | **Within `repositories/`, features import siblings' `data/` and `ui-*` folders directly** | `feature-commit-dialog`, `feature-file-tree`, `feature-file-diff`, `feature-file-toolbar`, `ui-file-tree-row` all use `from '../data/...'` and `from '../ui-.../...'`. **This is fine — they're inside the same domain.** Mentioning only to confirm the cross-domain rule is what's enforced, not the intra-domain "use the index.ts" rule. | — |
| F9 | **`workspaces/feature-detail/workspace-detail.page.ts` deep-imports its own sibling features**: `from '../feature-chat-tab-bar/...'`, `from '../feature-file-content/...'`, `from '../feature-workspace-middle/...'`, `from '../ui/chat-empty-state/...'` | Intra-domain, fine. | — |
| F10 | **`workspaces/feature-workspace-files.ts` imports `from '../repositories'`** (correct, via index) | This is the legal pattern. | — |
| F11 | **`workspaces/data/file-tabs.service.ts` imports `from '../ui/workspace-tab-bar/workspace-tab.model'`** | Intra-domain ; fine. **Worth noting** because it inverts the conventional layer flow (data depending on ui). The dependency is on a constant (`FILE_TAB_CAP`) + a model — pure types. **Move `FILE_TAB_CAP` to `data/` if you care.** Edge case. | **Nice-to-have** |

### No circular dependencies found

A quick read of facade-to-facade imports (`chat→workspaces`, `workspaces→projects+tasks+ui-state`, `projects→workspaces` via the `UI_WORKSPACE_STATUSES` deep import, `runs→terminals` for `TerminalEvent`) does not form a cycle.

### Verdict

**F1, F2, F3, F4, F5, F6 are real and fixable in 1-2 hours.** All of them
either need to add an export to an index.ts or change a deep import to use
the existing index. F7 is a documentation choice. F11 is a tiny inversion
that can wait.

---

## G. Comment noise audit

### Current state

Comments are dense. Many are excellent. They explain WHY (the load-bearing
kind) more often than WHAT. Examples of good comments seen:

- `feature-workspace-files.ts:38`: "Shared empty array — returning the same reference on cache miss keeps `changedFiles`'s computed reference-stable so downstream filters don't re-run on every CD pass while the cache is empty." (subtle performance reason)
- `feature-workspace-middle.ts:136-141`: explains the programmatic-scroll grace window and why it exists.
- `feature-file-content.ts:307-312`: explains why diff-mode scroll persist uses `<mz-diff-view>` and not the editor.
- `terminal-registry.service.ts:172-182`: explains the `document.body` vs `documentElement` bug.
- `workspace.facade.ts:172-181`: step-by-step trace of `createForPrompt`'s orchestration.

### Problems found

| # | Problem | Severity |
|---|---|---|
| G1 | **Plan reference comments are scattered throughout** ("P0.3 / R0.3.E", "P2.6 / AD-02", "Plan P0.2.D — lift a frozen workspace…", "Phase 6 / Atom 9 — interrupted-message recovery", "IMP-004 — …", "P2.7.A — …"). These were useful during the plan rollout; they are starting to rot. A future reader can't look up "R0.3.E" — the docs/specs that defined those identifiers are themselves changing. The COMMENT BODY around the reference is usually still useful; the **identifier** is the rot. | **Nice-to-have** (delete only when the surrounding comment is also no longer useful) |
| G2 | **Some chat/onboarding facades carry "// Plan reference" prose at the top of functions** that restates what the surrounding plan doc already says. E.g. `chat.facade.ts:241-245` "P0.3 / R0.3.E. Persists the new payload via the existing `update_message_timeline` Tauri command and patches the in-memory message so the renderer reflects the new state on the next tick." → keep the second sentence (it's behavior), drop "P0.3 / R0.3.E". | **Nice-to-have** |
| G3 | **A handful of comments describe what code clearly does** ("// Open paths for `workspaceId`, in insertion order." above `forWorkspace(workspaceId)`). Names are clear ; the doc-line is a habit. Most of these survive because they're docstring-style. Net cost is small. | — |
| G4 | **No commented-out code blocks found** in scanned files. | — |
| G5 | **No misleading or outright wrong comments seen in the files I read.** Stale plan references (G1/G2) are about identifier hygiene, not factual wrongness. | — |
| G6 | **Many comments tie to *concrete bugs* with sourceable history** ("xterm stays light in dark mode", "Reading from <html> returns an empty string and falls back to white"). These are gold. Do not delete. | — |

### Verdict

The codebase has the right comment culture. The cleanup is **identifier
pruning** ("R0.3.E", "P2.6", "IMP-004") in places where the surrounding
prose is still load-bearing. Low priority. Do as part of touching adjacent
code, not as a sweep.

---

## H. Proposed target domain/layer structure

### Principles I'm applying

1. **KISS.** No new abstractions where current shape works.
2. **The routing refactor is the destination.** Today's structure is correct
   for today; some pieces will dissolve when route params replace in-memory
   Maps. Don't pre-do that work.
3. **Tighten what's almost-right** before introducing anything new.
4. **No fake dumb children.** No technical-bucket folders.
5. **The user sees `domains/` already**; this is hygiene, not a rewrite.

### What should MOVE

| Move | From | To | Why | Severity / when |
|---|---|---|---|---|
| **M1: Add `WorkspaceRow`, `WorkspaceContextMenu`, `WorkspaceEmptyState` to `workspaces/index.ts`** | `domains/workspaces/ui/*` (currently not exported) | re-exported from `workspaces/index.ts` | Closes F1. The shell already uses these; the public API just doesn't acknowledge them. One-line additions to `index.ts`, then update shell imports. | **Critical — do first** |
| **M2: Add `MergeActionMenu` to `workspaces/index.ts`** | `domains/workspaces/ui/merge-action-menu/...` | re-exported | Closes F2. | **Important — do first** |
| **M3: Fix `onboarding.guard.ts` import to use `auth/index`** | `from '../auth/dev-bypass'` | `from '../auth'` | Closes F3. Trivial. | **Important — do first** |
| **M4: Fix `projects/data/project.facade.ts` import** | deep import into `workspaces/data/` | `from '../../workspaces'` (already re-exports `UI_WORKSPACE_STATUSES`) | Closes F4. Trivial. | **Important — do first** |
| **M5: Add a `WorkspacesFacade` method that wraps the bootstrap-payload mapping** | Today: `tauri-get-started-project.adapter.ts` deep-imports `workspaces/data/workspace.adapter` to call `workspaceFromDto`. | Add `WorkspacesFacade.fromBootstrapPayload(...)` (or equivalent) and have onboarding call that. **Do NOT re-export `workspaceFromDto`.** | Closes F5. **Decision (human): facade method over re-export** — `workspaceFromDto` is internal DTO-mapping logic, not a stable cross-domain contract. Exposing it from `index.ts` would leak implementation. | **Important — do during routing prep** |
| **M6: Move `ui-message-markdown` to `libs/mozart-ui/`** | `domains/chat/ui-message-markdown/...` | `libs/mozart-ui/message-markdown` | It's a generic markdown renderer used by both `chat` (assistant messages) and `repositories` (diff hunk text). It is NOT chat-specific. Belongs in the shared UI library. | **Important — small, standalone** |
| **M7: Collapse `runs` into `terminals` OR rename to a shared "pty" domain** | `domains/runs/*` + `domains/terminals/*` | one domain (either name) | They are two implementations of the same primitive. After unification: one `XtermRegistry` with a `mode: 'interactive' \| 'readonly'` distinction. **Decision (human): DEFER.** Conceptually correct but it's a product/domain refactor, not required before the routing/state refactor. Revisit later. | **Deferred** |
| **M8 (deferred): `FileTabsService`** | `domains/workspaces/data/file-tabs.service.ts` | Stays in `workspaces/data/` for now. **Decision (human): keep as-is.** It belongs to the current routing/tab model; the routing refactor will replace or remove it, not this phase. | — | **Deferred to routing refactor** |
| **M9 (optional, can wait): Split `feature-workspace-files.ts` → `+ feature-changes-list`** | `feature-workspace-files.ts` | new sibling `feature-changes-list.ts` | C1's recommendation. The agent-run auto-route + stage/unstage actions + grouping live in the new sibling; the watcher + tab container stay in the parent. | **Nice-to-have — defer until the routing refactor lands** |
| **M10 (optional, can wait): Rename `core/shell.service.ts` → `core/external-link.service.ts`** | Already captured in `TODOS.md`. | Drop-in rename. | **Nice-to-have — TODOS already tracks** |

### What should STAY where it is

- **`shell/` as the cross-domain sidebar composer.** Documented and load-bearing. Don't fold into a domain.
- **`pages/` as routed shells.** Holds dashboard, settings, welcome, onboarding, tour, sandbox. Clean separation from domains.
- **`core/` as Tauri-typed bindings + glue.** Even `add-project.flow.ts` is correctly here (F7: documented).
- **`tasks` as a data-only stub.** Don't promote to a "real" domain until it has UI.
- **`repositories` as a domain — folder name unchanged.** Decision (human): do not rename. The naming is mildly leaky (A2) but not blocking; renaming is pure refactor churn without behavior change. Revisit only if it later proves to create real confusion.
- **`runs` and `terminals` as separate domains for now.** Decision (human): defer the collapse (M7). Not pre-routing-refactor work.
- **`FileTabsService` in `workspaces/data/`.** Decision (human): keep it. The routing refactor is the right place to remove or replace it.
- **`ui-state` as one domain for now.** It will naturally split when the routing refactor scopes per-workspace UI prefs to the workspace route.
- **The `data/` + `feature-*` + `ui-*` + `util-*` layer pattern.** Already in place, honored across all 12 domains.
- **All large smart components flagged in C2-C8.** Each is dense because of intrinsic complexity, not because the line was drawn wrong.
- **`workspace.facade`'s 7 optimistic-rollback methods (E3).** A helper would be a bad abstraction.
- **The Tauri adapter pattern in `core/tauri-adapters.ts`.** Centralizing here is correct.

### What should NOT be abstracted

- **`toast.error('Could not X', ...)` pattern** — generic helper hides the message.
- **The DTO ↔ model split** — even when small, the boundary is correct (E5).
- **`crypto.randomUUID()` wrapper** — one line, one call site each, no shared concern.
- **Per-domain `index.ts` files** — they ARE the abstraction. Don't add another layer above them.
- **A "shared workspace-scoped state" service** — at 2 maps in `workspace.facade` today, premature.

### What this DOES NOT propose

- No new lib (apart from `mozart-ui/message-markdown` already justified).
- No new `core/state/` or `domains/shared/` directory.
- No top-level reorganization of `apps/desktop/src/app/`.
- No mass renaming of `feature-*` / `ui-*` to enforce flat-vs-nested consistency. (B1/B2 are nice-to-have; either pattern is fine.)
- No removing comments en masse. G1/G2 are touched-as-you-go.
- No new helpers, no new abstractions, no new conventions beyond what `ARCHITECTURE.md` already documents.

---

## Suggested ordered execution (Phase B and beyond — for human review only)

The user said: **Do NOT implement.** This list is sequencing, not a green
light. Decisions from human review have been incorporated: `runs`+`terminals`
collapse, `repositories` rename, and `FileTabsService` move are all
deferred ; M5 uses a facade method.

**Tier 1 — boundary hygiene, no behavior change (1 PR, ~1 hour):**

1. M1 + M2 — export missing UI components from `workspaces/index.ts` ; update shell imports.
2. M3 + M4 — fix two cross-domain deep imports (`onboarding.guard`, `project.facade`).
3. Verify with `nx affected:lint` + `bash tools/verify-scope-tags.sh`.

**Tier 2 — small structural cleanup (1 PR, ~2-3 hours):**

4. M5 — add `WorkspacesFacade.fromBootstrapPayload(...)` (or equivalent) ; update `tauri-get-started-project.adapter.ts` to call the facade instead of deep-importing `workspaceFromDto`. Keep `workspaceFromDto` private to `workspaces/data/`.
5. M6 — move `ui-message-markdown` to `libs/mozart-ui/` ; update `chat` and `repositories` imports.
6. (Optional during this PR) Trim a handful of obvious plan-identifier comments (G1/G2) in files touched.

**Tier 3 — optional standalone cleanup (separate PR, ~30 min):**

7. (Optional) M10 — rename `core/shell.service.ts` → `core/external-link.service.ts`. Already in `TODOS.md`. Anyone can do it.

**Deferred (NOT in this phase — by explicit human decision):**

- M7 — collapse `runs` into `terminals`. Conceptually correct, but a product/domain refactor not required before the routing/state refactor.
- M8 — `FileTabsService` move/removal. Belongs to the current routing/tab model ; addressed during the routing refactor.
- M9 — split `feature-workspace-files.ts`. Defer until the new route structure makes the seam natural.
- The `ui-state` split (D2) — let the new route's resolver own per-workspace UI prefs when the routing refactor lands.
- `repositories` rename — not blocking ; avoid refactor churn.

---

## Open questions — resolved by human review (2026-05-22)

1. **M7 (collapse runs+terminals):** **DEFERRED.** Conceptually correct but
   it's a product/domain refactor, not required before the routing/state
   refactor. Revisit later.
2. **M5 (re-export vs facade method):** **Facade method.** `workspaceFromDto`
   is internal DTO-mapping logic. Exposing it from `workspaces/index.ts`
   would leak implementation. Add `WorkspacesFacade.fromBootstrapPayload(...)`
   (or equivalent) and have onboarding call that.
3. **`repositories` rename (A2):** **Do NOT rename.** Avoid churn from
   unrelated file moves. Keep the current name unless a later refactor
   proves it creates real confusion.
4. **`ui-state` split (D2/A3):** **DEFER to the routing refactor.** Let the
   new route's resolver own per-workspace UI prefs once the route structure
   makes the split natural.
5. **`FileTabsService` move (M8):** **DEFER to the routing refactor.** It
   belongs to the current routing/tab model ; replace or remove it during
   the project/workspace/tab refactor, not before.

---

## Closing

The Mozart desktop codebase is **further along the Angular Architects path
than the request implied**. The ARCHITECTURE.md three conventions are
real, mostly upheld, and the violations are concentrated in 6 specific
deep imports that fit in one PR.

After human review of the open questions, the **pre-routing-refactor work
surface** is now scoped to:

- **Tier 1 (~1h):** four import fixes + two missing re-exports (M1-M4).
- **Tier 2 (~2-3h):** one facade-method addition for the onboarding ↔ workspaces bootstrap seam (M5) ; one shared-UI move (`ui-message-markdown` → `mozart-ui`) (M6).
- **Tier 3 (optional, ~30min):** rename `core/shell.service.ts` (M10).

`runs`+`terminals` collapse, `FileTabsService` move, `feature-workspace-files`
split, `ui-state` split, and the `repositories` rename are all **deferred**
— either to the routing refactor itself or to standalone follow-ups.

— Phase A complete and reviewed.
