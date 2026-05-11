# Plan: Step 1.8b — Shell Polish + Agent Streaming MVP

**Spec source:** `docs/PLAN-v0.0.1.md` § Step 1.8 (shell UI) + user-directed polish before Step 1.9
**Author:** /plan
**Date:** 2026-05-11
**Confidence:** 8/10

---

## 1. Verified repo truths

- `apps/desktop/src-tauri/tauri.conf.json:17` window width = `800`, height = `600`; no `decorations` key (native OS titlebar active)
- `apps/desktop/src-tauri/tauri.conf.json:4` identifier = `"com.tauri.dev"` (dev placeholder); production identifier should be `"build.mozart.desktop"` → DB currently at `~/.local/share/com.tauri.dev/mozart.db`; will move to `~/.local/share/build.mozart.desktop/mozart.db` after change
- `apps/desktop/src-tauri/capabilities/default.json:8` only permission is `"core:default"` — no window-control permissions yet
- `apps/desktop/src/app/shell/top-bar.component.ts:54` TopBar height = `36px`; contains disabled "Settings" + "About" buttons (both `disabled`, tooltip "Coming in 1.8d")
- `apps/desktop/src/app/shell/app-shell.component.ts` shell uses `grid-template-rows: 36px 1fr` (topbar + body) and `grid-template-columns: var(--sidebar-width) 1fr var(--right-panel-width)`
- `libs/shared-styles-theme/src/lib/shell.css` defines `--sidebar-width: 220px` and `--right-panel-width: 320px`
- `apps/desktop/src/app/sidebar/project-row.component.ts:50` "New workspace" `+` button is `disabled` with tooltip `'Coming in 1.8d'`
- `apps/desktop/src/app/sidebar/sidebar-empty.component.ts` renders when no projects — contains a card with placeholder "Add repository" CTA (not wired to any action)
- `apps/desktop/src/app/state/project.store.ts` has `refresh()` + `select()` + `toggleExpanded()` — no `addRepo()` method
- `apps/desktop/src/app/state/workspace.store.ts` has `refresh()` + `select()` — no `createWorkspace()` method
- `apps/desktop/src/app/services/bindings.service.ts:172` `startAgentRun` / `stopAgentRun` explicitly marked `// TODO(plan-09)` — NOT exposed
- `apps/desktop/src/app/_bindings.ts:83` `startAgentRun(workspaceId, prompt, onEvent: TAURI_CHANNEL<StreamEvent>)` exists and is fully implemented in Rust
- `apps/desktop/src/app/_bindings.ts:252` imports `Channel as TAURI_CHANNEL` from `@tauri-apps/api/core`
- `apps/desktop/src/app/state/` contains `project.store.ts`, `task.store.ts`, `workspace.store.ts` — no `shell.store.ts` yet
- All 13 Tauri commands are **fully implemented** in Rust (no stubs); end-to-end flows for add-repo, create-workspace, start-agent-run, stop-agent-run are production-ready

---

## 2. Intent — what we're delivering

A polished, usable desktop shell where the user can actually add a repo, create a workspace, send a prompt, and watch Claude stream a response — all in the v0.0.1 app window. The window grows to a productive size (1400×900), loses the native OS titlebar in favour of a compact custom drag bar with window controls, and the sidebar gets a cleaner conductor-inspired design (wider at 260px, flatter workspace pills). A new `ShellStore` drives center-panel routing so clicking a workspace opens a `ChatPanelComponent` instead of the empty-state card.

---

## 3. Non-goals

- Task-level sidebar grouping (showing Task pill headers above workspace items) — deferred; user confirmed flat list
- macOS traffic-light finessing — `decorations: false` is cross-platform; per-OS refinement is post-MVP
- Diff viewer / right panel content — right panel hidden by default, kept as placeholder for plan 10
- Full onboarding flow — Step 1.9
- Persisting chat history across sessions — plan 10
- Any Rust changes — all work is Angular + config

---

## 4. Architecture decisions locked in this plan

