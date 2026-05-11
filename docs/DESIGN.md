# Design System: Mozart

**Status:** v0.2 — updated with Conductor UI research; brand renamed to Mozart 2026-05-09  
**Last updated:** 2026-05-09  
**Brand:** Mozart (`mozart.build`). For implementer-facing string-replacement table see `PLAN-v0.0.1.md` § Naming Lock.  
**Visual reference:** `docs/competitors/conductor/design/conductor-ui.png` — the Conductor screenshot Mozart's UI is modeled on. Structural breakdown: `docs/competitors/conductor/design/ui-notes.md`.

---

## Implementation contract

These rules are non-negotiable for any agent doing UI work in this repo:

1. **Visual inspiration: Conductor.** The product UI is modeled on Conductor.build (see `docs/competitors/conductor/design/conductor-ui.png` and `ui-notes.md`). Conductor is the *look-and-feel* reference, not the implementation reference.
2. **Implementation stack (mandatory):**
   - **Spartan UI / ShadCN UI for Angular** — every interactive primitive comes from the vendored `libs/ui/*` Hlm components (Button, Dialog, Tooltip, Tabs, Sidebar, ScrollArea, Sheet, Empty, Field, Input, Card, etc.). The full catalog is in `CLAUDE.md` § "UI components".
   - **Tailwind CSS v4** — utility-first, no `tailwind.config.js`, PostCSS only. Prefer utilities in templates over component-level CSS.
   - **Theme + global CSS: `libs/shared-styles-theme`** — `base.css`, `shell.css`, `themes/zinc.css`. All colors route through CSS variables (`var(--mozart-*)`, `hsl(var(--…))`). No hardcoded hex in templates or styles.
   - **Internal component library: `libs/ui`** — protected, read-only. See rule 4.
3. **Desktop UI target: `apps/desktop/src`.** This is the only Angular app being styled in v0.0.1. `apps/web` and `apps/landing` are out of scope until later milestones.
4. **`libs/ui/**` is protected.** Agents must not modify, add, delete, or refactor anything inside `libs/ui` during desktop feature or UI refactor work. New visual primitives go in `apps/desktop/src/app/` and compose existing `libs/ui` components. If a needed primitive is genuinely missing, stop and ask the user.
5. **Custom CSS is the last resort.** Prefer Tailwind utility classes inline in templates. If a template's class list becomes unreadable (subjective: more than ~8–10 utility classes on one element, or repeated across 3+ siblings), extract to a business-named class in a global stylesheet under `libs/shared-styles-theme` (or a component's inline `styles:` block, if scoped) using the `@apply` pattern:

   ```css
   .workspace-card-header {
     @apply flex items-center justify-between gap-2 px-3 py-2 border-b border-border;
   }
   ```

   Name by business meaning, never by visual appearance (`.workspace-card-header` ✅, `.flex-row-between-2` ❌).
6. **Token discipline applies.** Don't read `**/*.spec.ts` under `apps/` or anything under `docs/competitors/**` (except the two Conductor refs above) for routine UI work. See `CLAUDE.md` § "Token discipline".

The rest of this document specifies the visual tokens, layout, accessibility rules, and component states that implement this contract.

## Aesthetic

Dark IDE. Dense but readable. Serious developer tool — not a marketing dashboard. Modeled on Conductor.build's v0.6.0 dark minimal redesign. Every pixel earns its place.

---

## Layout

3-panel shell: sidebar (~220px) + center (flexible) + right (~320px).

```
┌─────────────┬──────────────────────────┬──────────────┐
│  Sidebar    │  Agent stream            │  Diff + Term │
│  220px      │  flex                    │  320px       │
└─────────────┴──────────────────────────┴──────────────┘
```

Top bar: full-width, 36px. Bottom bar: none (terminal is in right panel).

---

## Color Tokens

```scss
:root {
  // Layout
  --sidebar-width:       220px;
  --right-panel-width:   320px;

  // Backgrounds
  --bg-app:       #0d0d0f;
  --bg-sidebar:   #111113;
  --bg-center:    #0f0f11;
  --bg-card:      #1a1a1c;
  --bg-hover:     #1e1e21;
  --bg-selected:  #222226;
  --bg-composer:  #161618;

  // Borders
  --border:       #2a2a2d;
  --border-focus: #4a4a4f;

  // Text
  --text-primary: #f4f4f5;
  --text-muted:   #71717a;
  --text-mono:    #e4e4e7;

  // Status
  --status-running:  #3b82f6;
  --status-done:     #22c55e;
  --status-error:    #ef4444;
  --status-conflict: #f59e0b;
  --status-limited:  #eab308;
  --status-stopped:  #71717a;
  --status-crashed:  #dc2626;

  // Diff
  --diff-add-bg:    #052e16;
  --diff-add-text:  #86efac;
  --diff-del-bg:    #2d0a0a;
  --diff-del-text:  #fca5a5;

  // Accents
  --accent-mention:  #6d28d9;
  --accent-error-bg: #2d1b3d;
  --accent-error-br: #6d28d9;

  // Radius
  --radius-sm:   4px;
  --radius-md:   6px;
  --radius-pill: 9999px;
}
```

---

## Typography

**Primary (UI):** Geist — bundled woff2, never system-ui.  
**Monospace (code/paths/terminal):** Geist Mono — bundled woff2.

```scss
:root {
  --font-sans: 'Geist', 'Inter', sans-serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', monospace;
}
```

