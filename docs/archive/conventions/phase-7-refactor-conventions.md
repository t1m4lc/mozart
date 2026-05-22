# Mozart — Phase 7 refactor conventions

> Companion document referenced by the Phase 7 prompt.
> The prompt focuses on **what** to do and **in which order**.
> This document defines **how** to do it — the technical
> conventions every refactor in Phase 7 must respect.
>
> Read this top-to-bottom once before starting any atom. Refer
> back to specific sections during implementation.

---

## 0. Angular 22 stance

Mozart is built on Angular 22, which is fundamentally :

- **Signal-first** — Signals are the primary reactivity
  primitive. Component inputs, queries, state, derived values,
  and async data all flow through signals. RxJS is still
  useful, but as a complement, not as the default.
- **Zoneless** — Mozart runs without `zone.js`. Change
  detection is driven by signal reads in templates. There is
  no implicit "Angular re-checks everything on any
  microtask" anymore. Code that relied on zone-based CD
  (especially `setTimeout`, third-party callbacks, manual
  `ChangeDetectorRef.detectChanges()`) needs explicit signal
  updates or `afterNextRender` hooks.
- **Performance-first** — Standalone components, lazy routes,
  `defer` blocks, `track` expressions in `@for`, OnPush
  everywhere by default, signal-driven CD. The cost of a
  re-render is now proportional to what actually changed, not
  to the size of the component tree.

What this means concretely for Phase 7 refactors :

1. **Default to signals.** If you reach for an
   `EventEmitter`, a `BehaviorSubject`, or a class property,
   ask whether a signal would fit better. Usually it does.
2. **Avoid `effect()` for state derivation.** In zoneless,
   `effect()` is even more clearly a side-effect tool — DOM,
   logging, integration with non-signal libraries. State
   that derives from other state uses `computed` /
   `linkedSignal` / resources.
3. **Use Signal Forms, not Reactive Forms.** See §1.8.
4. **Verify zoneless compatibility** when touching code that
   uses `setTimeout`, `setInterval`, `Promise.then()` without
   awaiting, third-party callbacks. These may need
   `runInInjectionContext` / `NgZone.run` (rare) or — better
   — a signal update inside the callback so the next CD pass
   picks it up.
5. **Trust the signal graph.** Don't manually call
   `detectChanges()` or `markForCheck()` to "make it work."
   If something doesn't re-render, the cause is almost
   always a missing signal read in the template, not a CD
   problem.

The conventions below assume this stance. They're written
for Angular 22, not for Angular 16.

---

## 1. Refactor principles

### 1.1 Prefer duplication over a bad abstraction

Before extracting shared code, verify :

- Is it duplicated at least twice ?
- Is the abstraction obvious to a reader who hasn't seen the
  original copies ?
- Are the call sites actually the same concept, not just
  superficially similar ?
- Does extraction reduce complexity rather than spread it ?

If any answer is "not really" — keep the duplication. A short
copy-paste is cheaper than a 200-line `util-` file that fits
no one's actual use case.

### 1.2 Use `linkedSignal` for writable derived UI state

Use `linkedSignal` when a local UI state :

- Has a default value derived from another signal
- Must remain writable by the user
- Should resync when the source changes
- Represents selection-like state (selected item, active tab,
  draft form initialized from a source)

Good example :

```ts
selectedWorkspace = linkedSignal({
  source: () => this.workspaces(),
  computation: (workspaces, previous) => {
    const previousWorkspace = previous?.value;
    if (previousWorkspace && workspaces.some(w => w.id === previousWorkspace.id)) {
      return previousWorkspace;
    }
    return workspaces[0] ?? null;
  },
});
```

Prefer this over `effect()` resync, duplicated `signal()` +
imperative synchronization, or fragile `ngOnChanges`.

### 1.3 Do NOT replace Signal Store with `linkedSignal`

`linkedSignal` is for **local, component-level** writable
derived state. Signal Store stays for :

