# UI Persistence Audit & Refactor Plan

> Status: approved 2026-05-25. Drives the refactor tracked in tasks 1-8 of the implementation branch. Mozart is in dev — no migration logic, legacy keys get wiped on first boot of the new code.

## Context

Mozart currently persists UI state across three localStorage keys plus an in-memory tier — built up incrementally across P1.3 (a666ce9) and the freeze hotfix (457abe7). The result is a partially-overlapping model that:

- persists **more** than necessary (every open file tab, per-path mode, tree expansion across restart),
- persists **less** than necessary (chat composer drafts are silently dropped on every workspace switch),
- amplifies writes — every tree click and tab focus rewrites a multi-workspace JSON blob to disk via `withStorageSync`,
- and has already produced one severe freeze bug (the FileTabsService mirror-effect infinite loop fixed in 457abe7) that points at structural fragility in the read/write/mirror layering.

Product expectations narrow the durable surface to:

- restore **last active workspace + last active tab** on app restart (not the full tab strip),
- treat **file tree expansion**, **open file tabs**, **per-path file view mode**, and **aside state** as session-only,
- introduce **per-chat session-only composer drafts** (closes a real data-loss bug),
- keep **file composer drafts** durable (no regression there),
- stay on **localStorage**, but with debounced writes and a much smaller payload — no Rust changes this round.

**Single source of truth — router URL.** Workspaces and tabs are already encoded in the route (`/project/:projectId/workspace/:workspaceId/tab/:tabId`). The router IS the source of truth for active workspace + active tab. Persisting `activeWorkspaceId` or `lastActiveTabIdByWorkspace` to localStorage as a separate map duplicates that knowledge and creates drift. The refactor collapses both into:

- a thin `RouterStateStore` that exposes the router's current position as signals (so components have one place to read `activeWorkspaceId`, `activeProjectId`, `activeTabId`, `activeTabKind`),
- ONE durable scalar — `mozart-last-url-v1` — that snapshots the URL on `NavigationEnd` (debounced) and is replayed once at boot if the app cold-starts at `/`,
- a session-only `lastTabByWorkspace` map inside the same store so within-session sidebar navigation (A → B → A) restores A's last tab without any localStorage write.

---

## 1. Current-state inventory

### 1.1 localStorage keys (production)

| Key | Owner | Shape | Write trigger | Scope today |
|-----|-------|-------|---------------|-------------|
| `mozart-ui-state-v1` | `UiStateStore` (`libs/desktop-ui-state-data-access/src/lib/ui-state.store.ts:76`) | `{ asideStateByWorkspace, treeExpandedByWorkspace }` | `withStorageSync` — every `patchState` | per-workspace, durable |
| `mozart-file-tabs-v1` | `FileTabsStore` (`libs/desktop-ui-state-data-access/src/lib/file-tabs.store.ts:49`) | `{ fileTabsByWorkspace, lastActiveTabIdByWorkspace, fileViewByWorkspace }` | `withStorageSync` — every `patchState` | per-workspace, durable |
| `mozart-drafts-v1` | `DraftsStore` (`libs/desktop-ui-state-data-access/src/lib/drafts.store.ts:18,116`) | `Record<wsId, Record<path, { content, updatedAt }>>` | 500ms debounce + `beforeunload` | per (workspace, path), durable |
| `app:color-mode`, `app:theme` | `ThemeService` (`libs/shared-util-theme/src/lib/theme.service.ts:54,60`) | string enums | on user toggle | global, durable |
| `mozart.web.oauthState`, `mozart.web.callbackPort` | `AuthFacade` web (`apps/web/src/app/domains/auth/data/auth.facade.ts:29,30`) | strings | OAuth handoff | web-app only |
| `mozartDevBypass` | `desktop-auth-data-access/dev-bypass.ts:21` | `'1'` | `?dev=1` URL flag | dev only |

### 1.2 In-memory (session-only today)