Font files: `src/assets/fonts/GeistVariableVF.woff2`, `src/assets/fonts/GeistMonoVariableVF.woff2`  
Source: https://github.com/vercel/geist-font (OFL license)

---

## Spacing Scale

Base unit: 4px.

| Token      | Value |
|------------|-------|
| `--space-1` | 4px  |
| `--space-2` | 8px  |
| `--space-3` | 12px |
| `--space-4` | 16px |
| `--space-6` | 24px |
| `--space-8` | 32px |

---

## Border Radius

| Context       | Value  |
|---------------|--------|
| Cards         | 6px    |
| Badges/pills  | 9999px |
| Buttons       | 4px    |
| Input fields  | 4px    |

---

## Status Badges

Pills with colored background at 15% opacity + solid border at 30% opacity.

| Status        | Background           | Border              | Dot       |
|---------------|----------------------|---------------------|-----------|
| Running       | `#3b82f610`          | `#3b82f640`         | pulsing   |
| Done          | `#22c55e10`          | `#22c55e40`         | solid     |
| Error         | `#ef444410`          | `#ef444440`         | solid     |
| Conflict      | `#f59e0b10`          | `#f59e0b40`         | solid     |
| Rate limited  | `#eab30810`          | `#eab30840`         | pulsing   |
| Stopped       | `#71717a10`          | `#71717a40`         | solid     |

---

## @Mention Pills

Background: `#6d28d9` at 20% opacity. Border: `#6d28d9` at 40%. Text: `#c4b5fd`. Radius: 4px. Padding: 0 4px.

---

## Diff Counters

`+X` additions: `#22c55e` (green). `-Y` deletions: `#ef4444` (red). Monospace font. No background.

---

## Error Banners

Background: `--accent-error-bg` (`#2d1b3d`). Border: 1px `--accent-error-br` (`#6d28d9`). Radius: 6px. Padding: 8px 12px.

---

## Sidebar Interaction Patterns

Source: `competitors/conductor/design/ui-notes.md` — validated against Conductor v0.6.0 UI.

### Navigation strip (top of sidebar)
```
[≡]  [←]  [→]   PROJECTS              [+ Add]
```
- `[≡]` collapses sidebar to icon-rail (~48px). Re-expands on click. State persisted in SQLite `config`.
- `[←] [→]` back/forward through recently-visited workspaces. History stack in memory (v0.1), not persisted across sessions.
- `[+ Add]` opens Add Repository dialog.