- **`decorations: false` universally** — removes OS titlebar on all platforms; TopBar becomes the custom drag region; cross-platform custom close/min/max buttons rendered in TopBar. macOS traffic-light refinement deferred.
- **`ShellStore` is thin** — does not duplicate `WorkspaceStore.selectedWorkspaceId()`; derives `activeWorkspaceId` via `inject(WorkspaceStore).selectedWorkspaceId()` in a `withComputed`. Owns only `rightPanelOpen` state.
- **`channelToObservable<T>()` util** — reusable helper in `services/agent-channel.util.ts`; wraps Tauri `Channel<T>` in a `Subject<T>`, exposes `complete()` for guaranteed cleanup. Single source of truth for all future channel-based commands.
- **Natural run-end detection via polling** — after `startAgentRun` resolves, poll `listRuns` every 1.5 s until the run reaches a terminal status; `done$` Subject kills the poller on `stop()` or natural end. No leaked Subjects.
- **Add Repo + Create Workspace use `hlm-dialog`** — standard spartan dialog pattern; no new UI lib needed.
- **Workspace pills: remove archive button** — permanently-invisible hover target removed; archive action deferred to 1.8d.
- **Right panel collapsed by default** — `ShellStore.rightPanelOpen` initial = `false`; AppShell hides `<aside>` when false.

---

## 5. Files

### To create
- `apps/desktop/src/app/state/shell.store.ts` — ShellStore (activeWorkspaceId computed, rightPanelOpen state, centerView computed)
- `apps/desktop/src/app/state/shell.store.spec.ts` — TDD spec: centerView switches on workspace selection, toggleRightPanel
- `apps/desktop/src/app/services/agent-channel.util.ts` — reusable `channelToObservable<T>()` helper: wraps `Channel<T>` in a `Subject`, returns `{ channel, events$: Observable<T>, complete: () => void }`
- `apps/desktop/src/app/shell/chat-panel.component.ts` — streaming chat: prompt input, StreamToken accumulator, stop button
- `apps/desktop/src/app/shell/add-repo-dialog.component.ts` — hlm-dialog: path input → `bindings.addRepo()` → `project.store.refresh()`
- `apps/desktop/src/app/shell/create-workspace-dialog.component.ts` — hlm-dialog: task text + branch select → `bindings.createWorkspace()` → `workspace.store.refresh()`

### To modify
- `apps/desktop/src-tauri/tauri.conf.json:13` — width→1400, height→900, add `"decorations": false`, identifier `"com.tauri.dev"` → `"build.mozart.desktop"` (DB moves to `~/.local/share/build.mozart.desktop/mozart.db`; re-apply seed after change)
- `apps/desktop/src-tauri/capabilities/default.json` — add `core:window:allow-close`, `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-is-maximized`
- `apps/desktop/src/app/shell/top-bar.component.ts` — `data-tauri-drag-region` on host; add close/min/max buttons via `getCurrentWindow()` from `@tauri-apps/api/window`; remove disabled Settings + About buttons
- `apps/desktop/src/app/shell/app-shell.component.ts` — inject ShellStore; `@if (shellStore.centerView() === 'chat') { ChatPanel } @else { EmptyCenter }`; hide `<aside>` when `!shellStore.showRightPanel()`; `grid-template-rows: 32px 1fr`
- `libs/shared-styles-theme/src/lib/shell.css` — `--sidebar-width: 260px`
- `apps/desktop/src/app/sidebar/sidebar.component.ts` — add "Add project" `+` icon button to strip header; wire to `AddRepoDialogComponent`
- `apps/desktop/src/app/sidebar/project-row.component.ts` — enable `+` New Workspace button (remove disabled + old tooltip); wire to `CreateWorkspaceDialogComponent`; visual refresh (flatter header row)
- `apps/desktop/src/app/sidebar/workspace-item.component.ts` — pill redesign: remove archive-slot/archive-btn entirely; single-row `status-dot + title`; branch subtitle on hover only
- `apps/desktop/src/app/services/bindings.service.ts` — expose `startAgentRun()` and `stopAgentRun()` using `channelToObservable` util; remove the TODO comment
- `apps/desktop/src/app/state/project.store.ts` — add `addRepo(path: string): Promise<void>` method (calls `bindings.addRepo()`, then `refresh()`)
- `apps/desktop/src/app/state/workspace.store.ts` — add `createWorkspace(repoId, baseBranch, taskText): Promise<WorkspaceDto>` method