- `FileTabsService._openByWorkspace` / `_activeByWorkspace` / `_previewByWorkspace` — `libs/desktop-workspaces-data-access/src/lib/file-tabs.service.ts:45-55` (note: `_openByWorkspace` is mirrored to `mozart-file-tabs-v1` via the effect at lines 84-103).
- `UiStateStore.expandedProjectIds` / `collapsedStatusIds` — `ui-state.store.ts:40,45` (`ReadonlySet`, intentionally not in `withStorageSync.select`).
- `FileTreeCacheStore` — `libs/desktop-repositories-data-access/src/lib/file-tree-cache.store.ts` (caches tree data, not expansion state).
- `ScrollPositionService` — per-chat / per-file scroll positions, not persisted.

### 1.3 Tauri SQLite + OS keyring (out of scope for this refactor, listed for completeness)

- SQLite `config` table key/value, plus `workspaces`, `repos`, `workspace_active_chat`, `workspace_file_views`, `project_local_config`, chat/agent tables — at `apps/desktop-tauri/migrations/*.sql`.
- OS keyring entries for auth session + Anthropic key + GitHub token at `apps/desktop-tauri/src/auth/keyring_store.rs` and `apps/desktop-tauri/src/credentials/keyring_store.rs`.

### 1.4 Composer-draft gap (not yet persisted)

`FeatureWorkspaceComposer` at `libs/desktop-workspaces-feature/src/lib/feature-workspace-composer.ts:121` uses `linkedSignal({ source: workspaceId, computation: () => '' })`. Every workspace switch resets the chat draft to empty — a data-loss bug under the expectation that composer drafts should not be lost accidentally.

---

## 2. Target persistence model (post-refactor)

Three clean tiers, each with a single owner.

### Tier A — Durable (localStorage / disk)

| Concern | Key / sink | Shape | Why |
|---|---|---|---|
| Theme | `app:color-mode`, `app:theme` | strings | existing, no change |
| Last URL | `mozart-last-url-v1` | `string` | one router URL — captures workspace + tab + future query params in one slot; no duplication of router state |
| Live file edits | **disk via `repos.saveFile` on app close** | n/a | no localStorage drafts. Edits live in `SessionStore` (in-memory) and flush to disk via `getCurrentWindow().onCloseRequested` (preventDefault → await all saves → destroy). Hard crash = lost — accepted; an explicit Save button is the deterministic checkpoint. |

The `mozart-last-url-v1` slot is a single short string (< 200 bytes). No `mozart-drafts-v1` anymore.

> Why one URL instead of a `{ lastActiveWorkspaceId, lastActiveTabIdByWorkspace }` map: the router URL already encodes both — and is the canonical source. Persisting derived state alongside it invites drift (e.g., last-active-tab map says X, URL says Y). One slot, one source.

### Tier B — Session-only (in-memory, per-workspace)

Two cooperating stores, both `providedIn: 'root'`, signal-based, no `withStorageSync`:

**`RouterFacade`** — thin signal wrapper around `Router.events`. Routed components don't need it (`withComponentInputBinding()` already gives them `workspaceId` / `tabId` as inputs); non-routed code (sidebar, etc.) reads from here:

- `activeUrl: Signal<string>` (from `Router.events` `NavigationEnd`)
- `activeProjectId: Signal<string | null>`
- `activeWorkspaceId: Signal<string | null>`
- `activeTabId: Signal<string | null>`
- `activeTabKind: Signal<'chat' | 'file' | null>`
- Subscribes to `NavigationEnd` once, debounces (250 ms), and writes the current URL to `mozart-last-url-v1`. That single write is the entire durable surface for "where I was."
- `bootRestoreUrl()` — one-shot consumed by `APP_INITIALIZER` to replay the last URL.

**`SessionStore`** — all session-only UI state in one place. The historical split between "ui-state" and "file-tabs" stores pre-dated multi-tab + router-as-source; with both gone there's no reason to keep two stores. One bag, three concern groups:

- Sidebar (global): `expandedProjectIds`, `collapsedStatusIds`
- Per-workspace: `openFileTabsByWorkspace`, `previewByWorkspace`, `fileViewByWorkspace`, `asideStateByWorkspace`, `treeExpandedByWorkspace`, `chatDraftsByWorkspace`
- Resolver memory: `lastTabByWorkspace` — written by routed `WorkspaceTabContent` from its input-driven effect (since `workspaceId` + `tabId` are inputs via `withComponentInputBinding`); read by `WorkspaceTabResolver.defaultTabId()`.

