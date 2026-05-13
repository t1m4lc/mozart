// One chat per workspace in v0.0.1 (workspace_id is UNIQUE). The
// multi-chat-per-workspace expansion is v0.1.0 — we keep `id` as the
// chat-side primary key so the schema migration is a constraint relax,
// not a key rewrite.
export interface Chat {
  readonly id: string;
  readonly workspaceId: string;
  readonly createdAt: number;
}