### Reference (read-only)
- `apps/desktop/src/app/state/project.store.ts` — pattern for rxMethod + withCallState + withHooks
- `apps/desktop/src/app/state/workspace.store.ts` — cross-store inject pattern
- `apps/desktop/src/app/_bindings.ts:83` — exact Channel-based command signature
- `apps/desktop/src/app/sidebar/sidebar-empty.component.ts` — existing dialog trigger pattern

---

## 6. Pseudocode (per non-trivial unit)

### `shell.store.ts`
```ts
signalStore(
  { providedIn: 'root' },
  withDevtools('shell'),
  withState({ rightPanelOpen: false }),
  withComputed((store) => {
    const ws = inject(WorkspaceStore);
    return {
      activeWorkspaceId: computed(() => ws.selectedWorkspaceId()),
      centerView: computed(() => ws.selectedWorkspaceId() ? 'chat' : 'empty'),
      showRightPanel: computed(() => store.rightPanelOpen() && !!ws.selectedWorkspaceId()),
    };
  }),
  withMethods((store) => ({
    toggleRightPanel: () => patchState(store, s => ({ rightPanelOpen: !s.rightPanelOpen })),
  }))
)
```

### `agent-channel.util.ts`
```ts
// Wraps Tauri Channel<T> → Observable<T>.
// complete() is idempotent (guards on subject.closed) — safe to call from
// multiple paths (natural end poller + stop() + component destroy).
export function channelToObservable<T>(): {
  channel: Channel<T>;
  events$: Observable<T>;
  complete: () => void;
} {
  const subject = new Subject<T>();
  const channel = new Channel<T>();
  channel.onmessage = (e) => subject.next(e);
  return {
    channel,
    events$: subject.asObservable(),
    complete: () => { if (!subject.closed) subject.complete(); },
  };
}
```

### `bindings.service.ts` — `startAgentRun`
```ts
startAgentRun(workspaceId: string, prompt: string): {
  events$: Observable<StreamEvent>;
  stop: () => Promise<void>;
} {
  const { channel, events$, complete } = channelToObservable<StreamEvent>();
  const done$ = new Subject<void>(); // kills poller from both natural-end and stop() paths

  const run$ = this.commands.startAgentRun(workspaceId, prompt, channel)
    .then(result => {
      if (result.status === 'error') { complete(); throw toMozartError(result.error); }
      return AgentRunSchema.parse(result.data);
    })
    .catch(err => { complete(); throw err; });

  // Natural-end detection: poll listRuns every 1.5s until terminal status.
  run$.then(run =>
    interval(1500).pipe(
      takeUntil(done$),
      switchMap(() => from(this.commands.listRuns(workspaceId))),
      map(r => r.status === 'ok' ? AgentRunSchema.array().parse(r.data) : []),
      map(runs => runs.find(r => r.run_id === run.run_id)),
      filter(r => !!r && ['done','error','stopped','crashed'].includes(r.status)),
      take(1),
    ).subscribe({ next: () => { complete(); done$.complete(); } })
  ).catch(() => complete());

  return {
    events$,
    stop: async () => {
      done$.next(); done$.complete();   // kill poller
      const run = await run$;
      await this.commands.stopAgentRun(run.run_id);
      complete();
    },
  };
}
```

**Leak guarantees:**
- `takeUntilDestroyed()` in ChatPanel tears down `events$` on component destroy
- `done$` terminates the poller on natural end OR `stop()` call
- `complete()` is idempotent; double-call from overlapping paths is safe

### `chat-panel.component.ts`
```ts
readonly workspaceId = computed(() => inject(ShellStore).activeWorkspaceId());
readonly tokens = signal('');
readonly isRunning = signal(false);
readonly errorMsg = signal<string | null>(null);
readonly inputText = model('');
private _stopFn: (() => Promise<void>) | null = null;

async send() {
  if (!this.inputText().trim() || this.isRunning()) return;
  const prompt = this.inputText();
  this.inputText.set(''); this.isRunning.set(true); this.errorMsg.set(null);
  this.tokens.update(t => t + `\n\n> ${prompt}\n\n`);

  const { events$, stop } = this.bindings.startAgentRun(this.workspaceId()!, prompt);
  this._stopFn = stop;

  events$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
    next: (e) => {
      if ('text' in e) this.tokens.update(t => t + e.text);       // StreamToken
      if ('message' in e) this.errorMsg.set(e.message);           // Error
    },
    complete: () => this.isRunning.set(false),
    error: (err) => { this.isRunning.set(false); this.errorMsg.set(String(err)); },
  });
}

async stop() { await this._stopFn?.(); this.isRunning.set(false); }
```

