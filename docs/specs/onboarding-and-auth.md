# Mozart — Onboarding & Authentication Specification

> **Scope** : v0.0.1 MVP — Phase 5 (Auth + Foundations) and
> Phase 6 (Polish + Onboarding tour). Covers the desktop app, the
> companion `apps/web` (Clerk-hosted auth surface), the deep-link
> handshake, the post-auth onboarding flow, and the `/tour`.
> **Purpose** : single source of truth for everything between
> _"user opens Mozart for the first time"_ and _"user is in the
> dashboard ready to add a project"_.
>
> **Companion specs** :
>
> - `plan.md` Phase 5 + Phase 6 (this doc fleshes them out)
> - `sidebar-and-state-coherence.md` (dashboard the tour ends on)

---

## 1. Overview of the flow

```
                       ┌─────────────────┐
                       │  DESKTOP : /    │ ← target after onboarding
                       └────────▲────────┘
                                │ (success)
                                │
       ┌────────────────────────┴───────────────────────┐
       │           DESKTOP : /onboarding                │  Phase 6
       │ (1) Git → (2) LLM provider → (3) GitHub        │
       │ → (4) /tour → onboarding=true → /              │
       └────────────────────────▲───────────────────────┘
                                │
                                │ (token valid + first launch
                                │  or onboarding=false)
                                │
       ┌────────────────────────┴───────────────────────┐
       │            DESKTOP : /welcome                  │  Phase 5
       │ logo + "Sign in to continue" button            │
       │ → opens browser → app.mozart.build             │
       │ ← receives token (HTTP callback or mozart://)  │
       └────────────────────────▲───────────────────────┘
                                │
                                │ (1) primary : fetch 127.0.0.1:<port>/auth
                                │ (2) fallback : mozart://auth?token=…
                                │
       ┌────────────────────────┴───────────────────────┐
       │ APPS/WEB : app.mozart.build                    │
       │ /login → Clerk (GitHub / Google) → /dashboard  │
       │ → auto-fires fetch(http://127.0.0.1:<port>/    │
       │     auth?token=…&state=…)                      │
       │ (mozart:// scheme remains for cold-launch +    │
       │  email Magic Links post-MVP)                   │
       └────────────────────────────────────────────────┘
```

Three apps in the monorepo :

- **`apps/desktop`** (Tauri + Angular) — the main app.
- **`apps/web`** (Angular, hosted at `app.mozart.build`) — the
  auth surface and future user dashboard.
- **`apps/landing`** (out of this spec's scope, hosted at
  `mozart.build`) — the marketing site (static generated, blog,
  pricing). Not involved in auth.

---

## 2. Desktop : `/welcome` route

### 2.1 When it shows

Only when the desktop has no valid auth token. The very first
launch, or after a logout, or after the token has been
invalidated.

It's the **only route accessible** in the desktop without a
token. All other routes (`/`, `/workspaces/:id`, `/onboarding`,
`/tour`, `/settings`) are guarded.

### 2.2 Layout

Centered. Vertical stack :

```
                  ┌──────────────────┐
                  │                  │
                  │  [Mozart logo]   │   ← large, top
                  │                  │
                  │                  │
                  │  Start composing │   ← display heading
                  │                  │
                  │  Sign in to      │
                  │  continue        │
                  │                  │
                  │  [Sign in btn]   │   ← primary HlmButton
                  │                  │
                  │  Finish sign in  │   ← small muted text,
                  │  in the browser  │     visible after click
                  │  window.         │
                  │                  │
                  │  [Cancel]        │   ← ghost button,
                  │                  │     visible after click
                  │                  │
                  └──────────────────┘
```

### 2.3 Behavior

- **Initial state** : logo + heading + subtitle + `Sign in`
  button.
