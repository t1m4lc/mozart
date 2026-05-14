// One or more chats per workspace. The tab bar shows up to MAX_TABS;
// the sidebar Chats group lists every open chat across every workspace
// grouped by created_at bucket. `title` is what both surfaces render —
// "Start" for first-of-workspace, "Untitled" for `+ New chat`.
export interface Chat {
  readonly id: string;
  readonly workspaceId: string;
  readonly title: string;
  readonly createdAt: number;
}