`activeFileByWorkspace` and `activeWorkspaceId` are deleted — both derive from the router via `RouterFacade`. Components that previously read these get them from `RouterFacade` (or directly from their own route-bound inputs).

### Tier C — Ephemeral (in-memory, per visit)

- `expandedProjectIds` (sidebar)
- `collapsedStatusIds` (sidebar)
- Scroll positions
- Composer focus state

No changes from today.

---

## 3. Freeze investigation

### 3.1 Confirmed root cause of the original freeze (a666ce9 → 457abe7)

`FileTabsService` constructor at `file-tabs.service.ts:84-103` ran an effect that:

1. Read `this._openByWorkspace()` reactively (intended trigger).
2. Wrote to `uiState.setFileTabs()` (which calls `patchState` on `FileTabsStore`, producing a fresh object reference per write).
3. Also read `uiState.fileTabsByWorkspace()` to compute the cleanup pass.

Because step 3 read the same store that step 2 wrote, every write re-triggered the effect. `withStorageSync` then serialized the whole map on every iteration. Hot-path stuck in a microtask loop → app freezes on first workspace navigation.

**Status today:** Fixed by wrapping the write+cleanup block in `untracked()` (`file-tabs.service.ts:86`). Regression test at `file-tabs.service.spec.ts:165-199` seeds localStorage and asserts the service constructs without a timeout. **The original failure mode is no longer reachable.**

### 3.2 Residual freeze / perf risks in the current code

Ranked by likelihood:

1. **`withStorageSync` write amplification on hot paths (HIGH).** Every `patchState` on `UiStateStore` or `FileTabsStore` re-stringifies the entire selected slice. The worst offenders are tree expansion toggles (`UiStateStore.setTreeExpanded`) and `upsertFileView` calls (one per file-tab navigation). With many workspaces × many files, JSON.stringify cost grows linearly on every click. Eliminated by Tier-B move.
2. **`FileTabsService` cleanup loop (MEDIUM).** Lines 96-101 iterate over every workspace key in the persisted map on every mutation. Bounded but still unnecessary work. Eliminated when `mozart-file-tabs-v1` goes away.
3. **`DraftsStore.flushNow` synchronous JSON.stringify on `beforeunload` (LOW-MEDIUM).** `drafts.store.ts:116`. If a user accumulates many large draft files, the synchronous flush on tab close can block. Mitigation: keep the 500ms debounce; add a soft size guard that skips the beforeunload-only path when total payload > 2 MB.
4. **Boot hydration order (LOW).** `app.config.ts:66-93` runs `await auth.bootstrap()` → `await onboarding.bootstrap()` → parallel `loadAll()`. None tied to localStorage hydration; the new `mozart-last-url-v1` read is one tiny key.
5. **`workspace.store.byProject` O(n) computed on every read (LOW).** Not a freeze cause; out of scope for this refactor.

**Verdict:** the current code is not still vulnerable to the specific 457abe7 freeze. The Tier-B refactor eliminates the structural pattern that produced it (effect-driven persist-mirror loops) entirely.

---

## 4. Critical files (refactor surface)

