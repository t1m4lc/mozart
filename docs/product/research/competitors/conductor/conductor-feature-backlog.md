# Conductor Feature Backlog

Reference: https://www.conductor.build/changelog  
Last fetched: 2026-05-09 (via `curl.md https://www.conductor.build/changelog`)  
Purpose: Track Conductor's shipped features, decide which to copy and in which version.

**Columns:**
- **Copy?** — `[ ]` not planned | `[x]` planned | `[-]` explicitly skipped
- **Priority** — `P1` ship with v0.1 | `P2` v0.2 | `P3` v0.3+ | `skip`

> Ordered chronologically (oldest → newest). Bugfixes omitted.

| Version | Date | Feature | Description | Copy? | Priority |
|---------|------|---------|-------------|-------|----------|
| 0.0.16 | Jul 18, 2025 | Terminal session persistence | Terminal sessions persist when navigating between workspaces | [x] | P1 |
| 0.0.17 | Jul 19, 2025 | GitHub integration | Connect GitHub account; add private repos; start on issues in one click | [ ] | P3 |
| 0.0.17 | Jul 19, 2025 | Native shell | Terminal uses user's native shell instead of forcing zsh | [x] | P1 |
| 0.0.17 | Jul 19, 2025 | ⌘N new workspace shortcut | Keyboard shortcut to open a new workspace in current repo | [x] | P1 |
| 0.0.20 | Jul 22, 2025 | File/image attachments | Attach files and images to chat messages | [ ] | P2 |
| 0.0.21 | Jul 22, 2025 | Fine-grained GitHub permissions | Granular GitHub OAuth permission scopes | [ ] | P3 |
| 0.1.0 | Jul 24, 2025 | MCP server support | Connect external MCP servers to agents | [ ] | P3 |
| 0.1.0 | Jul 24, 2025 | Message queue | Queue messages while agent is running | [x] | P1 |
| 0.1.1 | Jul 25, 2025 | Slash commands | /commands in chat (e.g. /clear, /review, /plan) | [x] | P1 |
| 0.1.1 | Jul 25, 2025 | Custom LLM providers | Bring your own API endpoint / custom provider | [ ] | P2 |
| 0.2.0 | Jul 29, 2025 | Local repository support | Add and manage local (non-GitHub) git repos | [x] | P1 |
| 0.2.0 | Jul 29, 2025 | Multi-agent management | Create, list, stop multiple agents per workspace | [x] | P1 |
| 0.3.0 | Aug 2, 2025 | Git diff view | View file diffs produced by agent directly in app | [x] | P1 |
| 0.3.2 | Aug 5, 2025 | Opus 4.1 model | Claude Opus 4.1 available as model choice | [x] | P1 |
| 0.3.2 | Aug 5, 2025 | Drag to reorder repos | Drag repos in sidebar to change order | [ ] | P2 |
| 0.5.0 | Aug 7, 2025 | GPT-5 model | OpenAI GPT-5 available | [-] | skip |
| 0.6.0 | Aug 9, 2025 | Dark minimal UI redesign | New clean dark aesthetic across whole app | [x] | P1 |
| 0.7.2 | Aug 19, 2025 | Attach terminal context | Add current terminal output as chat context | [ ] | P2 |
| 0.7.3 | Aug 22, 2025 | Plan mode | Agent presents a plan before executing; user reviews before proceeding | [x] | P1 |
| 0.8.0 | Aug 25, 2025 | Linear integration | Connect Linear workspace; start on issues from Conductor | [ ] | P3 |
| 0.8.1 | Aug 25, 2025 | Suggested git actions | After agent finishes, app suggests relevant git actions (commit, PR) | [ ] | P2 |
| 0.9.0 | Sep 1, 2025 | Run/setup scripts | Define setup and run scripts per repo, executed by agent on start | [ ] | P2 |
| 0.9.0 | Sep 1, 2025 | Hooks | Custom hooks triggered by agent lifecycle events | [ ] | P3 |
| 0.9.0 | Sep 1, 2025 | Custom fonts | User-selectable font in settings | [ ] | P2 |
| 0.9.3 | Sep 6, 2025 | Diff review panel | Dedicated side panel showing diffs as agent works | [x] | P1 |
| 0.10.0 | Sep 8, 2025 | Code review workflow | Send diff to Claude for code review; shows inline suggestions | [ ] | P2 |
| 0.10.1 | Sep 9, 2025 | Checkout PRs in-app | Open and checkout any PR directly from Conductor | [ ] | P3 |
| 0.10.2 | Sep 10, 2025 | Big terminal mode | Toggle expanded full-height terminal panel (⌘⇧T) | [x] | P1 |
| 0.11.0 | Sep 19, 2025 | conductor.json config | Per-repo config file controlling Conductor behavior | [ ] | P2 |
| 0.12.0 | Sep 25, 2025 | Forward failing CI checks | Automatically send failing GitHub Actions output to Claude | [ ] | P3 |
| 0.12.1 | Sep 27, 2025 | Improved plan mode | Claude asks clarifying questions during planning | [x] | P1 |
| 0.13.2 | Sep 29, 2025 | Sonnet 4.5 | Claude Sonnet 4.5 available | [x] | P1 |
| 0.13.2 | Sep 29, 2025 | New workspace page | Dedicated workspace overview page | [ ] | P2 |
| 0.13.6 | Sep 30, 2025 | Bedrock / Vertex support | Run agents on AWS Bedrock or Google Vertex | [-] | skip |
| 0.14.0 | Oct 14, 2025 | Command palette | ⌘K command palette for quick navigation and actions | [ ] | P2 |
| 0.14.1 | Oct 7, 2025 | New diff viewer | Redesigned diff viewer with better rendering | [x] | P1 |
| 0.14.6 | Oct 10, 2025 | Markdown preview | Toggle markdown preview for chat messages and notes | [ ] | P2 |
| 0.14.7 | Oct 11, 2025 | Git diff improvements | Better handling of large diffs, renamed files, binary files | [x] | P1 |
| 0.15.0 | Oct 17, 2025 | Linear deep integration | View, filter and link Linear issues inside Conductor | [ ] | P3 |
| 0.15.1 | Oct 18, 2025 | Claude thinking mode | Show Claude's extended thinking / reasoning in UI | [ ] | P2 |
| 0.15.2 | Oct 20, 2025 | Create workspace from PR | One-click new workspace from an existing GitHub PR | [ ] | P3 |
| 0.16.0 | Oct 21, 2025 | Diff viewer + file explorer | Combined panel: browse files and diffs in same view | [ ] | P2 |
| 0.17.0 | Oct 24, 2025 | Multiple chats per workspace | Open several chat tabs per workspace; switch between them | [ ] | P2 |
| 0.17.4 | Oct 28, 2025 | Git status in sidebar | Workspace sidebar shows current git status indicator | [x] | P1 |
| 0.17.5 | Oct 28, 2025 | Tab polish | Visual cleanup of workspace/chat tabs | [ ] | P2 |
| 0.18.0 | Oct 31, 2025 | Codex (OpenAI) agent | OpenAI Codex as alternative agent to Claude | [-] | skip |
| 0.19.0 | Nov 5, 2025 | Checkpoints | Save and restore agent session state at any point | [ ] | P2 |
| 0.20.0 | Nov 7, 2025 | File picker | Browse and attach files to chat via visual picker | [ ] | P2 |
| 0.20.0 | Nov 7, 2025 | AI-generated chat titles | Agent auto-names chat tabs based on content | [ ] | P2 |
| 0.21.0 | Nov 10, 2025 | Plan mode v2 | Full plan-review-approve loop before agent executes | [x] | P1 |
| 0.22.0 | Nov 12, 2025 | Code review workflow v2 | Review all changes with Claude; historical diff comparison | [ ] | P2 |
| 0.22.0 | Nov 12, 2025 | Historical diffs | Browse diffs from any past point in the session | [ ] | P2 |
| 0.22.4 | Nov 18, 2025 | Expand terminal panel | Resizable/expandable terminal in workspace | [x] | P1 |
| 0.22.4 | Nov 18, 2025 | Environment variables | Per-repo env var management passed to agents | [ ] | P2 |
| 0.22.6 | Nov 20, 2025 | Conversation summaries | Auto-summarize long conversations for context compaction | [ ] | P2 |
| 0.22.6 | Nov 20, 2025 | Custom review model | Choose which model does code review (separate from chat) | [ ] | P2 |
| 0.22.7 | Nov 21, 2025 | Send plan to new chat | Transfer agent plan to a fresh chat tab for handoff | [ ] | P2 |
| 0.23.0 | Nov 24, 2025 | Opus 4.5 | Claude Opus 4.5 available | [x] | P1 |
| 0.23.3 | Nov 26, 2025 | Repo details page | Settings/details page per repository | [ ] | P2 |
| 0.24.0 | Dec 2, 2025 | Quick Start | One-click project initialization from template or blank | [ ] | P2 |
| 0.25.0 | Dec 3, 2025 | Workspace storage improvements | Faster workspace load, better storage management | [ ] | P2 |
| 0.25.0 | Dec 3, 2025 | AI response metadata | Show token count, model, latency below each response | [ ] | P2 |
| 0.25.0 | Dec 3, 2025 | Slash commands v2 | Extended slash command system with autocomplete | [x] | P1 |
| 0.25.6 | Dec 10, 2025 | Multiple git repos per workspace | Attach more than one repo to a single workspace | [ ] | P3 |
| 0.25.6 | Dec 10, 2025 | Fork workspace | Duplicate a workspace (branch, chat history, context) | [ ] | P2 |
| 0.25.7 | Dec 11, 2025 | Vercel CI status checks | See Vercel deployment status in Checks tab | [ ] | P3 |
| 0.25.11 | Dec 13, 2025 | Fetch GitHub comments | Pull PR review comments from GitHub into app | [ ] | P3 |
| 0.25.11 | Dec 13, 2025 | Mark workspace as unread | Manually flag a workspace for follow-up | [ ] | P2 |
| 0.26.0 | Dec 17, 2025 | Workspace search | Search workspaces by branch name, repo, or PR number (⌘⇧F) | [ ] | P3 |
| 0.26.0 | Dec 17, 2025 | Click file paths in chat | Clicking file paths mentioned by agents opens them in-app | [ ] | P2 |
| 0.26.0 | Dec 17, 2025 | PR number in sidebar | PR number shown next to workspace in left sidebar | [ ] | P3 |
| 0.27.0 | Dec 18, 2025 | Scratchpad/notes tab | Notes tab per workspace, shareable with agents via `<notes>` tag | [ ] | P2 |
| 0.27.0 | Dec 18, 2025 | Customizable mono font | User can pick monospace font in Settings → Appearance | [ ] | P2 |
| 0.27.0 | Dec 18, 2025 | Mermaid diagrams | Mermaid diagram rendering in chat responses | [ ] | P3 |
| 0.27.1 | Dec 19, 2025 | Clickable file mentions | Clicking @file mentions opens the file inline | [ ] | P2 |
| 0.28.0 | Dec 22, 2025 | Workspace history page | Page showing all past workspaces with filtering by status/repo | [ ] | P2 |
| 0.28.0 | Dec 22, 2025 | Context indicator | Shows remaining token space in composer | [ ] | P2 |
| 0.28.0 | Dec 22, 2025 | Interactive plan mode | Claude asks clarifying questions before starting; user reviews plan | [ ] | P2 |
| 0.28.0 | Dec 22, 2025 | .context folder | Shared folder in each workspace for attachments/plans/notes visible to agents | [ ] | P3 |
| 0.28.0 | Dec 22, 2025 | Keyboard navigation in chat | Arrow keys or vim-style j/k navigation | [ ] | P3 |
| 0.28.0 | Dec 22, 2025 | WYSIWYG notes | Rich markdown preview in notes/scratchpad tab | [ ] | P2 |
| 0.28.0 | Dec 22, 2025 | Instant GitHub PR viewing | View PRs directly inside app without browser | [ ] | P3 |
| 0.28.1 | Dec 23, 2025 | Working directory for monorepos | Set custom working dir per workspace (monorepo support) | [ ] | P2 |
| 0.28.4 | Dec 30, 2025 | Todos with merge gate | Agent creates todos; workspace blocked from merge until all checked | [ ] | P3 |
| 0.28.4 | Dec 30, 2025 | GetWorkspaceDiff tool | Claude can read the workspace diff via built-in tool | [x] | P1 |
| 0.28.4 | Dec 30, 2025 | Non-QWERTY keyboard support | Shortcuts respect Colemak/Dvorak/international layouts | [ ] | P2 |
| 0.29.0 | Jan 7, 2026 | In-diff commenting | Claude Code tool to comment directly on diffs | [ ] | P3 |
| 0.29.0 | Jan 7, 2026 | GitHub comment sync | GitHub PR comments appear in app with author avatars | [ ] | P3 |
| 0.29.2 | Jan 9, 2026 | Deployments tab | View Vercel and GitHub deployment status in-app | [ ] | P3 |
| 0.29.2 | Jan 9, 2026 | Thinking level toggle | Simple on/off thinking toggle (⌥T) | [ ] | P2 |
| 0.29.3 | Jan 10, 2026 | Simplified composer | `+` icon for attachments and issue search in composer | [ ] | P2 |
| 0.29.4 | Jan 12, 2026 | Checks tab | Monitor GitHub Actions, deployments, todos in one tab | [ ] | P3 |
| 0.29.4 | Jan 12, 2026 | Comprehensive keyboard shortcuts | Review (⌘⇧R), Fix errors (⌘⇧X), Open in GitHub (⌘⇧G), etc. | [ ] | P2 |
| 0.29.4 | Jan 12, 2026 | Shortcut cheatsheet | ⌘/ shortcut to show all shortcuts | [ ] | P2 |
| 0.30.0 | Jan 13, 2026 | Chrome browser integration | Claude can test, browse, and screenshot using Chrome | [ ] | P3 |
| 0.30.0 | Jan 13, 2026 | Hand off plans to another agent | Quick transfer of a plan to a different agent in the same workspace | [ ] | P3 |
| 0.31.0 | Jan 15, 2026 | In-chat search | ⌘F to search within chat history | [ ] | P2 |
| 0.31.0 | Jan 15, 2026 | Edit scripts in settings | Directly edit setup/run scripts from settings UI | [ ] | P2 |
| 0.31.0 | Jan 15, 2026 | Customizable workspace storage | User picks where workspaces are stored on disk | [x] | P1 |
| 0.31.1 | Jan 16, 2026 | /restart command | Restart the Claude Code process from chat | [x] | P1 |
| 0.31.2 | Jan 17, 2026 | Per-repo agent instructions | Add persistent instructions for agents in settings, per repository | [x] | P1 |
| 0.32.0 | Jan 22, 2026 | Attach GitHub issues | Paste GitHub issue links into chat as structured context | [ ] | P3 |
| 0.32.0 | Jan 22, 2026 | Continue on new branch | Start a new feature in the same workspace after a branch lands | [ ] | P2 |
| 0.32.0 | Jan 22, 2026 | Chat table of contents | Navigate long chats via a TOC sidebar | [ ] | P3 |
| 0.33.0 | Jan 27, 2026 | Tasks feature | Claude organizes work as structured tasks (not just text) | [ ] | P3 |
| 0.33.0 | Jan 27, 2026 | Multi-select Claude questions | Claude can ask multi-select questions, not just free text | [ ] | P2 |
| 0.33.0 | Jan 27, 2026 | Context usage breakdown | Hover on context meter to see token usage breakdown by category | [ ] | P2 |
| 0.33.3 | Jan 29, 2026 | Right-click context menu (files) | Right-click files in sidebar for actions | [ ] | P2 |
| 0.34.0 | Feb 5, 2026 | Mermaid fullscreen | Mermaid diagrams expandable to fullscreen view | [ ] | P3 |
| 0.34.0 | Feb 5, 2026 | Deeplinks clickable in chat | Linear, Slack, VS Code deeplinks clickable from AI responses | [ ] | P3 |
| 0.34.2 | Feb 10, 2026 | Chat summaries | Chat summaries with hover overview of what happened | [ ] | P2 |
| 0.34.2 | Feb 10, 2026 | LaTeX support | LaTeX rendering in chat responses | [ ] | P3 |
| 0.34.2 | Feb 10, 2026 | Re-run failed CI | Button to re-run failed GitHub Actions checks in-app | [ ] | P3 |
| 0.35.0 | Feb 11, 2026 | Workspaces by status | Organize workspaces into backlog/in progress/in review/done columns | [ ] | P2 |
| 0.35.0 | Feb 11, 2026 | PR title as workspace label | Workspace automatically labeled with PR title when available | [ ] | P3 |
| 0.35.0 | Feb 11, 2026 | Group workspaces by repo | Option to group workspaces under their repository in sidebar | [ ] | P2 |
| 0.36.0 | Feb 17, 2026 | Pierre Diffs engine | Replaced default diff viewer with more accurate Pierre Diffs | [ ] | P2 |
| 0.36.2 | Feb 18, 2026 | Change default model from picker | Model picker lets user set new default model inline | [ ] | P2 |
| 0.36.3 | Feb 23, 2026 | Version manager support | Terminal respects mise/asdf/rbenv for tool versions | [ ] | P2 |
| 0.36.5 | Feb 26, 2026 | Open from Linear | Open Conductor workspace directly from a Linear issue | [ ] | P3 |
| 0.36.5 | Feb 26, 2026 | GitHub issues in create workspace | See and select GitHub issues when creating a new workspace | [ ] | P3 |
| 0.37.0 | Mar 3, 2026 | Built-in file editor | Edit files directly in Conductor with syntax highlighting and ⌘F | [ ] | P2 |
| 0.38.0 | Mar 5, 2026 | Edit before sending review | Right-click review button to edit the review prompt before sending | [ ] | P2 |
| 0.38.0 | Mar 5, 2026 | Search by chat title | Command palette can search by chat title | [ ] | P2 |
| 0.38.3 | Mar 10, 2026 | Multiline diff comments | Click and drag to add comments spanning multiple lines | [ ] | P3 |
| 0.38.3 | Mar 10, 2026 | Stop idle Claude processes | Conductor stops idle Claude processes to reduce memory | [x] | P1 |
| 0.38.4 | Mar 10, 2026 | Extended context (1M) | Opus 4.6 1M token context model support | [ ] | P2 |
| 0.38.4 | Mar 10, 2026 | direnv support | Directory-based shell tools (direnv) work in terminal | [ ] | P2 |
| 0.39.0 | Mar 13, 2026 | Instant chat summarization | Chats auto-summarize for quick overview | [ ] | P2 |
| 0.39.0 | Mar 13, 2026 | Enhanced command palette | ⌘K with PR management, session navigation, content search | [ ] | P2 |
| 0.40.1 | Mar 16, 2026 | Fast mode | Faster model execution toggle (Opus 4.6 fast) | [ ] | P2 |
| 0.41.0 | Mar 19, 2026 | Tool approval settings | Per-tool approval settings (auto-approve specific tools) | [ ] | P2 |
| 0.41.0 | Mar 19, 2026 | /plan command | /plan to enter/exit plan mode from chat | [x] | P1 |
| 0.41.0 | Mar 19, 2026 | Expanded tool call view | Show all tool calls expanded by default ("Garry mode") | [ ] | P2 |
| 0.44.0 | Mar 24, 2026 | New simplified sidebar | Rebuilt sidebar with GitHub status at a glance | [ ] | P2 |
| 0.44.0 | Mar 24, 2026 | Checkpointing | Auto-checkpoint sessions so you can restore previous states | [ ] | P2 |
| 0.44.0 | Mar 24, 2026 | /add-dir | Link any local folder as context, not just workspace dirs | [ ] | P2 |
| 0.44.0 | Mar 24, 2026 | Permanent allow buttons | "Always allow" for MCP tools, web search, fetch | [ ] | P2 |
| 0.44.0 | Mar 24, 2026 | Resolve GitHub review comments | Resolve PR review comments from inside Conductor | [ ] | P3 |
| 0.45.0 | Apr 1, 2026 | Diff hover file preview | Syntax-highlighted file preview when hovering diffs | [ ] | P2 |
| 0.45.0 | Apr 1, 2026 | 60+ language syntax highlighting | Expanded from ~25 languages to 60+ in diffs and editor | [x] | P1 |
| 0.45.0 | Apr 1, 2026 | Automerge option | Experimental: automatically merge PR when CI passes | [ ] | P3 |
| 0.45.0 | Apr 1, 2026 | Plans attachable to chat | Add approved plans to chat context with one click | [ ] | P2 |
| 0.46.0 | Apr 5, 2026 | Instant archiving + History tab | Archive workspaces instantly; restore from History tab | [x] | P1 |
| 0.46.0 | Apr 5, 2026 | @terminal attachment | `@terminal` to attach current terminal output as context | [ ] | P2 |
| 0.48.0 | Apr 14, 2026 | Terminal session history | Terminal sessions restored on app restart | [ ] | P2 |
| 0.48.0 | Apr 14, 2026 | Custom terminal presets | Save terminal commands as named presets for quick launch | [ ] | P2 |
| 0.48.0 | Apr 14, 2026 | /mcp-status dialog | View and refresh MCP server status from within app | [ ] | P3 |
| 0.48.2 | Apr 16, 2026 | Claude Opus 4.7 | Opus 4.7 model available | [x] | P1 |
| 0.48.5 | Apr 18, 2026 | Effort level toggle | Toggle thinking/effort level (⌥T) | [ ] | P2 |
| 0.49.0 | Apr 22, 2026 | Drag files/folders into composer | Drag and drop files directly into prompt composer | [x] | P1 |
| 0.49.0 | Apr 22, 2026 | Non-blocking checkpoints | Checkpoints don't block the UI | [ ] | P2 |
| 0.50.0 | May 1, 2026 | Agent steering | Choose preferred follow-up behavior after agent completes | [ ] | P2 |
| 0.50.0 | May 1, 2026 | Line reference links | Agent messages include clickable line number references | [ ] | P2 |
| 0.50.0 | May 1, 2026 | Caffeinate while running | Keep Mac awake while agents are running | [x] | P1 |
| 0.50.0 | May 1, 2026 | Custom emoji project icons | Set emoji or custom icon per project in sidebar | [ ] | P2 |
| 0.50.0 | May 1, 2026 | ⌘J toggle terminal | Keyboard shortcut to show/hide terminal panel | [x] | P1 |
| 0.51.0 | May 5, 2026 | Managed settings file | Configure defaults via `~/.conductor/settings.json` | [ ] | P2 |
| 0.51.0 | May 5, 2026 | Accessible colors | Colorblind-friendly color mode in settings | [x] | P1 |
| 0.51.0 | May 5, 2026 | Code ligature toggle | Enable/disable font ligatures in code view | [ ] | P3 |
| 0.51.0 | May 5, 2026 | ⌘⏎ opposite behavior | Send with opposite of current follow-up setting | [ ] | P2 |
| 0.52.0 | May 7, 2026 | 9 syntax highlight themes | Catppuccin, Dracula, Nord, Tokyo Night, Gruvbox, Solarized, more | [ ] | P2 |
| 0.52.0 | May 7, 2026 | Guided sample project onboarding | Step-by-step onboarding with a demo project | [ ] | P2 |
| 0.52.0 | May 7, 2026 | Queued messages show reason | When message is queued, show why (agent busy, rate limit, etc.) | [x] | P1 |
| 0.52.0 | May 7, 2026 | Sound effects | SNCF jingle, Paris Métro chime, SF Muni, NYC MTA sounds | [ ] | P3 |