### `top-bar.component.ts` — window controls
```ts
// Host element: data-tauri-drag-region
// Buttons need pointer-events: auto to override drag region (or stopPropagation)
minimize = () => getCurrentWindow().minimize();
toggleMax = () => getCurrentWindow().toggleMaximize();
close = () => getCurrentWindow().close();
// Template right side: [─] [□] [✕] buttons calling the above
```

### `add-repo-dialog.component.ts`
```ts
// hlm-dialog: text input for absolute path
// submit → projectStore.addRepo(path) → toast success/error → dialogRef.close() on success
```

### `create-workspace-dialog.component.ts`
```ts
// hlm-dialog: textarea (task description) + branch select (from bindings.listBranches(repoPath))
// submit → workspaceStore.createWorkspace(repoId, branch, taskText)
//        → workspaceStore.select(newWorkspace.workspace_id)   ← opens center chat panel
//        → dialogRef.close()
```

---

## 7. Error handling strategy

- TopBar window-control failures (OS-level): swallow silently
- `startAgentRun` IPC error → `errorMsg` signal in ChatPanel; `isRunning = false`
- `addRepo` / `createWorkspace` errors → `hlm-sonner` toast with `MozartError.message`; dialog stays open for retry
- All IPC still wraps through the existing `invoke()` envelope in `bindings.service.ts`

---

## 8. Task list (will be atomized into TASKS.md)

1. **S1.8b.1 — Window + custom titlebar** — `tauri.conf.json` (resize + decorations + identifier) + `capabilities/default.json` (window perms) + `top-bar.component.ts` (drag region + controls) + `app-shell.component.ts` (32px row)
2. **S1.8b.2 — ShellStore** — `shell.store.ts` + `shell.store.spec.ts` (TDD) + `app-shell.component.ts` (center panel switch, aside hide) (depends: S1.8b.1)
3. **S1.8b.3 — Sidebar visual redesign** — `shell.css` (260px) + `sidebar.component.ts` + `project-row.component.ts` + `workspace-item.component.ts` (pill, no archive slot) (depends: S1.8b.1) [parallel with S1.8b.2 after S1.8b.1]
4. **S1.8b.4 — Agent streaming** — `agent-channel.util.ts` (NEW) + `bindings.service.ts` (start/stop) + `chat-panel.component.ts` (NEW) (depends: S1.8b.2) [parallel with S1.8b.3]
5. **S1.8b.5 — Add Repo + Create Workspace** — `add-repo-dialog.component.ts` (NEW) + `create-workspace-dialog.component.ts` (NEW) + `project.store.ts` (addRepo) + `workspace.store.ts` (createWorkspace) + sidebar trigger wiring (depends: S1.8b.2, S1.8b.3, S1.8b.4)

---

## 9. Validation gate

```sh
pnpm nx lint desktop
pnpm nx typecheck
pnpm nx test desktop
pnpm nx build desktop

# No `any` escapes
! grep -rEn ': any( |$|;|,|\))' apps/desktop/src/app/state/shell.store.ts
! grep -rEn ': any( |$|;|,|\))' apps/desktop/src/app/shell/chat-panel.component.ts
! grep -rEn ': any( |$|;|,|\))' apps/desktop/src/app/services/agent-channel.util.ts

# Manual:
# 1. pnpm dev → window 1400×900, no native titlebar, custom controls work
# 2. Add repo → sidebar shows project
# 3. Create workspace → workspace pill appears
# 4. Click workspace → ChatPanel opens in center
# 5. Type prompt → stream appears token by token → isRunning auto-clears
# 6. Stop mid-run → channel completes, no leak
```

---

## 10. Rollback

Revert the 5 atom commits. No schema migration, no new Rust code, no `_bindings.ts` regen required. Identifier change moves DB location — reseed after revert if needed.

---

## 11. Open questions

(none)

---

## 12. Confidence

**8/10** — Rust layer 100% done, all IPC proven. Risk: `channelToObservable` wrapping is new to this codebase — smoke test with `pnpm dev` will confirm the Channel typing from tauri-specta lines up with expectations immediately.