- `libs/desktop-ui-state-data-access/src/lib/ui-state.store.ts` — strip `withStorageSync`, keep session-only sidebar state (`expandedProjectIds`, `collapsedStatusIds`). Drop `activeWorkspaceId` (moved to `RouterStateStore`), `asideStateByWorkspace`, `treeExpandedByWorkspace` (moved to `WorkspaceSessionStore`).
- `libs/desktop-ui-state-data-access/src/lib/file-tabs.store.ts` — delete entirely.
- `libs/desktop-ui-state-data-access/src/lib/drafts.store.ts` — keep, add size guard on `flushNow`.
- `libs/desktop-ui-state-data-access/src/lib/ui-state.facade.ts` — repoint to `RouterStateStore` + `WorkspaceSessionStore`; the facade stays as the compat seam.
- `libs/desktop-workspaces-data-access/src/lib/file-tabs.service.ts` — drop the persist-mirror effect (lines 67-103). Becomes a pure in-memory wrapper around `WorkspaceSessionStore`. `activeFor()` reads from `RouterStateStore.activeTabId` filtered to file-kind.
- `libs/desktop-workspaces-data-access/src/lib/workspace-tab-resolver.service.ts:93-117` — read last-tab fallback from `RouterStateStore.lastTabFor(wsId)` (session-only). Cold start with no in-session memory → fall through to default chat — the URL replay handles the restart case at boot.
- `libs/desktop-workspaces-feature/src/lib/feature-detail/workspace-tab-content.ts:239` — `setLastActiveTab` becomes a no-op; `RouterStateStore` writes `lastTabByWorkspace` automatically from `NavigationEnd`.
- `libs/desktop-workspaces-feature/src/lib/feature-detail/workspace-detail.page.ts:171-183` — `setActive(id)` becomes a no-op; the router IS the source of active workspace.
- `libs/desktop-workspaces-feature/src/lib/feature-workspace-composer.ts:121` — replace `linkedSignal` reset with a `WorkspaceSessionStore`-backed read keyed by `(workspaceId, activeChatId)`.
- `apps/desktop/src/app/app.config.ts` — at boot, after hydration: if `router.url === '/'`, read `mozart-last-url-v1` and `router.navigateByUrl(lastUrl)` once.

### Pattern reused (don't reinvent)

- `DraftsStore.scheduleFlush` / `flushNow` / `hydrateFromStorage` pattern at `drafts.store.ts:97-137` — copy this exact shape for `RouterStateStore`'s URL snapshot. 250 ms debounce, beforeunload flush, parse-on-construct.

---

## 5. Refactor steps

Each step is independently shippable.

### Step 0 — Materialize the audit doc

This file. Already in `docs/tmp/ui-persistence-audit.md`.

### Step 1 — Introduce `RouterStateStore`

New file: `libs/desktop-ui-state-data-access/src/lib/router-state.store.ts`.

- `@Injectable({ providedIn: 'root' })`. Injects `Router` + `WorkspaceTabRegistry`.
- Subscribes once to `Router.events` filtered to `NavigationEnd` (`takeUntilDestroyed` for cleanup).
- Maintains signals derived from the current URL: `activeUrl`, `activeProjectId`, `activeWorkspaceId`, `activeTabId`, `activeTabKind`.
- URL parsing inverts the existing `workspaceTabRouteCommands` shape.
- Session-only `_lastTabByWorkspace` signal — updated on every `NavigationEnd` where the URL has both a workspaceId and a tabId. Exposed via `lastTabFor(wsId)`.
- Durable URL snapshot: same `scheduleFlush`/`flushNow` shape as `DraftsStore`. Key `mozart-last-url-v1`. 250 ms debounce. `beforeunload` flush. Construct-time parse-on-load exposes `bootRestoreUrl()` — read once at app boot, then cleared.
- On first construct: unconditionally `localStorage.removeItem('mozart-file-tabs-v1')` and `localStorage.removeItem('mozart-ui-state-v1')`. App is dev-only — no migration, just wipe.

Tests:
- `NavigationEnd` updates router-derived signals.
- `lastTabByWorkspace` records the most recent tab per workspace and survives within-session workspace switches.
- URL snapshot debounces N rapid navigations into one write.
- `bootRestoreUrl()` returns the stored URL once and is null on second read.

### Step 2 — Introduce `WorkspaceSessionStore`

New file: `libs/desktop-ui-state-data-access/src/lib/workspace-session.store.ts`.

- Single `@Injectable({ providedIn: 'root' })` with signal-backed maps for every Tier-B concern in §2 (excluding the router-derived signals).
- No `withStorageSync`. No effects that write back to itself.
- Methods follow the existing facade verbs: `setOpenTabs`, `setPreview`, `clearPreview`, `upsertFileView`, `forgetFileView`, `setAsideState`, `setTreeExpanded`, `readChatDraft`, `writeChatDraft`, `clearChatDraft`, `pruneWorkspace`.
- Exposes `Signal` getters per concern (`asideStateFor(workspaceId: Signal)`, etc.) matching `UiStateFacade`'s existing API.

