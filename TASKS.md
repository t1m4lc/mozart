# TASKS.md — Atomic implementation backlog

## SQLite sweep — follow-ups

Carved out of the S2-S5 SQLite sweep (commits `a29c234` → `746aca8`).
Both are deliberate non-goals of that sweep and stay tracked here:

- **Multi-chat tab-bar wiring.** `domains/workspaces/ui/workspace-tab-bar/`
  still owns its own `signal<WorkspaceTab[]>` internally. The chat
  domain now supports N≤4 chats per workspace in the DB
  (`chats`, `workspace_active_chat`), and `ChatFacade` exposes
  `hydrate / setActive / createChat / renameChat / closeChat` flows
  via the adapter — but no smart wrapper drives the tab bar from
  these yet. Add a `domains/chat/feature-workspace-tab-bar/` smart
  component that hydrates on workspace open, bridges drag-reorder
  and "+ chat" intents to the facade, and lets a tab switch repoint
  `workspace_active_chat`.

- **Orphaned-run replay on boot.** If the app is force-quit mid-stream,
  the assistant `Message` row stays in `status='streaming'` forever
  and its content/timeline aren't flushed past the last 200ms tick.
  Either (a) on `ChatFacade.hydrate`, scan
  `messages WHERE status IN ('streaming','pending')` and mark them
  `'error'`, or (b) replay their `agent_events` (via a new
  `list_events_by_run` command) to rebuild the timeline from the
  authoritative event log. Defer to v0.0.2 unless a user reports the
  stale-streaming bubble.
