# Performance backlog

Running log of performance improvements — done, in-flight, and
deferred. Use this when planning sessions to pick up where the
previous one left off.

---

## Done (chronological)

| Date | Commit | What |
|---|---|---|
| 2026-05-16 | `82ed6a9` | Tighten `@defer` triggers on Run/Terminal; code-split PTY (xterm), tour (highlight-overlay), markdown (marked.js). |
| 2026-05-16 | `53e9fc0` | `FILE_TAB_CAP = 1` — each file open replaces the previous (less DOM, less memory). |
| 2026-05-16 | `8d6da93` | Open in Terminal Rust handler — system terminal launch per OS. |
| 2026-05-16 | `37f6171` | CDK virtual scroll on `message-list` (autosize via fixed-strategy + generous buffer). |
| 2026-05-16 | `a936485` | `@defer (when flags.foo())` — feature-flag-gated UIs both hide AND code-split. |
| 2026-05-16 | `dae31ef` | Defer each onboarding step + tour closing card → 4 chunks. |
| 2026-05-16 | `e3255a4` | Async-impl pattern for `NotificationService` (dynamic-import the tauri-plugin-notification half). |
| 2026-05-16 | `449a4fc` | All 10 dialogs → dynamic `import()` at click time. |
| 2026-05-16 | `c033ffc` | Defer central-area `FeatureFileDiff` (diff + markdown stack as its own chunk). |
| 2026-05-16 | `cd40a73` | Bottom slot tabs : `[hidden]` + `@defer (on interaction(terminalTabBtn))` — Terminal PTY survives tab switches. |
| 2026-05-17 | UI polish | `@defer` placeholders aligned with `existing-ui-polish-plan.md` item 17 — file-diff, terminal, run, and onboarding PTY get `@loading` skeletons + non-empty `@placeholder` (no more white voids). |

---

## In flight

_(nothing right now)_

---

## Backlog — Performance

### High-impact / low-effort

- **Image asset compression** — `finder.png` (688 KB), `vscode.png` (115 KB), `terminal.png` (72 KB) should all be < 20 KB. Tooling: `pngquant`, `imagemin`, or replace with SVG. _User-handled._
- **`mozart.svg` replacement** — pending new logo from user.
- **Re-measure production bundle** — `pnpm nx build desktop`. Pre-Phase-7-Block-9 the initial bundle was over the 1.5 MB error budget by 116 KB. The 10+ `@defer` chunks shipped since should clear it. If not, profile + identify next biggest entry point.

### Medium-impact / medium-effort

- **CDK virtual scrolling on `feature-file-tree`** — large repos render every node today. Tree → flat visible-node list with depth metadata, then CDK virtual scroll. Multi-day effort.
- **Settings sections `@defer (on viewport)`** — each section in its own chunk. Marginal (sections are small).
- **State-preserving onboarding steps** — apply the `[hidden]` + `@defer (on interaction)` pattern so form state in step 2/3/4 survives going back. Needs UX call on whether back-nav should preserve state.
- **Apply the async-impl pattern (a.k.a. injectAsync) to other heavy services** — candidates: `IdeDetectionService` (PATH-walk overhead), `RepositoriesFacade` watcher plumbing, `TerminalRegistryService`. Profile first.
- **FS watcher → central-area diff refresh** — the FS watcher tick lives in `feature-workspace-aside`. The central-area `FeatureFileDiff` (when a file tab is active) does NOT auto-refresh on file changes. Fix: lift the watcher tick to a workspace-level service so both consumers can react.
- **Drop unused dialog re-exports** — after the commit `449a4fc` dialog dynamic-import refactor, the named exports in `domains/projects/index.ts`, `domains/profile/index.ts`, `domains/repositories/index.ts` for `CloneRepoDialog`, `CreateProjectDialog`, `InitProjectDialog`, `ConfirmDeleteProjectDialog`, `UiGithubConnectDialog`, `UiConfirmDisconnectDialog`, `UiConnectionHelpDialog`, `UiConnectDialog`, `FeatureCommitDialog`, `FeatureCreatePrDialog` are no longer needed. Removing them removes one more static-reference path. Verify no external consumer, then drop.

### Low-impact / high-effort

- **Custom CDK `autosize` strategy for messages** — replaces the fixed-size strategy + buffer approach. More accurate scrollbar, but the fixed-size strategy works for the typical 10-200 message range. Defer until heavy chats hit perf issues.
- **Code-splitting dialog stack** further — the underlying Hlm + Brn dialog primitives load with the first dialog. Splitting them per-dialog has diminishing returns.

---

## Backlog — Code health

| Item | Notes |
|---|---|
| Rust safety review | `src-tauri/` has ~655 `unwrap` / `expect` / `panic!` sites. Audit each, replace with `?` propagation + typed `AppError`. Separate Rust-safety pass. |
| 3 lint warnings (`_state`, `TerminalEvent` unused) | Cosmetic. |
| Audit `effect()` usage | Conventions §1.4 says to reduce them. Current count: 24 in apps/desktop. Re-audit for `linkedSignal` / `computed` replacements. |

---

## Patterns documented

- **`@defer (when flags.foo())`** — flag gates that hide AND code-split. See `core/feature-flags.ts` for the pattern docstring + first use in `app-shell.ts`.
- **Async-impl service** (a.k.a. `injectAsync` equivalent) — consumer keeps `inject(Service)` sync ; the heavy dependency lives behind a dynamic `import()` in a sibling `-impl.ts` file. First use in `core/notification.service.ts` + `core/notification-impl.ts`.
- **Dialog dynamic-import** — `const { FooDialog } = await import('./foo-dialog'); dialog.open(FooDialog, { context });` inside click handlers. Removes the static reference so the bundler emits the dialog class as its own chunk.
- **State-preserving tabs with `@defer (on interaction)`** — three `[hidden]` divs, each lazy-loaded on first interaction with a designated trigger button ref. First use in `feature-workspace-aside.ts` (bottom slot tabs). Best fit for the `on interaction` trigger; @switch-gated cases prefer `on immediate` because the @case mounts AFTER the click.

---

## Why no real `injectAsync`?

The user asked: "why injectAsync not used for notification service?". Honest answer: **`injectAsync` is not a real Angular API** (yet). As of Angular 22.2.12 the only injection primitives are `inject<T>(token)` (sync) and `runInInjectionContext`. There's no first-class `injectAsync<T>(token): Promise<T>`.

The closest practical equivalents in Angular today :

1. **Dynamic `import()` of the heavy module** behind the service interface. Consumer still does sync `inject(Service)`; the service caches a `Promise<Impl>` and awaits it on the first call. This is what `NotificationService` does — see `core/notification-impl.ts`.
2. **`provideEnvironmentInitializer` with an `async` factory** for app-startup async setup. Not for lazy injection at use time.
3. **`resource()` / `httpResource()` / `rxResource()`** for async DATA, not async CLASSES.
4. **`@defer (when condition)` with `injector` context** for templated lazy mounting — also code-splits the components inside, but it's template-scoped, not service-scoped.

When (and if) Angular ships an actual `injectAsync` primitive, the async-impl pattern in `NotificationService` becomes a one-line swap — the rest of the consumer surface stays unchanged.