Tests: workspace-scoped reads return defaults when no entry; mutation isolation between workspaces; `pruneWorkspace` clears every concern in one call.

### Step 3 — Strip persistence from `UiStateStore` + delete `FileTabsStore`

- `UiStateStore`: remove `withStorageSync`. Keep only the sidebar concerns: `expandedProjectIds`, `collapsedStatusIds`. Drop `activeWorkspaceId`, `asideStateByWorkspace`, `treeExpandedByWorkspace`.
- `FileTabsStore`: delete the file. All call sites (only via `UiStateFacade`) repoint to `WorkspaceSessionStore` for tabs / file-view and `RouterStateStore` for last-tab.
- `UiStateFacade`: surface stays stable for callers; internals swap to the three new sources (`RouterStateStore`, `WorkspaceSessionStore`, kept `DraftsStore`). Treat the facade as the compat seam.

### Step 4 — Drop the persist-mirror effect in `FileTabsService`

- Remove the constructor effect at `file-tabs.service.ts:84-103` (the `untracked()` block).
- Replace internal `_openByWorkspace` / `_previewByWorkspace` signals with reads/writes against `WorkspaceSessionStore`.
- Replace `_activeByWorkspace` reads with `RouterStateStore.activeTabId` (filtered to file-kind). `FileTabsService.activeFor(wsId)` becomes a thin wrapper that returns the router-derived signal when `wsId` matches `activeWorkspaceId`.
- The bootstrap rehydration block at lines 67-75 also goes — there's no persisted state to seed from.

### Step 5 — Chat composer drafts

- In `FeatureWorkspaceComposer` (`feature-workspace-composer.ts:121`), replace the `linkedSignal({ source: workspaceId, computation: () => '' })` with a session-store-backed read keyed by `(workspaceId, activeChatId)`.
- On send: `clearChatDraft(workspaceId, chatId)` instead of `this.value.set('')`.
- Switching workspace: the computed reactively swaps to the new (workspaceId, chatId) draft (session-only — survives switch, drops on restart).

### Step 6 — Boot-time restore via URL replay

- In `app.config.ts` `provideAppInitializer`, after `workspaces.loadAll()`:

  ```
  const routerState = inject(RouterStateStore);
  const router = inject(Router);
  const lastUrl = routerState.bootRestoreUrl();
  if (lastUrl && router.url === '/') {
    router.navigateByUrl(lastUrl);
  }
  ```

- No facade-level "set last active workspace/tab" calls anywhere — the router IS the source. `WorkspacesFacade.setActive()` shrinks to a no-op (or is deleted; callers just `router.navigate`).
- `WorkspaceTabContent`'s `setLastActiveTab` write at line 239 is deleted — `RouterStateStore` updates `lastTabByWorkspace` from `NavigationEnd` automatically.
- `WorkspaceTabResolver.defaultTabId` reads `routerState.lastTabFor(wsId)` (session-only). Cold start with no in-session memory → fall through to default chat (the URL replay above already lands the user on the right tab when relevant).
- Stale URL safety: if `navigateByUrl(lastUrl)` lands on a route that no longer authorizes (workspace deleted, tab id stale), the existing resolver's authorize → redirect-with-default chain handles it.

### Step 7 — `DraftsStore` size guard

In `drafts.store.ts:105-121`, before stringify on the `beforeunload` path, check `Object.keys(all).length` and a rough size estimate. If `> 2 MB`, log a warn and skip the synchronous flush (the prior debounced flush already covered most content). Steady-state debounced path unchanged.

### Step 8 — Cleanup

- Remove `pruneWorkspace` fan-out for the deleted `FileTabsStore`.
- Update `UiStateFacade.pruneWorkspace` to call `WorkspaceSessionStore.pruneWorkspace(id)` + `DraftsStore.pruneWorkspace(id)` + `RouterStateStore.forgetWorkspace(id)`.
- Delete the localStorage-seed regression test at `file-tabs.service.spec.ts:165-199`.

---

## 6. Cleanup of existing keys