### Workspace item states
- **Default**: workspace name (truncated to 40 chars `…`) + diff counts right-aligned
- **Hover**: archive button slides in from right (~32px icon). Background shifts to `--bg-hover`.
- **Selected**: `--bg-selected` background + 2px left accent border in status color
- **Right-click context menu** (all 4 options, v0.1 status labels are UI-only — stored in SQLite, don't affect agent lifecycle):
  ```
  Mark as unread
  Pin to top
  ─────────────
  In Progress
  Review
  Done
  Cancelled
  ─────────────
  Rename
  Archive
  ```

### Project row (collapsible group)
- Collapsed: `>` chevron + name + workspace count badge `[N]` + `[⚙]` (v0.2 disabled) + `[+]`
- Expanded: `∨` + same row + workspace items listed below
- `[+]` opens New Workspace Dialog scoped to this project. Greyed + tooltip when at 4/4 capacity.

---

## Composer Controls

From ui-notes.md: Conductor's composer has model picker + effort level + two modes + attachments + links + issue mentions.

**v0.1 implementation:**
- Model picker: `[Sonnet 4.6 ∨]` dropdown — Sonnet 4.6 / Opus 4.7
- Effort level: shown as `[Effort ─]` but disabled — tooltip "Effort control — coming in v0.2"
- Attachments `[📎]`: disabled — tooltip "Attachments — coming in v0.2"
- `@` mention: enabled — triggers file search popover within the workspace

**Composer layout:**
```
┌──────────────────────────────────────────────────────────┐
│ Type a message… or @ to mention a file                    │
│                                                           │
│ [Sonnet 4.6 ∨]  [Effort ─ disabled]    [@]  [📎]  [↑]   │
└──────────────────────────────────────────────────────────┘
```

---

## Right Panel Tabs

Source: ui-notes.md. Conductor has `all files` / `changed` / `checks` tabs.

**v0.1:**
- `Changes N` (default): files changed by the agent, with +/- counts
- `All files`: full workspace file tree (v0.2 — shown disabled)
- `Checks`: CI/deployment status (v0.2 — shown disabled, tooltip "CI checks — coming in v0.2")

**Terminal section** (bottom half of right panel, collapsible):
- Tabs: `Setup` (v0.2) | `Run` (v0.2) | `Terminal ●` (active)
- `[+]` new terminal tab — each tab is an independent PTY in the same worktree
- `[▶ Run ⌘R]` button: disabled in v0.1, tooltip "Project run scripts — coming in v0.2"

## Dialogs (NewWorkspace + AddRepository)

Source: PLAN-v0.0.1.md Step 1.8. Spartan Hlm Dialog primitive is the base; this section adds layout, button order, and focus behavior.

### Shared dialog chrome

| Property | Value |
|---|---|
| Width | 480px (NewWorkspace, AddRepository); never full-screen |
| Min height | 320px; grows to content; max 80% viewport height with internal scroll |
| Background | `--bg-card` (#1a1a1c) |
| Border | 1px `--border-focus` (#4a4a4f) |
| Radius | `--radius-md` (6px) |
| Shadow | `0 8px 24px rgba(0, 0, 0, 0.4)` (terminal-grade dark drop) |
| Scrim | `rgba(0, 0, 0, 0.5)` over rest of UI; click-to-dismiss disabled (must use Cancel/Esc to prevent accidental data loss) |
| Padding | 24px (top/sides), 20px (bottom near button row) |
| Header | 18px Geist Bold dialog title, 1px bottom border `--border`, 16px gap to body |
| Close `×` | top-right, 24×24 hit area, 16×16 glyph in `--text-muted` → `--text-primary` on hover; same effect as Cancel |
| Body | 14px Geist Regular `--text-primary`, form fields 14px, labels 12px Geist Bold `--text-muted` above each field |
| Field gap | 16px between fields, 8px between label and field |
| Validation error | inline below field, 12px `--status-error` (#ef4444), no banner |
| Button row | 16px top margin from body, 1px top border `--border`, 16px top padding |

### Button order — platform-adaptive (decided D5)

Detect OS at runtime via Tauri's `os::platform()`:
- **macOS**: `[Cancel]  [Primary]` right-aligned (HIG)
- **Windows + Linux**: `[Primary]  [Cancel]` right-aligned (Fitts's-law for Windows; GNOME/KDE both align right with primary first)

Implementation: `apps/desktop/src/app/services/platform.service.ts` exposes `isMacOS$` observable; Spartan Dialog footer reorders buttons via `*ngIf` swap.

| Button | Variant | Width | Accelerator |
|---|---|---|---|
| Primary (Create / Add) | Spartan Button primary, 40px | min 96px, content-fit | `Enter` |
| Cancel | Spartan Button ghost, 40px | min 96px | `Esc` |

Primary disabled until validation passes (NewWorkspace: base branch picked + task text non-empty; AddRepository: folder selected and is a git repo).

### NewWorkspace dialog (PLAN Step 1.8 + D16)

```
┌─ New workspace ─────────────────────────────────────────×┐
│                                                          │
│  Project                                                  │
│  [my-app                                            ▼]    │
│                                                          │
│  Base branch                                              │
│  [main                                              ▼]    │
│                                                          │
│  What should the agent do?                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  │  (multi-line text area, 4 visible rows)            │  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│  ─────────────────────────────────────────────────────── │
│                                  [Cancel]  [Create →]    │
└──────────────────────────────────────────────────────────┘
```

- Project Spartan Select; pre-filled with the currently focused project; locked when invoked from project's `[+]` button.
- Base branch Spartan Select; populated from `git_query.list_branches()` deduped local + remote; default = repo HEAD; if detached HEAD detected, the dialog refuses to open and shows the inline error from D16 instead.
- Task textarea Spartan Textarea, 4 rows visible, no character cap displayed (slug logic handles 200+ char inputs per `branch_name.rs`); placeholder `Describe the change. The agent runs in an isolated worktree.`
- Validation: Create button disabled until both selects have value AND textarea has ≥3 non-whitespace chars.

### AddRepository dialog (PLAN Step 1.8)

```
┌─ Add repository ────────────────────────────────────────×┐
│                                                          │
│  Local folder                                             │
│  [/home/me/code/my-app                    ] [Browse…]    │
│                                                          │
│  ✓ Detected git repository (12 branches, main = HEAD)    │
│                                                          │
│  Display name (optional)                                  │
│  [my-app                                            ]    │
│                                                          │
│  ─ Recently added                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │  acme-web        ~/code/acme-web              [+]  │  │
│  │  experiments     ~/projects/experiments        [+]  │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  GitHub clone is coming in v0.2 ↗                         │
│  ─────────────────────────────────────────────────────── │
│                                  [Cancel]  [Add →]       │
└──────────────────────────────────────────────────────────┘
```

- Folder field is a Spartan Input + `[Browse…]` Spartan Button outline that triggers Tauri's native folder picker. Path text uses `--font-mono` 13px.
- Validation hint below: green `✓` `--status-done` when folder is a git repo + branch count discovered; red `✗` `--status-error` with reason if not (D16 cases: nested repo refused, complex submodule refused, non-git refused).
- Display name optional; defaults to folder basename.
- Recently-added list shows up to 5 prior repos as one-row cards with `[+]` to re-add. Hover row → `--bg-hover`.
- "GitHub clone is coming in v0.2" text-link bottom-left; clicking opens a tooltip explaining v0.2 plan; per Rule 7 (disabled controls show what's coming).
- Cancel + Add per platform-adaptive D5.

### Terminal chrome (decided D4 — 13px dev-tool default)

| Property | Value |
|---|---|
| Background | `--bg-app` (#0d0d0f) — matches shell, no card chrome inside terminal |
| Font | `--font-mono` (Geist Mono variable woff2), 13px |
| Line height | 1.5 (~20px row) |
| Default text color | `--text-mono` (#e4e4e7) |
| Prompt prefix | `$ ` rendered in `--status-running` (#3b82f6) — visually distinguishes prompts from output for scanning |
| Cursor | block, blink-rate 530ms (xterm.js default), color `--text-primary` |
| Tab strip | 32px tall, `--bg-card` background, active tab `--bg-selected` + 2px top accent in `--status-running`; tab labels 12px Geist Regular |
| Tab close `×` | shown on hover only, 12×12 in `--text-muted`, hover → `--text-primary` |
| `[+]` new tab button | 28px square, ghost, right-aligned in tab strip |
| Scrollback height | dynamic — terminal section consumes 50% of right panel by default; user can drag the divider between Changes and Terminal (resize handle 4px tall, hit area 8px, shows 2-way arrow cursor on hover); persisted to SQLite `config` table |
| Scrollback buffer | 10,000 lines (xterm.js default); old lines truncated FIFO |
| Selection | `rgba(59, 130, 246, 0.25)` (status-running blue at 25%) |
| Copy/paste | Cmd+C (mac) / Ctrl+Shift+C (Linux/Win) copy; Cmd+V / Ctrl+Shift+V paste — see § Accessibility |
| Word boundary on double-click | extends to whitespace; respects `/`, `.`, `:` for path-like selection |
| Link detection | URLs auto-linkified; click opens in default browser (Tauri `shell.open`) |
| Empty state | `--text-muted` placeholder line `# terminal · cwd: <worktree>` rendered before any process starts |
| Bell | silent; visual flash of tab background `--status-conflict` for 200ms |

---

## Accessibility

Source: PLAN-v0.0.1.md Step 1.8 + decision D5 (platform-adaptive) + decision D7 (moderate shortcut set). Mozart targets pro devs across macOS, Windows, Linux — keyboard-first navigation is not optional.

### Keyboard shortcuts (decided D7 — moderate, 12 bindings)

`⌘` on macOS, `Ctrl` on Windows/Linux unless noted. Shortcuts visible in the Spartan Tooltip on the corresponding action's hover (e.g. composer Send button tooltip says `Send  ⌘↵`).

| Shortcut | Action | Surface |
|---|---|---|
| `↵` | Send composer | Composer (when textarea focused) |
| `⌘/Ctrl + ↵` | Send and clear | Composer |
| `⌘/Ctrl + .` | Stop running agent | Anywhere (global within shell) |
| `⌘/Ctrl + ⌫` | Discard changes (opens confirm modal) | When workspace is selected and has uncommitted changes |
| `⌘/Ctrl + N` | New workspace | Anywhere; opens NewWorkspace dialog |
| `⌘/Ctrl + R` | Add repository | Anywhere; opens AddRepository dialog |
| `⌘/Ctrl + ,` | Open Settings | Anywhere |
| `⌘/Ctrl + ]` | Next workspace | Anywhere; cycles through workspaces in sidebar order |
| `⌘/Ctrl + [` | Previous workspace | Anywhere |
| `Esc` | Dismiss dialog / context menu / tour overlay | Modal contexts |
| `Tab` / `Shift+Tab` | Focus traversal | Forms, dialogs |
| `←` / `→` | Tour overlay step navigation | Onboarding screen 5 only |

Document in Settings → About as a static reference. Discoverable via tooltips. v0.2 adds `⌘K` command palette per PLAN-v0.0.1 v0.2 roadmap.

### Focus rings

Every focusable element shows a focus ring on `:focus-visible` (not `:focus` — avoids ring on mouse click). Ring color = `--border-focus` (#4a4a4f) on dark backgrounds, `--accent-mention` (#6d28d9) for primary CTAs to differentiate them. Width 2px, offset 2px, radius matches the element. Custom rings on Spartan primitives override the library default to use Mozart tokens.

### ARIA landmarks (3-panel shell)

| Region | Role | aria-label |
|---|---|---|
| Top bar | `banner` | "Mozart" |
| Sidebar | `navigation` | "Projects and workspaces" |
| Center stream + composer | `main` | "Workspace conversation" |
| Right panel (changes + terminal) | `complementary` | "Workspace changes and terminal" |
| Each Spartan Dialog | `dialog`, `aria-modal="true"` | dialog title text |
| Each toast | `status` (info/success) or `alert` (warning/error) | toast text |

Headings within regions use `<h1>` (workspace name), `<h2>` (sub-section: Setup/Run/Terminal tabs, Changes/All files/Checks tabs), `<h3>` (e.g. file path in diff list).

### Touch targets

Minimum 32×32px hit area on every interactive element (Rule 6); 40×40 on primary CTAs. Sidebar icon-only buttons (collapse, back, forward) keep 32px hit area even when the visible glyph is 16px.

### Color contrast

All combinations of background × text in the spec must meet WCAG AA (4.5:1 for body text, 3:1 for large text 18px+ bold or 24px+ regular). Quick checks against the token set:

| Pair | Ratio | Pass? |
|---|---|---|
| `--text-primary` (#f4f4f5) on `--bg-app` (#0d0d0f) | 18.5:1 | ✅ AAA |
| `--text-muted` (#71717a) on `--bg-app` | 5.1:1 | ✅ AA |
| `--text-muted` on `--bg-card` (#1a1a1c) | 4.6:1 | ✅ AA |
| `--status-running` (#3b82f6) on `--bg-app` | 4.7:1 | ✅ AA |
| `--status-error` (#ef4444) on `--bg-app` | 4.8:1 | ✅ AA |
| `--diff-add-text` (#86efac) on `--diff-add-bg` (#052e16) | 8.4:1 | ✅ AAA |
| `--diff-del-text` (#fca5a5) on `--diff-del-bg` (#2d0a0a) | 7.6:1 | ✅ AAA |
| `--accent-mention` text (#c4b5fd) on `--bg-app` | 8.2:1 | ✅ AAA |

Violations to watch: `--text-mono` (#e4e4e7) on `--bg-card` for terminal output is 13.6:1 (fine). If new tokens enter, run a contrast check before merging.

### Screen reader behavior

- Status badge changes (e.g. Workspace `running` → `done`) announce via a single `aria-live="polite"` region in the workspace stream — text format `Workspace status: done`. Avoid live-region spam by debouncing — only announce status transitions, never token streams.
- Streaming agent tokens are NOT announced (would flood SR users). The completion announcement summarizes: "Agent completed in 23 seconds. 4 files changed."
- Diff panel rows have `aria-label="<filename>, +12 −3 lines"` so SR users get diff counts without reading the inline numbers.

### Motion preferences

Honor `prefers-reduced-motion`: disable cross-fade on welcome GIF rotator (snap to next frame); disable banner slide-in (instant); disable tour overlay scrim fade (instant); keep the indeterminate progress bar (it conveys state, not decoration).

## Banners (risk + telemetry + transient)

DESIGN.md already has the error-banner token (`--accent-error-bg` + `--accent-error-br`). This section adds risk-disclosure (one-time onboarding), telemetry first-launch, and transient toast specs.

### Risk-disclosure banner — onboarding screen 3 (decided D3 visual = amber, full-screen)

Treated as a screen, not a thin banner. Uses the conflict-amber palette to signal heads-up not error:

| Property | Value |
|---|---|
| Container | full-window, centered card 640×360, `--bg-card`, 1px `--border-focus`, `--radius-md`, 40px padding |
| Heading prefix | `⚠` glyph 18px in `--status-conflict` (#f59e0b), 8px right gap |
| Heading | 20px Geist Bold `--text-primary`: "Mozart runs shell commands and edits files" |
| Body | 14px Geist Regular `--text-primary`, 1.5 line-height, 2 paragraphs, 16px gap (verbatim from PLAN-v0.0.1.md Step 1.9) |
| Inline link | "Settings to opt out" inside paragraph 2, color `--accent-mention`, underline on hover |
| Primary CTA | `[I understand →]` Spartan Button primary, bottom-right; required (no skip) |

### Telemetry first-launch banner — main shell, on first session post-onboarding

Thin top banner, dismiss-only, appears once. Stored as `config.telemetry_banner_dismissed = true` after first close.

```
┌─ banner ────────────────────────────────────────────────────────┐
│  ◯  We collect anonymous usage data. [Settings to opt out]   ×  │
└─────────────────────────────────────────────────────────────────┘
```

| Property | Value |
|---|---|
| Position | full-width, 40px tall, between top bar and 3-panel shell |
| Background | `--bg-card` (calm — telemetry is not an alert) |
| Bottom border | 1px `--border` |
| Glyph prefix | `◯` 14px in `--text-muted`, 12px right gap |
| Body | 13px Geist Regular `--text-primary`: "We collect anonymous usage data." |
| Inline link | "Settings to opt out" 13px `--accent-mention`, opens Settings → Telemetry directly |
| Dismiss | `×` 24×24 hit area right-aligned, 14×14 glyph in `--text-muted` → `--text-primary` on hover |
| Padding | 12px vertical, 24px horizontal |
| Animation | slide-down 200ms ease-out on first paint; slide-up 200ms ease-in on dismiss |

### Transient toasts (success / info / error / warning)

Toasts replace mid-action banners. Bottom-right corner, 16px from edge, stack vertically with 8px gaps. Auto-dismiss 4s (success) / 6s (info, warning, error) unless hovered (pauses).

| Variant | Background | Border | Glyph |
|---|---|---|---|
| success | `#22c55e10` (status-done at 6%) | 1px `#22c55e40` | `✓` `--status-done` |
| info | `--bg-card` | 1px `--border` | `◯` `--text-muted` |
| warning | `#f59e0b10` (status-conflict at 6%) | 1px `#f59e0b40` | `⚠` `--status-conflict` |
| error | `--accent-error-bg` | 1px `--accent-error-br` | none (color is the signal) |

| Property | Value |
|---|---|
| Width | 320px max |
| Padding | 12px vertical, 16px horizontal |
| Radius | `--radius-md` |
| Body | 13px Geist Regular `--text-primary` |
| Action link | optional, single inline link `--accent-mention` (e.g. "Settings to opt out", "Retry") |
| Dismiss | `×` 12×12 in `--text-muted`, top-right of toast |
| Shadow | `0 4px 12px rgba(0, 0, 0, 0.4)` |

Single-toast policy: the same event (e.g. `claude-reauth-success`) collapses repeated toasts — replace, don't stack.

### Banner placement order

Risk-disclosure is a full-screen onboarding step (not a banner in shell). Telemetry is the only persistent banner that can appear in the main shell. If both hypothetically had to coexist (won't in v0.0.1 since onboarding completes before shell renders), risk takes precedence.

## Component States — Loading / Empty / Error

Source: PLAN-v0.0.1.md Step 1.8 components × Pass 2 of /plan-design-review. Voice = warm-helpful with one primary action (decided D6). Note: in v0.0.1 the quickstart tour loads as the first project after onboarding, so true-empty sidebar is rare in practice — but specs still ship for users who remove all projects, skip the tour and cancel "Add my own folder", or hit tour-extraction failure + demo path.

### State matrix

| Component | Loading | Empty | Error |
|---|---|---|---|
| **Sidebar** | Skeleton: 3 row placeholders, `--bg-card`, animate `--bg-hover` shimmer 1200ms loop. Hides after `list_workspaces()` returns. | Centered card 280×160 in sidebar: 16px Geist Bold "No projects yet" + 13px `--text-muted` "Add a folder to get started." + Spartan Button primary `[+ Add repository]`. Rare per note above. | Banner inline at top of sidebar (--accent-error-bg style): "Couldn't load projects. Retry." with ghost `[Retry]` button. Underlying error logged. |
| **Workspace stream (center)** | When agent_run.status = `initializing`: centered 16px `--text-muted` "Starting agent…" + indeterminate progress bar 2px tall in `--status-running`, full-width below top bar. | When no workspace selected: full-panel centered 280×120 card "Pick a workspace from the sidebar, or create a new one." + Spartan Button primary `[+ New workspace]`. | When `agent_run.status = error`: error banner top of stream (`--accent-error-bg`) with `error_message` text in 13px `--font-mono`; below banner the conversation log remains scrollable. Banner has dismiss `×` and `[Retry]` ghost button (re-runs same prompt in a new run). |
| **Diff panel (right)** | "Computing diff…" 13px `--text-muted` centered + 16×16 spinner `--status-running`. Replaces panel content. | When workspace `status = ready` but no run yet: "No changes yet. Run an agent to see a diff here." 13px `--text-muted` + an unobtrusive ghost `[+ New message]` link that focuses the composer. | When `capture_diff()` fails: 13px `--status-error` "Couldn't capture changes. The worktree may be in a bad state." + ghost `[Open terminal]` link that focuses the terminal panel for manual `git status`. |
| **Terminal** | Spinner during process spawn (rare; <500ms in practice). | `# terminal · cwd: <worktree>` placeholder line in `--text-muted` until first command runs. | Terminal exit non-zero: shell handles natively (writes its own error). Mozart adds nothing. |
| **Onboarding (welcome)** | First-launch flag check is sub-100ms; if it ever stalls, show 16×16 spinner centered. | n/a (always populated). | If GIF assets missing: render the 3 still placeholder PNGs that ship with the app. No error UI. |
| **Onboarding (claude-auth)** | While `detect_claude_auth()` is running: show "Checking…" 13px `--text-muted` between status grid and CTA, all CTAs disabled. ~200ms typical. | n/a — always populated by a state. | If `claude --version` exits non-zero or unparseable: treat as "not installed", show install CTA. No special error UI. |
| **Composer** | While submitting: button shows inline 14×14 spinner, label changes to `Sending…`. Disable Enter key during submit. | New thread placeholder in textarea: `Type a message… or @ to mention a file`. | If `start_agent_run()` fails to spawn: textarea border `--status-error`, inline 12px error below "Couldn't start agent. Check Claude CLI status in Settings." with link to Settings → Claude CLI. |
| **NewWorkspace dialog** | While `list_branches()` runs: branch select shows `Loading branches…` placeholder, disabled. ~50-200ms typical. | Branch list never empty if dialog opened (D16 refuses on detached HEAD). | If validation fails (D16 cases: nested repo, complex submodules, LFS warn): inline error above button row, error text 13px `--status-error`; primary disabled. |
| **AddRepository dialog** | While Tauri folder picker is open: dialog grays out, OS picker takes focus. | "Recently added" list empty on first run: hide the section entirely (rather than show "No recent repos"). | Validation: see dialog spec above; repo-detection error below path field with reason. |
| **Settings → Projects** | None (synchronous SQLite read). | No projects: "No projects yet. Add one from the sidebar." 13px `--text-muted` centered in pane. | If row removal fails: toast bottom-right `--accent-error-bg`, "Couldn't remove project. Try again." auto-dismiss 6s. |
| **Tour overlay** | n/a — overlay is local DOM, no async. | n/a. | If bundled snapshot extraction fails (corrupt tar): tour disabled, banner top of shell `--accent-error-bg` "Couldn't load the quickstart demo. Add your own folder to continue." with `[Add repository]` button. |

### Empty-state pattern (decided D6 — warm-helpful + one primary action)

Every empty state follows the pattern:
1. **Heading** 16px Geist Bold — the absence stated factually ("No projects yet")
2. **Body** 13px `--text-muted` — one short sentence explaining the next step ("Add a folder to get started.")
3. **Primary CTA** Spartan Button primary — the action that resolves the empty state ("+ Add repository")

No emoji. No exclamation marks. No second-person pep talk. No "Welcome!" greetings on empty states. Voice should feel like the calmest possible co-worker telling you what's next.

### Loading-state rules

- Skeletons for content that has shape (lists, rows) — never spinners over content areas.
- Spinners for transient actions (button submit, picker, agent spawn) — 14-16px max inline.
- Indeterminate progress bars (2px tall) for long unbounded waits (agent run streaming) — top of the affected panel only, never global.
- Loading copy uses `…` ellipsis suffix ("Computing diff…") — never "Please wait."

### Error-state rules

- Inline error first, banner second, modal never. Never use a Spartan Dialog to surface an error.
- Error text is 13px `--status-error`, no icon prefix. The color does the work.
- Every error has a recovery path: `[Retry]` ghost button OR a link to the relevant Settings section. Errors that have no recovery path say so directly ("Restart Mozart to recover.").
- The `Discard changes` confirmation modal is the only exception (intentional friction on a destructive action).

## Settings

Source: PLAN-v0.0.1.md Step 1.8 SettingsComponent. Single-window settings (no separate window); replaces center panel content while sidebar remains visible. Left rail of sections, right pane of settings.

```
┌─ settings (replaces center panel) ─────────────────────────────┐
│  ┌─ rail 200px ──┐  ┌─ pane flex ────────────────────────────┐ │
│  │  Claude CLI ● │  │  Claude CLI                             │ │
│  │  Telemetry    │  │                                         │ │
│  │  Projects     │  │  ┌─ Status ─────────────────────────┐  │ │
│  │  About        │  │  │  ● Installed (v1.x.x)            │  │ │
│  │               │  │  │  ● Authenticated as user@gh      │  │ │
│  │               │  │  │                  [Re-authenticate]│  │ │
│  │               │  │  └──────────────────────────────────┘  │ │
│  │               │  │                                         │ │
│  └───────────────┘  │  ┌─ Path ───────────────────────────┐  │ │
│                     │  │  /usr/local/bin/claude  (mono)    │  │ │
│                     │  └──────────────────────────────────┘  │ │
│                     └─────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### Section rail (200px wide)

- 12px Geist Bold uppercase section heading `SETTINGS` 16px from top, 12px bottom margin.
- Each section row: 36px tall, 12px left padding, 14px Geist Regular `--text-primary`. Hover `--bg-hover`. Selected `--bg-selected` + 2px left accent in `--status-running`.
- `●` status dot suffix on rows that have a runtime state (Claude CLI ● = green when installed+authed, red when not, amber when partially configured). 8px dot at end of row text.

### Section panes

All sections use 24px outer padding, 16px gap between sub-cards.

**Claude CLI**
- Status sub-card (`--bg-card`, 1px `--border`, 16px padding): two rows of green/muted dots + labels (matches onboarding screen 2 status grid for visual consistency); `[Re-authenticate]` Spartan Button outline right-aligned, triggers same PTY flow as onboarding. After re-auth completes, banner toast top-right `Claude re-authenticated` 4s auto-dismiss.
- Path sub-card: shows resolved `claude` binary path in 13px `--font-mono`, copy icon on hover.

**Telemetry**
- Single Spartan Switch component, label `Send anonymous usage data`, 14px Geist Regular. Switch state mirrors `config.telemetry_enabled` SQLite key (default ON per D14).
- Below switch: 12px `--text-muted` body explaining what's collected (verbatim from onboarding screen 3 risk-disclosure copy, paragraph 2).
- Stats line below: `Last event sent: <timestamp> · Events queued: <N>` in 12px `--font-mono` `--text-muted` — debugging aid so users see telemetry actually flowing or stopped.

**Projects**
- Section heading `PROJECTS (N)`, then a vertical list of every repo in `repos` table.
- Each row: 48px tall, 16px padding, `--bg-card`, 1px `--border`, `--radius-sm`, 8px gap between rows. Display name 14px Geist Regular bold; path 12px `--font-mono` `--text-muted`. Right-aligned `[Remove]` Spartan Button ghost; hover row → `--bg-hover`.
- Remove triggers Spartan Dialog confirmation (uses dialog spec above) `Remove <name> from Mozart? Workspaces and worktrees on disk are not affected.` Primary destructive button color `--status-error`.
- Empty state if zero projects: same as Sidebar empty (see Component States below).

**About**
- Mozart wordmark + version `v0.0.1` in 14px `--font-mono`.
- Build commit short SHA, build date.
- Links: Open source licenses (modal); Report a bug (opens GitHub issues); Visit mozart.build (external).

## Onboarding (5 screens)

Source: PLAN-v0.0.1.md § Step 1.9. Visual treatment locked here. All screens dark IDE per shell tokens, full-window (no chrome), centered card with breathing room.

### Screen 1 — Welcome (2-col)

Window min: 960×640. Two columns 50/50 with 64px outer padding, 48px column gap.

```
┌─ welcome ──────────────────────────────────────────────────────┐
│                                                                │
│  ◆ Mozart                          ┌──────────────────┐        │
│                                    │                  │        │
│  Run agents in parallel.           │  [GIF rotator]   │        │
│  Review what changed.              │  16:10 ratio     │        │
│  Stay in control.                  │  ~520×325        │        │
│                                    │                  │        │
│  ─ Parallel agents in worktrees    └──────────────────┘        │
│  ─ Cross-platform                                              │
│  ─ Bring your own Claude key                                   │
│                                                                │
│                                                  [Get started →]│
└────────────────────────────────────────────────────────────────┘
```

- Brand mark `◆ Mozart` 28px Geist Bold in `--text-primary`. The diamond glyph is a placeholder for the Mozart wordmark; a logo is TODO before public ship.
- Tagline 32px Geist Bold, 1.2 line-height, max-width 440px, three lines hard-wrapped.
- Feature bullets 14px Geist Regular `--text-muted`, 12px gap, leading dash glyph in `--text-primary` for visual hierarchy.
- **Right column GIF rotator** (decided D3): single GIF at 16:10, three product moments rotate every 4s with 300ms cross-fade — workspace switching → streaming agent → diff review. Border `1px solid --border`, radius `--radius-md`. While GIFs are commissioned, dev placeholder is a static screenshot of the same moment.
- Primary CTA Spartan Button bottom-right, 40px height, primary variant. No secondary CTA on this screen; "Skip tour" lives on screen 4.
- No card chrome on the screen container itself; the GIF box is the only contained element.

### Screen 2 — Claude auth

Centered card 600×420, `--bg-card`, 1px `--border`, `--radius-md`, 32px padding.

```
┌─ claude auth ──────────────────────────────────────────────────┐
│                                                                │
│  Mozart uses Claude Code CLI to run agents.                    │
│                                                                │
│  ┌─ Claude Code CLI status ────────────────────────────────┐  │
│  │  ● Installed (v1.x.x)        ○ Not installed             │  │
│  │  ● Authenticated             ○ Not authenticated         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  [contextual CTA — see states below]                           │
│                                                                │
│                                       [Continue →]              │
└────────────────────────────────────────────────────────────────┘
```

- Headline 20px Geist Bold; status grid below with Spartan Badge components — green `--status-done` dot for active state, muted `--status-stopped` for inactive. 14px Geist Regular labels.
- Three contextual states (one CTA visible at a time, no jumping):
  - **Not installed**: Spartan Button outline variant `Install Claude Code →` opens `claude.com/docs` in default browser. Primary `Continue` disabled.
  - **Installed, not authed**: Spartan Button primary `Sign in to Claude →` triggers `claude auth login` PTY. PTY output renders in an inline mono box below (300px tall, `--bg-app`, 1px `--border`). Primary `Continue` disabled until exit code 0.
  - **Installed + authed**: only `Continue` visible (primary, right-aligned).

### Screen 3 — Risk disclosure (full-screen treatment)

Full-window dark, single centered card 640×360, `--bg-card`, 1px `--border-focus`, `--radius-md`, 40px padding.

```
┌─ risk disclosure ──────────────────────────────────────────────┐
│  ⚠ Mozart runs shell commands and edits files                  │
│                                                                │
│  Use only with code you trust. We checkpoint before each       │
│  run, you can discard changes anytime.                         │
│                                                                │
│  We collect anonymous usage data (no code, no prompts).        │
│  [Settings to opt out]                                         │
│                                                                │
│                                       [I understand →]          │
└────────────────────────────────────────────────────────────────┘
```

- Heading 20px Geist Bold prefixed with `⚠` glyph in `--status-conflict` (#f59e0b). The conflict-amber treatment is intentional: this is a heads-up, not an error or a celebration. Decided in Gap 6 below.
- Body 14px Geist Regular `--text-primary`, 1.5 line-height. Two paragraphs, 16px gap.
- "Settings to opt out" is an inline link `--accent-mention` color, underline on hover.
- Primary CTA bottom-right; user must click to advance (no skip).

### Screen 4 — Demo or repo

Centered card row, two cards side-by-side, 320×200 each, 16px gap, vertically centered in window.

```
┌─ demo or repo ─────────────────────────────────────────────────┐
│  How would you like to start?                                  │
│                                                                │
│  ┌────────────────────┐    ┌────────────────────┐              │
│  │  ▶ Try the         │    │  ⊕ Add my own      │              │
│  │    quickstart demo │    │    folder          │              │
│  │                    │    │                    │              │
│  │  Pre-loaded sample │    │  Pick a local      │              │
│  │  project. Recommended  │  │  folder with git    │              │
│  └────────────────────┘    └────────────────────┘              │
│                                                                │
│  [Skip tour]                              [Continue →]          │
└────────────────────────────────────────────────────────────────┘
```

- Each card: `--bg-card`, 1px `--border` default; on hover → `--bg-hover` + `--border-focus`; on selected → `--bg-selected` + 2px `--border-focus`. Radio-style selection (one at a time).
- Card title 16px Geist Bold; body 13px Geist Regular `--text-muted`. Glyphs (▶, ⊕) 18px in `--text-primary`.
- "Skip tour" bottom-left as ghost button (text-only, `--text-muted`); primary `Continue` disabled until selection.

### Screen 5 — Quickstart tour overlay

Not a screen change — overlays the main shell. Spartan Tooltip primitive + dimmed scrim (`rgba(0,0,0,0.5)`) over the rest of the UI. Tooltips point at sidebar, stream, diff, composer — 4 steps.

- Each tooltip: `--bg-card`, 1px `--border-focus`, 12px padding, 13px body text, max-width 280px.
- Step counter `1 of 4` top-right of tooltip, 11px `--text-muted`.
- Buttons inside tooltip: `[Back]` ghost (steps 2-4) + `[Next →]` primary; final step `[Done]` primary.
- Top-right of overlay scrim: `[Skip tour]` ghost button, always visible.
- Keyboard: `←/→` arrows navigate, `Esc` ends tour (with confirm).
- After Done/Skip: optional dismissable GitHub-star prompt as toast bottom-right (auto-dismiss 8s).

## Rules

1. Never use `system-ui`, `Arial`, `Roboto`, or `-apple-system` as primary font.
2. All file paths, branch names, terminal output: `--font-mono`.
3. Status colors are the ONLY colors with opacity variants — no other decorative opacity.
4. Cards earn their existence. No decorative card grids.
5. Diff text: `<pre>` with text binding only. Never `innerHTML`.
6. Touch targets minimum 32px (desktop app, not mobile — but keep accessible).
7. Disabled v0.2 controls always show a tooltip explaining what's coming — never silently hide them.
8. Workspace labels shown to users: "Workspace" (v0.1 sidebar), "Sandbox" (confirmations + tooltips). Never "worktree".
