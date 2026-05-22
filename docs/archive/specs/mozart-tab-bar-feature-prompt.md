# Mozart – Tab Bar Feature Prompt

## Context

Explore the codebase to understand the existing structure before implementing anything:

- Locate the breadcrumb bar component and its parent layout
- Find the theme file to extract the primary color (violet) token
- Identify naming conventions, existing component patterns (dumb vs smart), and state management approach
- Check if there is an icon library already in use (e.g. Lucide, Heroicons, Radix)
- Read any existing workspace/project types so the tab model fits the data shape

---

## Goal

Implement a **tab bar** placed directly **below the breadcrumb bar**. Tabs represent open items in the workspace — currently only **chats**, but the architecture must support **file tabs** in the future (read-only, non-closeable, non-renameable, different icon).

Create a **single dumb component** (`WorkspaceTabBar` or similar) that owns its state internally for now. Do not wire up a global store yet.

---

## Tab Bar — Specification

### Layout & Constraints

- Horizontal tab strip, full width, sitting directly under the breadcrumb bar
- **Maximum 4 tabs** open simultaneously
- Tabs are left-aligned; a single **"New chat"** icon button is pinned to the **far right**
  - Tooltip on hover top: `"New chat, same workspace"`
  - Disabled and visually muted when 4 tabs are already open

### Tab Anatomy (Chat Tab)

Each chat tab must display:

1. **LLM icon** — icon that corresponds to the **last LLM used** in that chat (use a sensible placeholder/default for a new chat). Map each supported LLM to a distinct visual (just claude icon for now).
2. **Title** — defaults to `"Untitled"`. Automatically set to a generated title on the **first user prompt** (you can emit an `onFirstPrompt` callback or leave a `TODO` hook — do not implement the AI title generation itself).
3. **Active indicator** — the currently active tab has a bottom or left border using the **primary violet color from the theme token**. No filled background — just the accent border.

### Hover State (Chat Tab only)

On hover, reveal two icon buttons inside the tab:

- **Pen icon** → enters **rename mode**
  - The tab title becomes an `<input>` pre-filled with the current title and auto-focused
  - Pressing `Enter` or blurring the input saves the new title and exits rename mode
  - Pressing `Escape` cancels and exits rename mode without saving
- **✕ (close) icon** → closes/removes the tab
  - **Disabled** (non-clickable, reduced opacity) while a prompt is in progress in that chat (`isStreaming` flag or equivalent)
  - **Hidden** when only **one chat tab** remains (prevent closing the last chat)

### File Tab (future-proof — implement the variant now, even if not routed yet)

- Different icon (e.g. a file/code icon) instead of the LLM icon
- **No close button** (not even on hover)
- **No rename** (pen icon hidden on hover)
- Title is the filename — immutable in the UI

---

## Empty State — First Chat in a Workspace

When a workspace is **freshly created** and the first (and only) chat tab is open with **no messages yet**, render an **empty state panel** in the main chat area instead of the message list.

The empty state must contain:

### Callout / Citation Block

Styled as a prominent callout or blockquote:

> **You are in a new chat of "_{projectName}_" called "_{workspaceName}_"**

### Info List

Below the callout, a vertical list of 3 items, each prefixed by an icon:

| Icon                    | Content                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `GitBranch`             | Branched <kbd>username/workspace-branch</kbd> from <kbd>target-branch</kbd> |
| `Folder`                | _workspaceName_ workspace with **{numberOfFiles}** files                    |
| `Terminal` / `$` (bash) | Completed setup script                                                      |

- Branch names must be wrapped in `<kbd>` elements (styled as inline code chips using the existing theme).
- Use the icon library already present in the project.

---

## State Shape (internal to the component, provisional)

```ts
type TabKind = 'chat' | 'file'

interface ChatTab {
  id: string
  kind: 'chat'
  title: string              // default: 'Untitled'
  llmId: string | null       // last LLM used; null = new chat
  isStreaming: boolean        // true while a prompt response is in flight
  hasMessages: boolean        // false = show empty state
}

interface FileTab {
  id: string
  kind: 'file'
  title: string              // filename, immutable
  filePath: string
}

type WorkspaceTab = ChatTab | FileTab

interface TabBarState {
  tabs: WorkspaceTab[]
  activeTabId: string
}
```

Initialize with **one empty ChatTab** when the component mounts.

---

## Component Architecture

```
WorkspaceTabBar            ← dumb, owns TabBarState internally
  ├── TabItem              ← renders one tab (chat or file variant)
  │     ├── LlmIcon        ← icon mapped from llmId
  │     ├── TabTitle       ← static label OR rename <input>
  │     ├── PenIconButton  ← chat only, hover only
  │     └── CloseIconButton← chat only, hover only, conditionally hidden/disabled
  └── NewChatButton        ← far right, disabled at max tabs

ChatEmptyState             ← rendered inside the chat area when hasMessages=false
  ├── WorkspaceCallout
  └── WorkspaceInfoList
        ├── BranchInfo     ← uses <kbd>
        ├── FilesInfo
        └── SetupInfo
```

---

## Styling Rules

- Use existing theme tokens exclusively — do not hardcode colors
- Primary / accent color for the active tab border = the violet defined in the theme (find and use the correct token)
- Tabs should have a fixed minimum width with text truncation (`text-overflow: ellipsis`) to stay readable at max count
- Rename input should match the tab text style (same font, size) — visually seamless
- Hover state transitions should be quick (≤ 150 ms)
- `<kbd>` chips: use the theme's code/mono font, subtle background, rounded corners

---

## Constraints & Notes

- Do **not** implement global state management yet — keep all state local to `WorkspaceTabBar`
- Do **not** implement the AI-generated title logic — leave a clearly marked `TODO` comment with the hook
- Do **not** implement actual file-opening routing — the `FileTab` type and rendering must exist but navigation wiring is out of scope
- Match all existing naming conventions, file structure, and import aliases found in the codebase
- Add a short JSDoc or comment block on the component explaining the provisional state note and the file-tab future extension point