App is dev-only — no migration code. On first boot of the new version, `RouterStateStore` unconditionally calls `localStorage.removeItem('mozart-file-tabs-v1')` and `localStorage.removeItem('mozart-ui-state-v1')`. `mozart-drafts-v1` stays.

---

## 7. Performance risks & mitigations

| Risk | Mitigation |
|---|---|
| Synchronous JSON.stringify on hot path | Eliminated for tabs/tree/aside (session-only). `mozart-last-url-v1` is < 200 bytes. Drafts keep their 500 ms debounce. |
| `beforeunload` synchronous flush of large drafts | Add 2 MB size guard (Step 7). |
| Boot-time localStorage reads blocking first paint | `RouterStateStore` reads one tiny key on construct. No additional cost. |
| Cleanup loop iterating all persisted workspaces | Deleted with the persist-mirror effect (Step 4). |
| Effects with read+write cycles | Architectural: `WorkspaceSessionStore` mutations don't fan back through `withStorageSync`. No new effect-driven mirrors are introduced. |

---

## 8. Verification

### 8.1 Unit / spec

- `router-state.store.spec.ts`: NavigationEnd updates derived signals; `lastTabByWorkspace` records and recalls per-workspace tabs across in-session switches; URL snapshot debounces; `bootRestoreUrl()` returns once then null; legacy-key wipe runs on construct.
- `workspace-session.store.spec.ts`: per-workspace isolation; default fallbacks; `pruneWorkspace` clears every concern.
- Update existing `ui-state.facade.spec.ts` to match the new internals.
- Update `file-tabs.service.spec.ts`: drop the localStorage-seed regression test; add a "freshly constructed service has no open tabs" test; verify `activeFor()` follows `RouterStateStore.activeTabId`.
- Add `feature-workspace-composer.spec.ts` cases: draft preserved across workspace switch and back; cleared on send; not persisted across reload.

### 8.2 Integration

- `workspace-tab-resolver.spec.ts`: last-tab fallback reads from `RouterStateStore.lastTabFor(wsId)`; absent → default chat.
- Boot URL replay test that seeds `mozart-last-url-v1`, boots the app at `/`, and asserts `router.navigateByUrl` was called with that URL.

### 8.3 Manual regression checklist (Tauri dev build)

1. Open app cold. Create projects + 5+ workspaces.
2. Open many file tabs across multiple workspaces. Confirm app stays responsive (< 200 ms switch).
3. Toggle file tree expansion repeatedly. Confirm no perceptible lag.
4. Type a long chat composer message. Switch workspace. Return. Confirm draft preserved.
5. Switch to a different workspace, send message there. Switch back. Confirm first workspace's draft still preserved.
6. Type in a file editor. Wait 1 sec. Close app. Reopen. Confirm draft survives.
7. Close app on workspace A, tab X. Reopen. Confirm app lands on workspace A, tab X (not the home page).

### 8.4 DevTools spot-checks

- After running through the manual checklist, inspect `localStorage`. Expected keys only: `mozart-last-url-v1`, `mozart-drafts-v1`, `app:color-mode`, `app:theme`. No `mozart-ui-state-v1`, no `mozart-file-tabs-v1`.
- `mozart-last-url-v1`: a single URL string, < 200 bytes.
- Redux DevTools store list: `uiState` (now sidebar-only), `workspaceSession` (new), `routerState` (new); `fileTabs` should be gone.

---

## 9. Future option (not in this refactor)

**Query params for view-specific state.** Per-path `mode: 'edit' | 'diff'` and `splitDiff` are session-only in `WorkspaceSessionStore`. They could move into the URL as query params (`?mode=diff&split=true`) — that would make them shareable / deep-linkable AND eliminate the in-memory `fileViewByWorkspace` map entirely. Not in scope this round, but the router-as-source-of-truth direction supports adding this later without further state-store changes.

## 10. Out of scope

- Migrating drafts to Tauri SQLite.
- Memoizing `WorkspaceStore.byProject`.
- Workspace-archive cleanup beyond the existing `pruneWorkspace` fan-out.
- Persisting sidebar `expandedProjectIds`.
- Any changes to keyring / SQLite-backed state.