- **On `Sign in` click** :
  - Open the default OS browser at `https://app.mozart.build/`
    (via Tauri's `shell.open` adapter).
  - Replace `Sign in` button label with `Opening browser…`
    (disabled).
  - Reveal the muted sub-line _"Finish sign in in the browser
    window"_ and a `Cancel` button below it.
- **Deep-link callback received** (`mozart://auth?token=...`) :
  - Validate the token via the auth adapter.
  - Store the token in encrypted storage (§6).
  - Read `user.onboarding` flag from the token (or from a
    follow-up API call to `app.mozart.build/me`).
  - Navigate :
    - If `user.onboarding === true` → `/` (dashboard)
    - If `user.onboarding === false` → `/onboarding`
- **`Cancel` click** : revert to initial state. The browser
  window may stay open ; the user can close it manually.
- **Timeout** : if no deep-link arrives within 5 minutes, the
  Cancel button gets prominence + a banner appears : _"Taking
  too long? Try again or check your browser."_

### 2.4 No-Mozart-installed fallback (on `apps/web`)

Symmetric concern, but handled on the web side. See §4.3.

---

## 3. Token model

### 3.1 What the token carries

The token issued by Clerk (or a Mozart back-end thin wrapper) is
a JWT carrying at minimum :

```json
{
  "sub": "user_xxx", // Clerk user id
  "name": "Alice Example",
  "email": "alice@example.com",
  "github_username": "alice", // null if not connected
  "onboarding": true, // false on first sign-in
  "iat": 1700000000,
  "exp": 1700604800 // 7 days
}
```

Phase B (Phase 5 task) confirms the exact claim names with the
Clerk + back-end teams.

### 3.2 Token lifecycle

- **Issued** : when the user signs in on `app.mozart.build`,
  before the `mozart://auth` deep-link is constructed.
- **Stored** : on the desktop, encrypted via Tauri Stronghold
  (§6).
- **Refreshed** : silently, when the desktop detects the token
  is within 24 h of expiry. Calls a refresh endpoint with the
  current token, gets a new one, replaces it.
- **Revoked** : if the user explicitly logs out (post-MVP) or
  if a refresh fails with a 401.

### 3.3 Offline mode with a valid token

If the user has a valid (non-expired) stored token and is
offline :

- The app starts normally — no Clerk roundtrip needed for the
  current session.
- Only routes that require online services (e.g. PR creation,
  Clerk-gated settings) are gated with an offline banner.
- Mozart's core loop (project / workspace / chat / agent edits)
  works fully as long as at least one LLM provider is local
  (e.g. a local model via Ollama in post-MVP, or any
  CLI-spawned provider that doesn't need internet).

If the token has expired and the user is offline, the desktop
falls back to `/welcome` with a banner : _"Sign in requires an
internet connection. Connect and try again."_

---

## 4. `apps/web` — the auth surface

### 4.1 Tech stack

Angular (cohérent avec `apps/desktop`). Hosted at
`https://app.mozart.build`. Clerk Angular SDK for auth.

Minimal routes in MVP :

- `/login`
- `/dashboard`
- `/auth-callback` (Clerk's redirect)

Account / billing / settings pages are post-MVP.

### 4.2 `/login`

Layout : centered, mirrors `/welcome` on desktop.

```
                  ┌──────────────────┐
                  │  [Mozart logo]   │
                  │                  │
                  │  Start composing │
                  │                  │
                  │  [GitHub btn]    │   ← Clerk-provided
                  │  [Google btn]    │   ← Clerk-provided
                  │                  │
                  └──────────────────┘
```

Two buttons styled with Spartan, but the actual auth dance is
handled by Clerk's SDK. On success, Clerk redirects to
`/auth-callback` which routes to `/dashboard`.

### 4.3 `/dashboard`

Shows after auth.

Layout :

```
                  ┌──────────────────────────┐
                  │  [Mozart logo]           │
                  │                          │
                  │  Happy to see you again, │
                  │  Alice 👋                │
                  │                          │
                  │  [Launch Mozart desktop] │   ← primary button
                  │                          │
                  │  First time?             │
                  │  [Download Mozart]       │   ← secondary, smaller
                  │                          │
                  └──────────────────────────┘
```

**`Launch Mozart desktop` flow** — auto-fired on `/dashboard` mount,
not gated behind a manual click. The user signed in moments ago, the
desktop is almost certainly running, the handoff feels instant :

1. `/dashboard` mounts → spinner + "Connecting to Mozart…"
2. `fetch('http://127.0.0.1:<port>/auth?token=<jwt>&state=<nonce>')`
3. Outcome :
   - **Success (HTTP 200)** : ✓ icon + _"You're signed in 🎉 — switch
     back to Mozart on your computer to continue. You can close this
     tab now."_
   - **Unreachable** (network error, non-2xx, missing port) : ⚠ icon
     + _"Mozart isn't responding. Open Mozart on your computer, then
     try again."_ + a `Try again` button + a download link for users
     who don't have Mozart installed yet.

**Why HTTP loopback, not `mozart://` scheme launch :** browsers on
Linux (Chrome native, Firefox via Mozilla PPA) silently drop the
launch from a webpage click even though their own console logs
"Launched external handler". `xdg-open` works from a terminal, but
no browser path does — there is a quirk in the protocol-launcher
stack that we cannot reach from page code. A loopback `fetch` from
the same browser has none of that drama. `127.0.0.1` is "potentially
trustworthy" per the W3C Secure Contexts spec, so the HTTPS apps/web
origin is allowed to call the HTTP loopback without mixed-content
warnings. Uniform on Linux, macOS, Windows.

The `mozart://` scheme stays wired on the desktop side and is still
the path used by `xdg-open` / cold launches from email Magic Links
(post-MVP) — both transports feed the same `DeepLinkReceived` event,
so the TS adapter is transport-agnostic.

**User-Agent detect** :

- If the UA suggests mobile (iOS / Android), show a different
  layout : _"Mozart is desktop-only. Sign in from your computer
  to launch the app."_ with a download link for the desktop.
- The `Launch Mozart desktop` flow is hidden on mobile.

### 4.4 Desktop handoff transport

Primary path — **localhost HTTP callback** :

```
GET http://127.0.0.1:{port}/auth?token={jwt}&state={state}
→ 200 {"ok":true}  on success
→ 400 {"ok":false,"error":"missing token or state"} on bad query
```

- `port` — the localhost port the desktop's HTTP callback server
  bound to at boot. Random per process (OS-allocated). Passed by
  the desktop to apps/web in the inbound `/login?state=…&port=…`
  URL ; apps/web persists in `localStorage` so a new tab opened by
  a second `shell.open` from the desktop still has it.
- `token` — the JWT from §3.1.
- `state` — the one-time OAuth nonce (256-bit / 64-char hex).
  Validated on the desktop side after the synthesized
  `DeepLinkReceived` event arrives in the TS facade.
- CORS allow-list : `https://localhost:4201` (dev), `https://app.mozart.build` (prod).
- Bind address : `127.0.0.1` strictly. Remote processes on the LAN
  cannot reach the server.

Secondary path — **`mozart://` URL scheme** :

```
mozart://auth?token={jwt}&state={state}
```

- Same `token` + `state` shape as the HTTP callback.
- Used by `xdg-open` / `gio open` on Linux for terminal-driven
  testing, by the OS scheme handler on macOS / Windows for cold
  launches, and reserved for email-based Magic Links post-MVP.
- The Rust side parses the URL identically in both transports —
  the HTTP handler synthesizes a `mozart://auth?…` string and emits
  the same `DeepLinkReceived` event.

The state nonce is the authentication boundary in both transports.
A 256-bit random value the desktop generates on Sign in click and
never reveals to any other code path ; the apps/web side replays it
verbatim. A local attacker without observation of the browser URL
has no path to guess it within the 5-minute timeout.

### 4.5 Architectural placement (in `apps/web`)

`apps/web` is a small Angular app. It follows the same
foundational conventions as the desktop (Signal Forms, OnPush,
standalone components), but with a much smaller domain
footprint :

```
apps/web/src/app/
├── pages/
│   ├── login.page.ts
│   ├── dashboard.page.ts
│   └── auth-callback.page.ts
├── shell/
│   └── web-shell.ts
└── domains/
    └── auth/
        ├── feature-launch-mozart.ts
        ├── data/
        │   ├── auth.facade.ts
        │   └── clerk.adapter.ts
        └── index.ts
```

---

## 5. Desktop : Tauri-side wiring

### 5.1 Two transports, one event

The Angular `AuthFacade` subscribes to a single
`DeepLinkReceived` event stream — it does not care which OS path
delivered the URL. On the Rust side, two transports both feed that
event :

1. **`tauri-plugin-deep-link`** : the OS-registered `mozart://` URL
   scheme. Fires on `xdg-open` / `gio open` from a terminal, on the
   macOS `open` command, and on cold launches when the user clicks
   a `mozart://` link with the desktop not yet running.
2. **`http_callback`** : a tiny `axum` server bound to
   `127.0.0.1:<random>` at desktop boot. apps/web fetches the
   endpoint directly ; the handler synthesizes a `mozart://auth?…`
   URL string and emits the same event. This is the primary path for
   browser-launched sign-ins from apps/web — see §4.4 for the
   Linux-quirk rationale.

The TS adapter listens to one event and parses one URL shape. New
transports (e.g. an OS-specific IPC channel for sandboxed App Store
builds) can be added later without touching the facade.

When the URL arrives, the Angular `AuthFacade` :

1. Parses the URL : extracts `token` and `state`.
2. Validates `state` against the locally-stored OAuth state (set
   when the user clicked `Sign in` on `/welcome`).
3. Decodes the JWT and persists the session via the keyring adapter.
4. Updates the `AuthFacade.isAuthenticated` signal to `true`.
5. Triggers the navigation : `/onboarding` if the JWT claim
   `onboarding=false`, else `/`.

If the desktop is **not running** when the user clicks
_"Launch Mozart desktop"_ on apps/web, the HTTP `fetch` fails
(network error — no listener on `127.0.0.1:<port>`) and apps/web
surfaces the "Mozart isn't responding" state with a Retry button.
The user opens Mozart on their computer, clicks the same button
again, and the second attempt succeeds (the port is now bound).

### 5.2 Route guard

A `CanActivate` guard checks `AuthFacade.isAuthenticated`. If
false, redirect to `/welcome`. Applied to every route except
`/welcome`.

```ts
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const auth = inject(AuthFacade);
  if (auth.isAuthenticated()) return true;
  return router.createUrlTree(['/welcome']);
};
```

### 5.3 Architectural placement (in `apps/desktop`)

```
apps/desktop/src/app/
├── pages/
│   ├── welcome.page.ts          # /welcome
│   ├── onboarding.page.ts       # /onboarding (Phase 6, see §7)
│   └── tour.page.ts             # /tour (Phase 6, see §8)
└── domains/
    └── auth/
        ├── feature-welcome.ts
        ├── data/
        │   ├── auth.facade.ts         # caches port + session + state
        │   ├── auth.adapter.ts        # interface + token
        │   └── tauri-auth.adapter.ts  # concrete impl
        ├── util-clerk-url.ts          # builds /login URL w/ state + port
        ├── util-parse-deep-link.ts    # parses mozart://auth?…
        ├── util-decode-jwt.ts
        └── index.ts

apps/desktop/src-tauri/src/auth/
├── mod.rs                        # DeepLinkReceived event type
├── deep_link.rs                  # mozart:// scheme handler (OS-level)
├── http_callback.rs              # 127.0.0.1:<port> server (browser-level)
└── keyring_store.rs              # OS keyring-backed session storage
```

---

## 6. Token storage — Stronghold

Per `plan.md` decision : use Tauri's **Stronghold plugin**
(`tauri-plugin-stronghold`).

### 6.1 Why Stronghold over keyring

- **Cross-OS uniform API** : same code on macOS, Linux, Windows.
  Keyring forces OS-specific code paths (Keychain / Credential
  Manager / secret-service).
- **Encrypted vault** : built on the IOTA Stronghold engine,
  uses a master password derived from a hardware-bound source.
- **Stores secrets only** : tokens, API keys, anything sensitive.
  Non-sensitive user prefs go to the regular config / DB.

### 6.2 What goes into Stronghold

- The Clerk auth token (`auth.token`)
- The Anthropic / Claude Code API key if the user chose to enter
  one as fallback during onboarding (`provider.anthropic.api_key`)
- Other LLM provider API keys when post-MVP providers ship

### 6.3 Disclosure to the user

During onboarding (Phase 6, step 3 — LLM provider setup), surface
an explicit note next to the API key input :

> 🔒 **Your keys never leave this computer.** Mozart stores them
> in an encrypted vault that's unlocked only when the app is
> running. We don't sync them to our servers ; they're not in
> the local database either ; they're not in any log or crash
> report.

The exact copy can be tuned in Phase B. The intent is
transparency without scaremongering.

---

## 7. `/onboarding` route — the four steps

Triggered after the deep-link callback when `user.onboarding ===
false`. Once finished, sets `onboarding = true` (via the auth
adapter, propagated to the back-end) and navigates to `/tour`.

### 7.1 Step 1 — Welcome message

A simple intro screen :

```
  Welcome to Mozart, Alice.

  Let's set up your environment in 4 quick steps.

  We'll check that you have Git installed, help you
  connect at least one LLM provider, optionally link
  GitHub, and then give you a quick tour.

  This takes ~2 minutes.

  [Let's go →]
```

The progress indicator at the top shows `1 / 4` (or a 4-dot pill
strip). The `Let's go` button advances to step 2.

### 7.2 Step 2 — Git check (required)

```
  Step 2 / 4 : Install Git

  ✅ Git 2.42.0 detected         ← if found
  -- OR --
  ❌ Git not found              ← if missing

  Mozart uses Git to create isolated workspaces for
  each task. You'll need it installed to continue.

  [Install Git on macOS]        ← OS-specific instructions :
  ── code block ──                  - macOS : `brew install git`
  brew install git                  - Linux : `apt install git` etc.
  ── /code block ──                 - Windows : MSI installer link

  [Verify installation]          ← re-runs the check
  [Continue →]                   ← only enabled when found
```

The check is `git --version` via the Tauri shell adapter.

### 7.3 Step 3 — LLM provider setup (at least one required)

```
  Step 3 / 4 : Connect an LLM provider

  You need at least one model provider to use Mozart's
  agent. We currently support :

  ┌──────────────────────────────────────────┐
  │ ● Claude Code                  [Configure]│   ← actionable
  │   The flagship agent, recommended         │
  └──────────────────────────────────────────┘

  ┌──────────────────────────────────────────┐
  │ ○ OpenAI                       (Coming soon) │
  │   gpt-4o, gpt-4.1                            │
  └──────────────────────────────────────────┘

  ┌──────────────────────────────────────────┐
  │ ○ OpenRouter                   (Coming soon) │
  │   Multi-model gateway                        │
  └──────────────────────────────────────────┘

  ┌──────────────────────────────────────────┐
  │ ○ Local (Ollama)               (Coming soon) │
  │   Run models on your machine                 │
  └──────────────────────────────────────────┘

  🔒 Your keys never leave this computer.
     Mozart stores them in an encrypted vault.

  [Continue →]                   ← enabled once ≥ 1 is configured
```

**Click `Configure` on Claude Code** : opens a sub-step :

```
  Configure Claude Code

  Mozart will run `claude login` in an embedded terminal
  below. Follow the prompts.

  ┌─────────────────────────────────────────┐
  │ $ claude login                           │
  │ Open the following URL in your browser : │
  │ https://claude.com/login?token=xxxxx     │
  │                                          │
  │ ...                                      │
  │                                          │
  └─────────────────────────────────────────┘

  Or [Use an API key instead] ← fallback for old Claude versions

  [Cancel]   [Done (auto-detected)]
```

- Mozart spawns `claude login` in a PTY (using the same xterm.js
  infrastructure as Phase 4's terminal tab). The user sees the
  CLI prompts and interacts.
- The PTY's exit code is watched. Exit 0 → success → the step
  flips to ✅, and Continue is enabled.
- If `claude login` doesn't exist on the system (old version),
  show the fallback "Use an API key instead" option : a
  password-masked input where the user pastes their Anthropic
  API key. The key is verified by a single test API call, then
  stored in Stronghold.

### 7.4 Step 4 — GitHub connection (optional)

```
  Step 4 / 4 : Connect GitHub (optional)

  Connecting GitHub lets Mozart :
  - Create private repos for new projects
  - Push branches and open Pull Requests
  - Detect repository ownership for auto-naming

  You can skip this and connect later from Settings.

  [Connect GitHub]               ← triggers Clerk OAuth GitHub
  [Skip for now]
```

**Click `Connect GitHub`** :

- Opens a browser tab at `app.mozart.build/connect-github`.
- Clerk handles the OAuth dance.
- On success, the back-end stores the GitHub identity ; the
  desktop polls (or listens to a webhook via the auth adapter)
  and detects the connection ; the step flips to ✅.
- The user clicks `Continue` to move on.

**Click `Skip for now`** :

- Sets a flag locally that GitHub is not yet configured.
- PR-creation features in Phase 4 will prompt to connect
  GitHub just-in-time.
- Step flips to ⊘ (skipped) and Continue is enabled.

### 7.5 End of onboarding

After step 4 :

- Set `user.onboarding = true` via the auth adapter (propagated
  to the back-end).
- Navigate to `/tour`.

---

## 8. `/tour` route

### 8.1 Mechanics

Per user spec, the tour is **interactive on a real workspace,
not a slide deck**.

- The tour creates a **"Get started" project** silently during
  the transition from onboarding to tour (a Mozart-managed
  workspace cloned from a small `mozart-get-started` template
  repo, or simply a fresh blank project initialized via the
  Quick start flow).
- The tour then steps the user through 5 highlights of the UI,
  using a **highlight overlay** (background dim + punch-hole on
  the target element + a tooltip card pointing to it).
- A persistent `Skip` button (top-right) and `Next` button
  (bottom-right of each tooltip) are always visible. `Esc`
  also skips.

### 8.2 The 5 highlights

1. **Sidebar — Projects group**
   - Highlight : the `Projects` group + the auto-created
     _"Get started"_ project entry
   - Copy : _"Your projects live here. We've added a 'Get
     started' project so you can play."_

2. **Workspace row in the sidebar**
   - Highlight : the workspace row under the project
   - Copy : _"Each project gets workspaces — isolated sandboxes
     with their own branch. Mozart created one for you, ready
     to use."_

3. **Composer modes**
   - Highlight : the mode segmented control on the composer
   - Copy : _"Pick a mode before sending : **Agent** to edit
     files, **Plan** to draft before acting, **Ask** to chat
     without changes."_

4. **Right aside — Files tab**
   - Highlight : the right aside's `Files` tab
   - Copy : _"When the agent edits files, you'll see the
     changes here in real time, with diffs against the base
     branch."_

5. **Right aside — Open in IDE + Commit + PR**
   - Highlight : the header buttons above the right aside
   - Copy : _"Open the workspace in your favorite editor for
     bigger changes, then commit and ship a PR — all from
     Mozart."_

Plus a final closing card :

```
  You're all set 🎉

  Send your first prompt in the composer, or explore the
  app. You can revisit this tour anytime from Help.

  [Finish]
```

> **Composer shortcuts mention** — when post-MVP, add a 6th
> highlight on the `/` and `@` shortcuts in the composer. Marked
> as TODO in this doc.

### 8.3 Highlight overlay primitive

A new dumb component in `libs/ui/highlight-overlay/` :

- Renders a full-screen `<div>` with a CSS background dim
  (`rgba(0,0,0,0.5)` adjusted).
- A "punch hole" cutout over the target element, achieved via
  `clip-path` or an SVG mask.
- A tooltip card positioned next to the target (left / right /
  top / bottom depending on space).
- Skip / Next buttons inside the tooltip.

Public surface :

```ts
type HighlightStep = {
  targetSelector: string;    // CSS selector or ElementRef
  title: string;
  description: string;
  position?: 'top' | 'right' | 'bottom' | 'left' | 'auto';
};

// Inputs
steps:         InputSignal<HighlightStep[]>;
currentIndex:  InputSignal<number>;
// Outputs
(next:         void)
(skip:         void)
(finish:       void)
```

Phase B confirms if a CDK-based primitive exists (`@angular/cdk/overlay`
has the positioning primitives we need ; the overlay rendering
is custom).

### 8.4 The "Get started" project

A pre-rendered template that lives in the desktop app's
resources. On tour initialization :

1. Create a project named `Get started` in
   `~/Mozart/get-started/`.
2. Populate it with :
   - `README.md` — explains Mozart's loop in 1 page, with a few
     prompts to try (_"Try : 'add a Hello World function to
     hello.js'"_).
   - `hello.js` — a tiny starter file the user can ask the
     agent to modify.
3. Run `git init` + initial commit + auto-create a workspace
   `welcome-1`.
4. Navigate the user to that workspace ; the tour starts
   immediately.

After the tour, the user can keep the "Get started" project or
delete it from the sidebar context menu.

### 8.5 Architectural placement

```
apps/desktop/src/app/
├── pages/
│   └── tour.page.ts
└── domains/
    └── onboarding/
        ├── feature-onboarding-step-welcome.ts
        ├── feature-onboarding-step-git.ts
        ├── feature-onboarding-step-provider.ts
        ├── feature-onboarding-step-github.ts
        ├── feature-tour.ts
        ├── data/
        │   ├── onboarding.facade.ts
        │   ├── git-check.adapter.ts
        │   ├── provider-setup.adapter.ts
        │   └── get-started-project.adapter.ts
        └── index.ts

libs/ui/
└── highlight-overlay/
    └── highlight-overlay.component.ts
```

---

## 9. Settings entry points

After onboarding, the user can revisit / modify these at any
time via Settings :

- **Git installation status** — read-only display
- **LLM providers** — list of configured providers, add /
  remove, switch default
- **GitHub connection** — connect / disconnect
- **Revisit tour** — link to `/tour` (creates a new "Get
  started" project if missing)
- **Sign out** — clears the token, navigates to `/welcome`

The Settings page itself is part of `plan.md`'s Phase 6 polish.
Detailed spec in a future companion doc if needed ; for v0.0.1
MVP a single-page settings view with these sections is enough.

---

## 10. Anti-regression checks

1. **`/welcome` is the only unguarded route** : `grep -n
"authGuard" apps/desktop/src/app` shows every route except
   `/welcome` listing it in `canActivate`.
2. **Token in OS keyring, never in localStorage / sessionStorage
   / IndexedDB / SQLite** (on the desktop side) :
   `grep -rn "localStorage\|sessionStorage\|indexedDB"
apps/desktop/src/app/domains/auth` returns zero matches. The
   apps/web side persists the mock-Clerk user + state + port in
   localStorage as a deliberate cross-tab share — see §3 + §4.
3. **API keys via the same OS keyring backend** : same grep
   extended to the provider-setup adapter.
4. **State nonce validated on every callback** : both transports
   (`mozart://` scheme and HTTP `127.0.0.1:<port>/auth`) route
   through the same `DeepLinkReceived` event ; the TS facade
   verifies the `state` query param against the pending nonce.
   Test against an injection scenario from each transport.
5. **HTTP callback server binds 127.0.0.1 only** : `grep -n
"0.0.0.0" apps/desktop/src-tauri/src/auth` returns zero matches.
   CORS allow-list locked to apps/web origins.
6. **No PII in logs** : tokens, API keys, emails, GitHub
   usernames are never logged. The HTTP callback logs only a
   confirmation that a valid request arrived — never the token or
   state itself. Add a static-analysis pass or a review checklist
   item.
7. **Signal Forms in onboarding forms** : provider config,
   GitHub connection inputs use Signal Forms.

---

## 11. Open questions for Phase B

1. **Token refresh strategy** : silent refresh 24 h before
   expiry, or refresh on every API call ? Recommend silent
   refresh + on-demand fallback.
2. **`state` storage during the deep-link round-trip** : in
   memory (lost if app restarts mid-flow), in Stronghold, or in
   a temp file ? Recommend Stronghold for security ; lost on
   restart is acceptable (the user re-clicks `Sign in`).
3. **Multi-account support** in v0.0.1 — sign in with multiple
   accounts and switch ? Recommend single account in MVP ;
   multi-account is post-MVP.
4. **Provider `claude login` PTY UI** : embedded xterm.js or a
   simpler `<pre>` block streaming the stdout ? Recommend
   xterm.js for parity with the workspace terminal (Phase 4).
5. **GitHub OAuth via Clerk vs direct GitHub OAuth** : Clerk
   handles it more cleanly. Confirm with Clerk capability that
   it can fan-out the GitHub identity to the back-end so the
   token's `github_username` claim is populated.
6. **"Get started" project location** : `~/Mozart/get-started/`
   vs `~/.mozart/get-started/` ? Recommend visible
   (`~/Mozart/`) so the user can find and modify it like any
   project.
7. **What to do if the user deletes the "Get started" project
   then triggers `/tour` again from Settings ?** Recommend :
   recreate it silently and resume the tour.