- Domain state
- Cross-component state
- Persisted UI state
- Async state
- Entity collections
- App-wide selection used by multiple components
- State that must appear in Redux DevTools

### 1.4 Reduce `effect()` usage

In a zoneless app, `effect()` is even more clearly a
**side-effect** tool, not a state-derivation tool. Replace
`effect()` with declarative primitives whenever possible :

| Use case                          | Wrong                                | Right                                          |
| --------------------------------- | ------------------------------------ | ---------------------------------------------- |
| Sync derived state                | `effect(() => this.x.set(this.y()))` | `x = computed(() => this.y())`                 |
| Reset selection when list changes | `effect()`                           | `linkedSignal()`                               |
| Load data when params change      | `effect() + fetch`                   | `resource()` / `rxResource()`                  |
| Form draft from source            | `effect()`                           | `linkedSignal()`                               |
| React to route change             | `effect()`                           | `withComponentInputBinding` + signal `input()` |

Allowed uses of `effect()` :

- Integration with imperative browser APIs (focus, scroll,
  DOM manipulation that can't go through `afterNextRender`)
- Development logging / debugging
- Syncing with non-signal-aware third-party libraries
- Controlled side effects with explicit cleanup
- Persisting a signal to localStorage / IndexedDB

**Rule of thumb** : if the `effect()` body calls
`.set(...)` or `.update(...)` on a signal, it's almost
certainly a state derivation that should be a `computed` or
`linkedSignal`.

### 1.5 Prefer pure functions

Extract logic into pure functions for : selection fallback,
sorting, grouping, filtering, status mapping, label/icon
mapping, branch name sanitization, route building, form
normalization, DTO conversion, error mapping, view model
mapping.

Example :

```ts
function keepPreviousSelectionOrFirst<T extends { id: string }>(
  items: readonly T[],
  previous: T | null | undefined,
): T | null {
  if (previous && items.some(item => item.id === previous.id)) {
    return previous;
  }
  return items[0] ?? null;
}
```

### 1.6 Avoid mutation

Never mutate arrays, objects, maps, trees, or store state
directly.

Bad :

```ts
items.push(newItem);
item.name = newName;
state.projects[index] = updatedProject;
treeNode.children.push(child);
```

Right :

```ts
items.update(current => [...current, newItem]);
projects.update(current =>
  current.map(p => p.id === updatedProject.id ? updatedProject : p),
);
const sorted = [...items].sort(compareItems);  // or items.toSorted(...)
```

### 1.7 Modern Angular 22 APIs

Prefer :

- Standalone components (no `NgModule`)
- Signal inputs : `input()` and `model()`
- Signal queries : `viewChild()`, `viewChildren()`,
  `contentChild()`, `contentChildren()`
- `computed`, `linkedSignal`, `resource`, `rxResource`,
  `httpResource`
- `inject()` over constructor injection where consistent
- `DestroyRef` + `takeUntilDestroyed` for cleanup
- Template control flow : `@if`, `@for` (with `track`),
  `@switch`
- `defer` blocks where safe and useful
- `afterNextRender` / `afterRender` for DOM-touching code
  that needs the view to exist
- Signal Forms (see §1.8) for every form in the app

Replace `@ViewChild` / `*ngIf` / `*ngFor` only when touching
the component for another reason — don't churn just for
aesthetics.

### 1.8 Signal Forms — the only forms API in Mozart

Reference : https://angular.dev/essentials/signal-forms

**Mozart uses Signal Forms exclusively** (per `plan.md`
cross-cutting tech conventions). Reactive Forms
(`FormGroup`, `FormControl`, `FormBuilder`) and Template-
driven Forms (`NgModel`, `NgForm`) are **forbidden in new
code**. If the audit found drift (legacy `FormGroup` usage
landed during MVP), Phase 7 migrates it.

Why Signal Forms fits Mozart's stance :

- Signal-first by design — form state is signals
  (`value`, `valid`, `touched`, `dirty`, `errors`), reads
  participate in CD naturally
- Zoneless-compatible without any workarounds
- Type-safe by default (no `<any>` escape hatches like
  legacy Reactive Forms)
- No `ControlValueAccessor` boilerplate for custom controls
- Validation composes via plain functions, not class-based
  validators

Typical shape :

```ts
import { Component } from '@angular/core';
import { form, required, minLength, email, Control }
  from '@angular/forms/signals';

@Component({
  selector: 'login-form',
  imports: [Control],
  template: `
    <input type="email" [control]="loginForm.email" />
    @if (loginForm.email.touched() && loginForm.email.errors().required) {
      <span class="error">Email required</span>
    }

    <input type="password" [control]="loginForm.password" />

    <button [disabled]="!loginForm.valid()" (click)="submit()">
      Sign in
    </button>
  `,
})
export class LoginForm {
  protected readonly loginForm = form({
    email: '',
    password: '',
  }, {
    email: [required(), email()],
    password: [required(), minLength(8)],
  });

  protected submit(): void {
    if (this.loginForm.valid()) {
      const { email, password } = this.loginForm.value();
      // ...
    }
  }
}
```

> The exact Signal Forms API surface (function names, import
> paths, signatures) evolves quickly. Verify against
> https://angular.dev/essentials/signal-forms before
> implementing — the example above shows the **shape**, not
> the canonical syntax.

Patterns to use :

- **Local UI form** : `form({...})` directly in the
  component. The form's signals drive the template.
- **Form initialized from async data** : combine with
  `linkedSignal` to reset the form when the source data
  changes :

  ```ts
  readonly project = resource({...});

  readonly editForm = linkedSignal({
    source: () => this.project.value(),
    computation: (project) => project
      ? form({ name: project.name, description: project.description }, {
          name: [required()],
        })
      : null,
  });
  ```

- **Cross-field validation** : a function reading multiple
  field signals, used as a form-level validator
- **Custom controls** : a component with a `model()` input
  participates in Signal Forms via the `[control]` directive
  binding — no `ControlValueAccessor`

Anti-patterns to migrate during Phase 7 :

```ts
// ❌ Reactive Forms — migrate to Signal Forms
this.fb.group({
  name: ['', Validators.required],
  email: ['', [Validators.required, Validators.email]],
});

// ❌ Template-driven — migrate to Signal Forms
<input [(ngModel)]="name" required />

// ❌ Manual form state with signals — use Signal Forms instead
readonly name = signal('');
readonly nameTouched = signal(false);
readonly nameValid = computed(() => this.name().length > 0);
```

### 1.9 Zoneless considerations

Mozart runs zoneless. Most of the time you don't notice — if
you read signals in the template, CD picks them up. But a
few situations need attention :

- **Third-party callbacks** (libraries that aren't
  signal-aware) : if a callback updates state outside
  Angular's awareness, update a signal inside the callback
  so the next CD pass picks it up. Don't reach for
  `NgZone.run`.

  ```ts
  someLibrary.onEvent((data) => {
    this.lastEvent.set(data);  // signal update → CD pass triggered
  });
  ```

- **`setTimeout` / `setInterval`** : prefer not to use them
  for state coordination. If you must (e.g. a UI debounce
  outside RxJS), the callback should update a signal
  directly — same pattern as above.

- **DOM measurements** : use `afterNextRender` so the DOM
  exists when you read it.

  ```ts
  readonly anchor = viewChild<ElementRef>('anchor');

  constructor() {
    afterNextRender(() => {
      const rect = this.anchor()?.nativeElement.getBoundingClientRect();
      // ...
    });
  }
  ```

- **`detectChanges()` / `markForCheck()`** : avoid. If
  something doesn't re-render, the cause is almost always a
  missing signal read in the template, not a CD glitch.

- **Promises without `await`** : a fire-and-forget promise
  that updates state still works (the update is a signal
  write), but the lack of error handling is a code smell.
  Audit and either `await` or `.catch(...)`.

The router and forms in Angular 22 are zoneless-compatible
out of the box. HTTP via `provideHttpClient(withFetch())` is
zoneless-compatible.

---

## 2. Angular async, resources, DTO

### 2.1 Pick the right async primitive

| Async source                                 | Primitive         |
| -------------------------------------------- | ----------------- |
| HTTP query-like read                         | `httpResource`    |
| RxJS stream-friendly read                    | `rxResource`      |
| Promise-based read (Tauri command, FS)       | `resource`        |
| Mutation, command, write, destructive action | Imperative method |
| User-triggered action                        | Imperative method |

Read-like flows : declarative.
Write-like flows : imperative.

Avoid manual `loading` / `error` / `data` signals when a
resource can represent the state.

Avoid copying `resource.value()` into another writable signal
unless the user edits a local draft (then use `linkedSignal`).

### 2.2 RxJS rules

Use RxJS when stream operators add real value :

- `debounceTime` for search inputs
- `distinctUntilChanged` to dedupe identical emissions
- `switchMap` for replace-latest queries
- `exhaustMap` for actions where repeated clicks should be
  ignored mid-flight
- `concatMap` for ordered operations
- `mergeMap` only when parallel execution is intentional
- `retry` only when safe
- `catchError` to return a controlled state
- `combineLatest` for combining streams

Avoid : nested `.subscribe(...)`, unmanaged subscriptions,
`setTimeout` / `setInterval` for async coordination, overly
dense unnamed pipelines.

### 2.3 Route params : prefer `withComponentInputBinding`

Reading route params via `ActivatedRoute.params` + `toSignal`
is the **old way**. Modern Angular (16+) provides
`withComponentInputBinding()` which binds route params, query
params, and resolver data directly to component `input()`s.

The router setup (in `app.config.ts` or equivalent) :

```ts
provideRouter(
  routes,
  withComponentInputBinding(),
)
```

Then the component declares an input matching the route
param name, and Angular feeds it automatically :

```ts
// Route : { path: 'projects/:projectId', component: ProjectPage }
@Component({...})
export class ProjectPage {
  readonly projectId = input.required<string>();

  // Combine with a resource for declarative data loading
  readonly project = resource({
    params: () => ({ id: this.projectId() }),
    loader: ({ params }) => this.projectService.getProject(params.id),
  });
}
```

Or with `rxResource` if RxJS operators bring value :

```ts
readonly project = rxResource({
  params: () => ({ id: this.projectId() }),
  stream: ({ params }) => this.projectService.getProject$(params.id).pipe(
    distinctUntilChanged(),
  ),
});
```

Benefits :

- No `ActivatedRoute` injection
- No manual `toSignal` plumbing
- Component is testable in isolation by setting the input
  directly
- Reactivity is automatic — changing the route param updates
  the input, which re-triggers any `computed` / `resource`
  that reads it

Use `ActivatedRoute` only when you need something beyond
inputs (matrix params, custom param maps, parent route data
that can't be bound). In those rare cases, prefer
`toSignal(route.paramMap)` for a single hop over chained
`switchMap` pipelines.

### 2.4 Avoid nested subscribes

When `withComponentInputBinding` doesn't fit (e.g. action
chains, complex multi-source flows), still avoid nesting
subscribes.

Bad :

```ts
this.userService.getCurrentUser().subscribe(user => {
  this.permissionsService.getPermissions(user.id).subscribe(permissions => {
    this.permissions.set(permissions);
  });
});
```

Better :

```ts
readonly permissions = toSignal(
  this.userService.getCurrentUser().pipe(
    switchMap(user => this.permissionsService.getPermissions(user.id)),
  ),
  { initialValue: [] },
);
```

Or convert to a resource if it's a query-like read.

### 2.5 DTO / boundary discipline

Define explicit DTO types for data crossing Rust / Tauri or
HTTP boundaries.

Rules :

- Backend / internal models never leak directly into UI state
- Map DTOs into frontend view models when shapes differ
- Validate unknown external data before trusting it
- For commands, build explicit request DTOs with only the
  fields the backend needs
- Avoid accidental over-posting (sending full UI objects when
  3 fields would do)
- Keep request DTOs and response DTOs separate when they have
  different responsibilities

Bad :

```ts
await invoke('run_node_action', { node: selectedNode });
```

Right :

```ts
await invoke('run_node_action', {
  request: { workspaceId, path, action },
});
```

Never send UI-only or unsafe fields : cached values, derived
values, secrets, debug data, raw command output, internal
metadata.

---

## 3. Security & safety

### 3.1 Frontend rules

- Treat frontend input as untrusted before it reaches Rust
- Validate early for UX, but don't rely on frontend validation
  alone
- Display frontend-safe error messages (no raw stack traces,
  absolute paths, environment variables, tokens, or process
  output unless explicitly required)

### 3.2 Rust / Tauri rules

- Commands validate paths, workspace IDs, branch names, and
  file operations
- Prevent path traversal (`..`, absolute paths outside the
  workspace, symlink escape)
- Prevent filesystem operations outside the selected workspace
- Keep Git operations scoped to the selected workspace
- Never trust a frontend-provided path blindly
- Use `Result<T, AppError>` for fallible commands
- Avoid `panic!()`, `unwrap()`, `expect()` for expected user
  / filesystem / Git / process errors
- Convert errors into safe frontend messages

For long operations, consider progress events, cancellation,
non-blocking execution, partial-failure reporting.

---

## 4. Error handling

### 4.1 Code-level

For async flows :

- Catch expected errors
- Map unknown errors into a controlled `UiError` shape
- Don't leak raw backend / Rust / process errors into UI
- Don't swallow errors silently
- Don't throw strings

Example shape :

```ts
type UiError = {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  recoverable: boolean;
};
```

### 4.2 UI-level

The UI shows error state **clearly but discreetly**.

Avoid :

- Spamming toasts (especially repeated identical errors)
- Blocking the user unnecessarily
- Exposing raw stack traces, absolute paths, or secrets
- Making the whole UI look broken for a local error

Prefer :

- Inline error state in the affected panel / card
- Small muted warning banner
- Retry button where useful
- Disabled action with a tooltip reason
- One toast per important action failure (not per render)
- Persistent state indicator for long-lived errors

Examples :

- File tree failed to load → inline error in file tree panel
- Git status failed → small warning near Git area
- Destructive action failed → toast + inline recovery option
- Provider unavailable → discreet provider status indicator
- Selected workspace missing → empty state with recovery CTA

---

## 5. Component refactor checklist

For each component significantly touched in Phase 7, walk this
checklist :

- Is this component doing too much (data load + DTO map +
  filter / sort + complex template + error formatting +
  layout) ?
- Should this split into `feature-*` (coordination) + `ui-*`
  (presentational) + `data-access` (store / facade /
  resource) + `util-*` (pure helpers) ?
- Is state local, shared UI, or domain ? Right home for each ?
- Can writable signals be reduced ?
- Can `computed` replace duplicated derived state ?
- Can `linkedSignal` replace effect-based sync ?
- Can async loading become `resource` / `rxResource` /
  `httpResource` ?
- Are inputs `input()` / `model()` ?
- Are queries `viewChild()` / `viewChildren()` ?
- Are loops `@for` with proper `track` ?
- Are conditionals `@if` ?
- Are subscriptions cleaned up (`takeUntilDestroyed` or
  similar) ?
- Is mutation avoided ?
- Are DTOs explicit at the boundary ?
- Are request DTOs minimal ?
- Are errors caught and mapped to `UiError` ?
- Does the UI show error state discreetly ?

If you would touch a component and the checklist exposes
nothing fixable, **leave the component alone**. Don't churn
files for the sake of consistency.

---

## 6. Anti-patterns — what to look for

The grep pass in Phase 7's final step looks for these
patterns. For each match, decide : refactor, or keep with
justification.

| Pattern                                                                  | Default action                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `.subscribe(`                                                            | Audit : nested subscribes refactor, top-level with `takeUntilDestroyed` keep, fire-and-forget refactor |
| `setTimeout(` / `setInterval(`                                           | Refactor unless used for genuine timing UI (debounce defers, animation frames)                         |
| `effect(`                                                                | Audit : check §1.4 allowed uses                                                                        |
| `.push(` / `.splice(` / `.sort(` / `.reverse(` on signals or store state | Refactor to immutable update                                                                           |
| `@ViewChild` / `@ViewChildren`                                           | Refactor to signal queries when touching the file                                                      |
| `*ngIf` / `*ngFor`                                                       | Refactor to `@if` / `@for` when touching the file                                                      |
| `FormGroup` / `FormControl` / `FormBuilder` / `Validators`               | Migrate to Signal Forms (§1.8) — these are forbidden in new code                                       |
| `[(ngModel)]` / `NgModel` / `FormsModule`                                | Migrate to Signal Forms (§1.8)                                                                         |
| `detectChanges()` / `markForCheck()`                                     | Remove — in zoneless, this hides a missing signal read in the template                                 |
| `ChangeDetectorRef` injection                                            | Audit : usually means a missing signal read, refactor                                                  |
| `NgZone.run` / `NgZone.runOutsideAngular`                                | Audit : zoneless apps rarely need this ; usually replaceable by a signal update inside the callback    |
| `panic!(` / `.unwrap()` / `.expect()` in Rust                            | Refactor to `Result<T, AppError>` if it's an expected failure mode                                     |

Keep refactors **opportunistic** — only when already in the
file for another reason. Don't open files just to flip syntax.

---

## 7. Architecture & naming

### 7.1 Domain structure

Follow the angular-architects/flights42-inspired pattern :

```
domains/
  project/
    data-access/      # stores, resources, facades, adapters
    feature-*/        # smart components, coordination
    ui-*/             # presentational components
    util-*/           # pure helpers, mappers, type guards
  workspace/
    data-access/
    feature-*/
    ui-*/
    util-*/
  ui-state/
    data-access/
    util-*/
```

Guidelines :

- `feature-*` : smart, owns coordination + state access
- `ui-*` : presentational, inputs / outputs only
- `data-access` : stores, async, adapters
- `util-*` : pure functions only
- Avoid generic `shared/` dumps
- Avoid massive barrel files
- Don't move files just for aesthetic consistency

### 7.2 Architectural boundaries (already strong per audit — preserve)

- `@tauri-apps/api` imports stay in `/data/` or `/core/`
  (specifically `*-tauri.adapter.ts` and similar boundaries)
- `libs/ui` has no runtime imports from any `@mozart/`
  domain (type-only allowed)
- Every component stays `OnPush`
- Facade is the only public entry to a domain's data layer

---

## 8. Naming hygiene

- Pure functions : verb-noun (`mapDtoToWorkspace`,
  `keepPreviousOrFirst`, `sanitizeBranchName`)
- Computed signals : noun describing the state
  (`filteredWorkspaces`, `selectedWorkspace`,
  `unreadCount`)
- Store selectors : noun matching domain concept
  (`activeProject`, `workspaceById`)
- Imperative methods on store / facade : verb-noun
  (`addProject`, `markChatRead`, `archiveWorkspace`)
- Event outputs : past-participle (`saved`, `cancelled`,
  `selectionChanged`) — outputs describe what just happened

---

## 9. Documentation expectations during refactor

When a refactor introduces a new pattern or non-obvious
decision :

- Short TSDoc comment on the public surface (5-10 lines max)
- No essay-length comments
- Move complex rationale to `ARCHITECTURE.md` if it's
  cross-cutting

When in doubt about whether a change deserves a comment :
ask "would the next contributor be confused without it ?"
If yes, comment briefly. If no, the code speaks for itself.
